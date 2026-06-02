"""
AgentOps ML - Hallucination Detection Model
Uses Sentence-Transformers to encode (context, question) and (response),
computes cosine similarity as a hallucination proxy, then trains a
calibrated threshold classifier logged to MLflow.
"""

import os
import logging
import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    roc_auc_score, f1_score, precision_score, recall_score,
    classification_report, confusion_matrix
)
from sentence_transformers import SentenceTransformer
from ml.utils import load_conversations, MLFLOW_URI

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

EXPERIMENT_NAME = "hallucination_detection"
MODEL_NAME      = "hallucination_detector"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # Lightweight, fast, CPU-friendly


# ─────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────
def build_features(df: pd.DataFrame, encoder: SentenceTransformer) -> np.ndarray:
    """
    Feature vector for each conversation:
      - cosine_sim_context_response: semantic alignment of context ↔ response
      - cosine_sim_question_response: semantic alignment of question ↔ response
      - response_len_ratio: length ratio (too short/too long responses → suspect)
      - has_response: 1 if response non-empty, 0 otherwise
    """
    logger.info("Encoding texts with SentenceTransformer (this may take a moment)...")

    # Fill NaN text columns
    df = df.copy()
    df["context_text"]  = df["context_text"].fillna("").astype(str)
    df["user_question"] = df["user_question"].fillna("").astype(str)
    df["agent_response"] = df["agent_response"].fillna("").astype(str)

    ctx_emb  = encoder.encode(df["context_text"].tolist(),  batch_size=64, show_progress_bar=False)
    q_emb    = encoder.encode(df["user_question"].tolist(), batch_size=64, show_progress_bar=False)
    resp_emb = encoder.encode(df["agent_response"].tolist(),batch_size=64, show_progress_bar=False)

    def cosine_sim(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        norms_a = np.linalg.norm(a, axis=1, keepdims=True) + 1e-8
        norms_b = np.linalg.norm(b, axis=1, keepdims=True) + 1e-8
        return np.sum((a / norms_a) * (b / norms_b), axis=1)

    sim_ctx_resp = cosine_sim(ctx_emb,  resp_emb)
    sim_q_resp   = cosine_sim(q_emb,    resp_emb)

    resp_len      = df["agent_response"].str.len().fillna(0).values
    question_len  = df["user_question"].str.len().replace(0, 1).values
    len_ratio     = np.clip(resp_len / question_len, 0, 10)
    has_response  = (resp_len > 0).astype(float)

    features = np.column_stack([
        sim_ctx_resp,
        sim_q_resp,
        len_ratio,
        has_response,
    ])
    logger.info(f"Feature matrix shape: {features.shape}")
    return features


# ─────────────────────────────────────────────
# TRAINING PIPELINE
# ─────────────────────────────────────────────
def run_training():
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment(EXPERIMENT_NAME)

    logger.info("Loading conversation data...")
    df = load_conversations(min_rows=400)

    # Label: hallucination score > 0.15 → hallucinated (1)
    THRESHOLD = 0.15
    df["label"] = (df["hallucination_score"] > THRESHOLD).astype(int)
    logger.info(f"Label distribution:\n{df['label'].value_counts().to_string()}")

    logger.info(f"Loading SentenceTransformer: {EMBEDDING_MODEL}")
    encoder = SentenceTransformer(EMBEDDING_MODEL)

    X = build_features(df, encoder)
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    with mlflow.start_run(run_name="hallucination_lr_v1"):
        # Params
        params = {
            "hallucination_threshold": THRESHOLD,
            "embedding_model": EMBEDDING_MODEL,
            "classifier": "LogisticRegression",
            "C": 1.0,
            "max_iter": 1000,
            "train_size": len(X_train),
            "test_size":  len(X_test),
        }
        mlflow.log_params(params)

        # Pipeline: scaler + LR
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=1.0, max_iter=1000, random_state=42)),
        ])

        cv_scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring="roc_auc")
        logger.info(f"CV ROC-AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

        pipeline.fit(X_train, y_train)

        y_pred      = pipeline.predict(X_test)
        y_pred_prob = pipeline.predict_proba(X_test)[:, 1]

        metrics = {
            "roc_auc":   roc_auc_score(y_test, y_pred_prob),
            "f1_score":  f1_score(y_test, y_pred, zero_division=0),
            "precision": precision_score(y_test, y_pred, zero_division=0),
            "recall":    recall_score(y_test, y_pred, zero_division=0),
            "cv_roc_auc_mean": float(cv_scores.mean()),
            "cv_roc_auc_std":  float(cv_scores.std()),
        }
        mlflow.log_metrics(metrics)

        logger.info(f"Test Metrics: {metrics}")
        logger.info(f"\n{classification_report(y_test, y_pred, zero_division=0)}")

        # Log model to registry
        mlflow.sklearn.log_model(
            pipeline,
            artifact_path="hallucination_model",
            registered_model_name=MODEL_NAME,
        )
        logger.info(f"✅ Hallucination model registered as '{MODEL_NAME}' in MLflow")

    return metrics


if __name__ == "__main__":
    run_training()
