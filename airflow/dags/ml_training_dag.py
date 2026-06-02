"""
AgentOps Platform - ML Training Orchestration DAG
Schedules daily model retraining and MLflow registration.
Trains: Hallucination Detector, Failure Predictor, Cost Forecaster.
"""

from datetime import datetime, timedelta
import os
import sys
import logging

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.utils.dates import days_ago

logger = logging.getLogger(__name__)

DEFAULT_ARGS = {
    "owner": "agentops-ml",
    "depends_on_past": False,
    "start_date": days_ago(1),
    "email_on_failure": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}


def train_hallucination_model(**context):
    """Train hallucination detection model and register in MLflow."""
    sys.path.insert(0, "/opt/airflow")
    try:
        from ml.train_hallucination import run_training
        run_training()
        logger.info("✅ Hallucination model trained successfully")
    except Exception as e:
        logger.error(f"Hallucination training failed: {e}")
        raise


def train_failure_model(**context):
    """Train agent failure prediction model."""
    sys.path.insert(0, "/opt/airflow")
    try:
        from ml.train_failure import run_training
        run_training()
        logger.info("✅ Failure prediction model trained successfully")
    except Exception as e:
        logger.error(f"Failure training failed: {e}")
        raise


def train_forecasting_model(**context):
    """Train cost/token forecasting model."""
    sys.path.insert(0, "/opt/airflow")
    try:
        from ml.train_forecaster import run_training
        run_training()
        logger.info("✅ Cost forecasting model trained successfully")
    except Exception as e:
        logger.error(f"Forecasting training failed: {e}")
        raise


def generate_evaluation_report(**context):
    """Generate daily agent quality evaluation report."""
    import psycopg2
    import json

    pg_conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        user=os.getenv("POSTGRES_USER", "agentops"),
        password=os.getenv("POSTGRES_PASSWORD", "agentops"),
        dbname=os.getenv("POSTGRES_DB", "agentops"),
    )
    cursor = pg_conn.cursor()

    cursor.execute("""
        SELECT
            agent_id,
            ROUND(AVG(quality_score)::numeric, 4) AS avg_quality,
            ROUND(AVG(avg_hallucination_score)::numeric, 4) AS avg_hallucination,
            ROUND(AVG(success_rate)::numeric, 4) AS avg_success_rate,
            ROUND(SUM(total_cost)::numeric, 4) AS total_cost_7d
        FROM daily_agent_metrics
        WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY agent_id
        ORDER BY avg_quality DESC
    """)

    rows = cursor.fetchall()
    report = {
        "generated_at": datetime.now().isoformat(),
        "period": "last_7_days",
        "agents": [
            {
                "agent_id": row[0],
                "quality_score": float(row[1]) if row[1] else 0,
                "hallucination_rate": float(row[2]) if row[2] else 0,
                "success_rate": float(row[3]) if row[3] else 0,
                "total_cost": float(row[4]) if row[4] else 0,
            }
            for row in rows
        ]
    }

    cursor.close()
    pg_conn.close()

    logger.info(f"✅ Evaluation report generated: {json.dumps(report, indent=2)}")
    return report


with DAG(
    dag_id="ml_training_pipeline",
    description="Daily ML model retraining pipeline for AgentOps",
    default_args=DEFAULT_ARGS,
    schedule_interval="0 2 * * *",  # Run at 2 AM daily
    catchup=False,
    max_active_runs=1,
    tags=["agentops", "ml", "mlops", "training"],
) as dag:

    start = EmptyOperator(task_id="start")

    train_hallucination = PythonOperator(
        task_id="train_hallucination_detector",
        python_callable=train_hallucination_model,
        provide_context=True,
    )

    train_failure = PythonOperator(
        task_id="train_failure_predictor",
        python_callable=train_failure_model,
        provide_context=True,
    )

    train_forecaster = PythonOperator(
        task_id="train_cost_forecaster",
        python_callable=train_forecasting_model,
        provide_context=True,
    )

    eval_report = PythonOperator(
        task_id="generate_evaluation_report",
        python_callable=generate_evaluation_report,
        provide_context=True,
    )

    end = EmptyOperator(task_id="end")

    start >> [train_hallucination, train_failure, train_forecaster] >> eval_report >> end
