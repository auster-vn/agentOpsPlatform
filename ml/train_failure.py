"""
AgentOps ML - Agent Failure Prediction Model
XGBoost binary classifier that predicts whether an agent conversation
will fail (success=False) based on operational features.
"""

import os
import logging
import numpy as np
import pandas as pd
import mlflow
import mlflow.xgboost
import xgboost as xgb
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    roc_auc_score, f1_score, precision_score, recall_score,
    average_precision_score, classification_report
)
from ml.utils import load_conversations, MLFLOW_URI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

EXPERIMENT_NAME = "failure_prediction"
MODEL_NAME      = "failure_predictor"


# ─────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────
def build_features(df: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
    """Build feature matrix for failure prediction."""
    df = df.copy()

    # Encode agent_id categorically
    le = LabelEncoder()
    df["agent_id_enc"] = le.fit_transform(df["agent_id"].fillna("unknown"))

    # Derived features
    df["cost_per_token"]   = (df["cost"] / df["token_count"].replace(0, 1)).clip(0, 1)
    df["latency_per_token"]= (df["latency_ms"] / df["token_count"].replace(0, 1)).clip(0, 100)
    df["is_high_latency"]  = (df["latency_ms"] > 2000).astype(int)
    df["is_high_token"]    = (df["token_count"] > 1000).astype(int)
    df["has_tools"]        = (df["tool_count"] > 0).astype(int)
    df["many_tools"]       = (df["tool_count"] > 3).astype(int)

    feature_cols = [
        "latency_ms", "token_count", "cost", "tool_count",
        "agent_id_enc", "cost_per_token", "latency_per_token",
        "is_high_latency", "is_high_token", "has_tools", "many_tools",
    ]

    X = df[feature_cols].fillna(0)
    y = (~df["success"]).astype(int).values   # 1 = failure, 0 = success

    return X, y, feature_cols


# ─────────────────────────────────────────────
# TRAINING PIPELINE
# ─────────────────────────────────────────────
def run_training():
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment(EXPERIMENT_NAME)

    logger.info("Loading conversation data...")
    df = load_conversations(min_rows=500)

    X, y, feature_cols = build_features(df)
    logger.info(f"Failure rate: {y.mean():.3f} | Dataset size: {len(y):,}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Class imbalance weight
    pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)

    params = {
        "n_estimators":    300,
        "max_depth":       6,
        "learning_rate":   0.05,
        "subsample":       0.8,
        "colsample_bytree":0.8,
        "scale_pos_weight":pos_weight,
        "use_label_encoder":False,
        "eval_metric":     "aucpr",
        "random_state":    42,
        "n_jobs":          -1,
    }

    with mlflow.start_run(run_name="failure_xgboost_v1"):
        mlflow.log_params({**params, "train_size": len(X_train), "test_size": len(X_test),
                           "features": feature_cols})

        model = xgb.XGBClassifier(**params)
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=50,
        )

        y_pred      = model.predict(X_test)
        y_pred_prob = model.predict_proba(X_test)[:, 1]

        metrics = {
            "roc_auc":          roc_auc_score(y_test, y_pred_prob),
            "avg_precision":    average_precision_score(y_test, y_pred_prob),
            "f1_score":         f1_score(y_test, y_pred, zero_division=0),
            "precision":        precision_score(y_test, y_pred, zero_division=0),
            "recall":           recall_score(y_test, y_pred, zero_division=0),
        }
        mlflow.log_metrics(metrics)

        # Feature importance
        fi = dict(zip(feature_cols, model.feature_importances_))
        logger.info(f"Feature importances: {sorted(fi.items(), key=lambda x: -x[1])}")
        logger.info(f"\n{classification_report(y_test, y_pred, zero_division=0)}")
        logger.info(f"Test Metrics: {metrics}")

        mlflow.xgboost.log_model(
            model,
            artifact_path="failure_model",
            registered_model_name=MODEL_NAME,
        )
        logger.info(f"✅ Failure predictor registered as '{MODEL_NAME}' in MLflow")

    return metrics


if __name__ == "__main__":
    run_training()
