"""
AgentOps ML - Cost Forecasting Model
Uses XGBoost Regressor with time-series features (lag, rolling averages)
to forecast next-day token usage and cost per agent.
"""

import os
import logging
from datetime import datetime, date, timedelta

import numpy as np
import pandas as pd
import psycopg2
import mlflow
import mlflow.xgboost
import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from ml.utils import get_pg_conn, MLFLOW_URI, _synthetic_conversations

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

EXPERIMENT_NAME = "cost_forecasting"
MODEL_NAME      = "cost_forecaster"


# ─────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────
def load_daily_cost_series() -> pd.DataFrame:
    """Load or generate daily cost aggregates per agent."""
    conn = get_pg_conn()
    df = pd.read_sql("""
        SELECT
            DATE(event_timestamp) AS metric_date,
            agent_id,
            COUNT(*) AS request_count,
            SUM(cost) AS total_cost,
            SUM(token_count) AS total_tokens,
            AVG(latency_ms) AS avg_latency
        FROM fact_conversations
        WHERE event_timestamp IS NOT NULL
        GROUP BY DATE(event_timestamp), agent_id
        ORDER BY metric_date, agent_id
    """, conn)
    conn.close()

    # If insufficient time-series data, generate synthetic
    if len(df) < 50 or df["metric_date"].nunique() < 7:
        logger.warning("Insufficient time-series data. Generating synthetic daily series...")
        df = _generate_synthetic_daily_series()

    logger.info(f"Loaded {len(df):,} daily agent rows across {df['metric_date'].nunique()} dates.")
    return df


def _generate_synthetic_daily_series() -> pd.DataFrame:
    """Generate 90 days of realistic synthetic daily cost data."""
    agents     = ["support_agent", "coding_agent", "sales_agent", "hr_agent", "knowledge_agent"]
    base_costs = {"support_agent": 12.0, "coding_agent": 35.0, "sales_agent": 20.0,
                  "hr_agent": 5.0, "knowledge_agent": 18.0}
    base_reqs  = {"support_agent": 800, "coding_agent": 200, "sales_agent": 350,
                  "hr_agent": 120, "knowledge_agent": 280}
    base_toks  = {"support_agent": 400_000, "coding_agent": 900_000,
                  "sales_agent":   600_000, "hr_agent": 200_000, "knowledge_agent": 700_000}

    rows = []
    today = date.today()
    for d in range(90, -1, -1):
        metric_date = today - timedelta(days=d)
        is_weekend  = metric_date.weekday() >= 5
        day_factor  = 0.5 if is_weekend else 1.0
        trend       = 1.0 + (90 - d) * 0.003  # slight growth trend
        for agent in agents:
            noise = np.random.normal(1.0, 0.12)
            rows.append({
                "metric_date":   metric_date,
                "agent_id":      agent,
                "request_count": max(0, int(base_reqs[agent] * day_factor * trend * noise)),
                "total_cost":    max(0, base_costs[agent] * day_factor * trend * noise),
                "total_tokens":  max(0, int(base_toks[agent] * day_factor * trend * noise)),
                "avg_latency":   np.random.randint(400, 1800),
            })

    return pd.DataFrame(rows)


# ─────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────
def build_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add lag and rolling window features to the daily series."""
    from sklearn.preprocessing import LabelEncoder
    df = df.copy().sort_values(["agent_id", "metric_date"])
    df["metric_date"] = pd.to_datetime(df["metric_date"])

    le = LabelEncoder()
    df["agent_enc"] = le.fit_transform(df["agent_id"])

    for lag in [1, 2, 3, 7]:
        df[f"cost_lag_{lag}"]    = df.groupby("agent_id")["total_cost"].shift(lag)
        df[f"tokens_lag_{lag}"]  = df.groupby("agent_id")["total_tokens"].shift(lag)
        df[f"requests_lag_{lag}"]= df.groupby("agent_id")["request_count"].shift(lag)

    for window in [3, 7, 14]:
        df[f"cost_roll_{window}"]    = df.groupby("agent_id")["total_cost"].transform(
            lambda x: x.shift(1).rolling(window, min_periods=1).mean())
        df[f"tokens_roll_{window}"]  = df.groupby("agent_id")["total_tokens"].transform(
            lambda x: x.shift(1).rolling(window, min_periods=1).mean())
        df[f"cost_std_{window}"]     = df.groupby("agent_id")["total_cost"].transform(
            lambda x: x.shift(1).rolling(window, min_periods=1).std().fillna(0))

    df["day_of_week"]  = df["metric_date"].dt.dayofweek
    df["month"]        = df["metric_date"].dt.month
    df["is_weekend"]   = (df["day_of_week"] >= 5).astype(int)
    df["week_of_year"] = df["metric_date"].dt.isocalendar().week.astype(int)

    return df.dropna(subset=["cost_lag_7"])


# ─────────────────────────────────────────────
# TRAINING PIPELINE
# ─────────────────────────────────────────────
def run_training():
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment(EXPERIMENT_NAME)

    df = load_daily_cost_series()
    df = build_time_features(df)

    feature_cols = [c for c in df.columns if c not in
                    ["metric_date", "agent_id", "total_cost", "total_tokens"]]
    X = df[feature_cols].fillna(0)
    y = df["total_cost"].values

    tscv   = TimeSeriesSplit(n_splits=5)
    params = {
        "n_estimators":    400,
        "max_depth":       5,
        "learning_rate":   0.04,
        "subsample":       0.85,
        "colsample_bytree":0.75,
        "random_state":    42,
        "n_jobs":          -1,
    }

    with mlflow.start_run(run_name="cost_xgboost_v1"):
        mlflow.log_params({**params, "dataset_rows": len(df),
                           "unique_dates": df["metric_date"].nunique(),
                           "features": feature_cols})

        model = xgb.XGBRegressor(**params)

        cv_maes = []
        for train_idx, val_idx in tscv.split(X):
            m = xgb.XGBRegressor(**params)
            m.fit(X.iloc[train_idx], y[train_idx])
            preds   = m.predict(X.iloc[val_idx])
            cv_maes.append(mean_absolute_error(y[val_idx], preds))

        model.fit(X, y)
        train_preds = model.predict(X)

        metrics = {
            "train_mae":    mean_absolute_error(y, train_preds),
            "train_rmse":   mean_squared_error(y, train_preds) ** 0.5,
            "train_r2":     r2_score(y, train_preds),
            "cv_mae_mean":  float(np.mean(cv_maes)),
            "cv_mae_std":   float(np.std(cv_maes)),
        }
        mlflow.log_metrics(metrics)
        logger.info(f"Training Metrics: {metrics}")

        mlflow.xgboost.log_model(
            model,
            artifact_path="cost_model",
            registered_model_name=MODEL_NAME,
        )

        # Write forecast for next 7 days into PostgreSQL
        _write_forecasts(df, model, feature_cols)
        logger.info(f"✅ Cost forecaster registered as '{MODEL_NAME}' in MLflow")

    return metrics


def _write_forecasts(df: pd.DataFrame, model, feature_cols: list):
    """Generate and persist 7-day forecasts per agent to PostgreSQL."""
    from ml.utils import get_pg_conn

    conn   = get_pg_conn()
    cursor = conn.cursor()

    agents = df["agent_id"].unique()
    today  = date.today()

    for agent in agents:
        agent_df = df[df["agent_id"] == agent].sort_values("metric_date").tail(14)
        if len(agent_df) < 3:
            continue

        last_row = agent_df.iloc[-1].copy()

        for day_offset in range(1, 8):
            fcast_date = today + timedelta(days=day_offset)
            row        = last_row.copy()
            row["day_of_week"]  = fcast_date.weekday()
            row["month"]        = fcast_date.month
            row["is_weekend"]   = int(fcast_date.weekday() >= 5)
            row["week_of_year"] = int(fcast_date.strftime("%V"))

            X_pred = pd.DataFrame([row[feature_cols].fillna(0)])
            pred   = float(model.predict(X_pred)[0])
            lower  = pred * 0.85
            upper  = pred * 1.15
            tokens = int(pred / 0.000022) if pred > 0 else 0

            cursor.execute("""
                INSERT INTO cost_forecasts
                    (forecast_date, agent_id, predicted_cost, predicted_tokens,
                     confidence_lower, confidence_upper, model_version)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (forecast_date, agent_id) DO UPDATE SET
                    predicted_cost = EXCLUDED.predicted_cost,
                    predicted_tokens = EXCLUDED.predicted_tokens,
                    confidence_lower = EXCLUDED.confidence_lower,
                    confidence_upper = EXCLUDED.confidence_upper,
                    model_version = EXCLUDED.model_version,
                    created_at = NOW()
            """, (fcast_date, agent, round(pred, 4), tokens,
                  round(lower, 4), round(upper, 4), "xgb_v1"))

    conn.commit()
    cursor.close()
    conn.close()
    logger.info("✅ 7-day cost forecasts written to PostgreSQL")


if __name__ == "__main__":
    run_training()
