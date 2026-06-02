"""
AgentOps Platform - Medallion ETL DAG
Orchestrates Bronze -> Silver -> Gold transformations
Runs every 30 minutes to maintain fresh analytics data
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.utils.dates import days_ago
import logging
import os
import json
import uuid
import psycopg2
import boto3
from botocore.client import Config
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import io

logger = logging.getLogger(__name__)

# =====================================================
# DAG CONFIGURATION
# =====================================================
DEFAULT_ARGS = {
    "owner": "agentops",
    "depends_on_past": False,
    "start_date": days_ago(1),
    "email_on_failure": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

# Environment variables
PG_HOST = os.getenv("POSTGRES_HOST", "postgres")
PG_USER = os.getenv("POSTGRES_USER", "agentops")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "agentops")
PG_DB = os.getenv("POSTGRES_DB", "agentops")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
BUCKET = "agentops-lake"


def get_pg_conn():
    return psycopg2.connect(
        host=PG_HOST, user=PG_USER, password=PG_PASS, dbname=PG_DB
    )


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=f"http://{MINIO_ENDPOINT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


# =====================================================
# BRONZE -> SILVER: Clean and Validate
# =====================================================
def bronze_to_silver(**context):
    """
    Read raw Parquet files from MinIO Bronze layer,
    apply data quality checks, deduplicate, and write to Silver layer.
    Also write clean records to PostgreSQL fact tables.
    """
    s3 = get_s3_client()
    pg_conn = get_pg_conn()
    cursor = pg_conn.cursor()

    execution_date = context["execution_date"]
    date_str = execution_date.strftime("%Y-%m-%d")

    logger.info(f"Processing Bronze -> Silver for date: {date_str}")

    # List bronze files for this date
    try:
        response = s3.list_objects_v2(
            Bucket=BUCKET,
            Prefix=f"bronze/conversations/event_date={date_str}/"
        )
        objects = response.get("Contents", [])
    except Exception as e:
        logger.warning(f"No bronze files found for {date_str}: {e}")
        objects = []

    if not objects:
        logger.info("No bronze files to process. Inserting synthetic data for demo.")
        _insert_synthetic_silver_data(cursor, pg_conn, date_str)
        cursor.close()
        pg_conn.close()
        return

    total_processed = 0
    total_rejected = 0

    for obj in objects:
        try:
            # Read Parquet from S3
            response = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
            buffer = io.BytesIO(response["Body"].read())
            df = pd.read_parquet(buffer)

            # Silver Quality Rules
            before_count = len(df)
            df = df.dropna(subset=["conversation_id", "agent_id", "latency_ms"])
            df = df.drop_duplicates(subset=["conversation_id"])
            df = df[df["latency_ms"] > 0]
            df = df[df["token_count"] > 0]
            df = df[df["cost"] >= 0]
            after_count = len(df)

            rejected = before_count - after_count
            total_rejected += rejected
            total_processed += after_count

            if len(df) == 0:
                continue

            # Write Silver to MinIO
            silver_buffer = io.BytesIO()
            df.to_parquet(silver_buffer, index=False)
            silver_buffer.seek(0)
            s3.put_object(
                Bucket=BUCKET,
                Key=f"silver/conversations/event_date={date_str}/{obj['Key'].split('/')[-1]}",
                Body=silver_buffer.getvalue()
            )

            # Write to PostgreSQL fact table
            for _, row in df.iterrows():
                cursor.execute("""
                    INSERT INTO fact_conversations (
                        conversation_id, agent_id, user_question, agent_response,
                        context_text, latency_ms, token_count, cost, success,
                        hallucination_score, failure_probability, tool_count,
                        feedback_score, event_timestamp
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    str(row.get("conversation_id", uuid.uuid4())),
                    row.get("agent_id"),
                    row.get("user_question", ""),
                    row.get("agent_response", ""),
                    row.get("context", ""),
                    int(row.get("latency_ms", 0)),
                    int(row.get("token_count", 0)),
                    float(row.get("cost", 0)),
                    bool(row.get("success", True)),
                    float(row.get("hallucination_score", 0)),
                    float(row.get("failure_probability", 0)),
                    int(row.get("tool_count", 0)),
                    float(row.get("feedback_score", 4.0)),
                    row.get("event_timestamp"),
                ))

            pg_conn.commit()

        except Exception as e:
            logger.error(f"Error processing {obj['Key']}: {e}")
            pg_conn.rollback()

    cursor.close()
    pg_conn.close()
    logger.info(f"✅ Silver ETL complete: {total_processed} processed, {total_rejected} rejected")


def _insert_synthetic_silver_data(cursor, pg_conn, date_str):
    """Insert synthetic data for demonstration when no bronze files exist."""
    import random
    from datetime import timezone

    agents = ["support_agent", "coding_agent", "sales_agent", "hr_agent", "knowledge_agent"]
    for _ in range(200):
        agent_id = random.choice(agents)
        latency = random.randint(200, 3000)
        tokens = random.randint(100, 1500)
        cost = tokens * 0.00002 * random.uniform(0.8, 1.2)
        success = random.random() > 0.08

        cursor.execute("""
            INSERT INTO fact_conversations (
                conversation_id, agent_id, latency_ms, token_count, cost,
                success, hallucination_score, failure_probability, tool_count,
                feedback_score, event_timestamp
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (
            str(uuid.uuid4()), agent_id, latency, tokens, round(cost, 6),
            success, round(random.uniform(0.02, 0.25), 4),
            round(random.uniform(0.01, 0.40), 4),
            random.randint(0, 4),
            round(random.uniform(3.0, 5.0) if success else random.uniform(1.0, 3.5), 2),
            datetime.now(timezone.utc),
        ))
    pg_conn.commit()
    logger.info("✅ Synthetic Silver data inserted (200 records)")


# =====================================================
# SILVER -> GOLD: Aggregate Metrics
# =====================================================
def silver_to_gold(**context):
    """
    Read Silver layer data, compute daily aggregated metrics,
    and write to Gold layer tables in PostgreSQL.
    """
    execution_date = context["execution_date"]
    metric_date = execution_date.date()

    pg_conn = get_pg_conn()
    cursor = pg_conn.cursor()

    logger.info(f"Computing Gold metrics for date: {metric_date}")

    # Compute daily aggregated metrics per agent
    cursor.execute("""
        INSERT INTO daily_agent_metrics (
            metric_date, agent_id, total_requests, total_cost,
            avg_latency_ms, avg_tokens, error_rate, success_rate,
            avg_hallucination_score, avg_failure_prob, quality_score,
            p95_latency_ms, p99_latency_ms, unique_conversations
        )
        SELECT
            DATE(event_timestamp) AS metric_date,
            agent_id,
            COUNT(*) AS total_requests,
            SUM(cost) AS total_cost,
            AVG(latency_ms) AS avg_latency_ms,
            AVG(token_count) AS avg_tokens,
            1.0 - (SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)) AS error_rate,
            SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) AS success_rate,
            AVG(hallucination_score) AS avg_hallucination_score,
            AVG(failure_probability) AS avg_failure_prob,
            (
                0.4 * (SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)) +
                0.3 * (1 - AVG(COALESCE(failure_probability, 0))) -
                0.2 * AVG(COALESCE(hallucination_score, 0)) -
                0.1 * (1 - SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*))
            ) AS quality_score,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency_ms,
            COUNT(DISTINCT conversation_id) AS unique_conversations
        FROM fact_conversations
        WHERE DATE(event_timestamp) = %s
          AND agent_id IS NOT NULL
        GROUP BY DATE(event_timestamp), agent_id
        ON CONFLICT (metric_date, agent_id)
        DO UPDATE SET
            total_requests = EXCLUDED.total_requests,
            total_cost = EXCLUDED.total_cost,
            avg_latency_ms = EXCLUDED.avg_latency_ms,
            avg_tokens = EXCLUDED.avg_tokens,
            error_rate = EXCLUDED.error_rate,
            success_rate = EXCLUDED.success_rate,
            avg_hallucination_score = EXCLUDED.avg_hallucination_score,
            avg_failure_prob = EXCLUDED.avg_failure_prob,
            quality_score = EXCLUDED.quality_score,
            p95_latency_ms = EXCLUDED.p95_latency_ms,
            p99_latency_ms = EXCLUDED.p99_latency_ms,
            unique_conversations = EXCLUDED.unique_conversations,
            created_at = NOW()
    """, (metric_date,))

    pg_conn.commit()
    cursor.close()
    pg_conn.close()
    logger.info(f"✅ Gold metrics computed for {metric_date}")


def validate_data_quality(**context):
    """Basic data quality checks on the processed data."""
    pg_conn = get_pg_conn()
    cursor = pg_conn.cursor()

    checks = []

    # Check 1: No NULL agent_ids in fact table
    cursor.execute("SELECT COUNT(*) FROM fact_conversations WHERE agent_id IS NULL")
    null_agents = cursor.fetchone()[0]
    checks.append(("no_null_agent_ids", null_agents == 0, null_agents))

    # Check 2: Latency values are reasonable
    cursor.execute("SELECT COUNT(*) FROM fact_conversations WHERE latency_ms < 0 OR latency_ms > 60000")
    bad_latency = cursor.fetchone()[0]
    checks.append(("latency_in_range", bad_latency == 0, bad_latency))

    # Check 3: Cost values are non-negative
    cursor.execute("SELECT COUNT(*) FROM fact_conversations WHERE cost < 0")
    negative_cost = cursor.fetchone()[0]
    checks.append(("non_negative_cost", negative_cost == 0, negative_cost))

    cursor.close()
    pg_conn.close()

    failed = [c for c in checks if not c[1]]
    if failed:
        logger.warning(f"⚠️ Data quality checks failed: {failed}")
    else:
        logger.info("✅ All data quality checks passed!")

    return {"checks": checks, "failed_count": len(failed)}


# =====================================================
# DAG DEFINITION
# =====================================================
with DAG(
    dag_id="etl_medallion_pipeline",
    description="Bronze -> Silver -> Gold ETL pipeline for AgentOps",
    default_args=DEFAULT_ARGS,
    schedule_interval="*/30 * * * *",
    catchup=False,
    max_active_runs=1,
    tags=["agentops", "etl", "medallion", "data-engineering"],
) as dag:

    start = EmptyOperator(task_id="start")

    bronze_to_silver_task = PythonOperator(
        task_id="bronze_to_silver",
        python_callable=bronze_to_silver,
        provide_context=True,
    )

    validate_task = PythonOperator(
        task_id="validate_data_quality",
        python_callable=validate_data_quality,
        provide_context=True,
    )

    silver_to_gold_task = PythonOperator(
        task_id="silver_to_gold",
        python_callable=silver_to_gold,
        provide_context=True,
    )

    end = EmptyOperator(task_id="end")

    start >> bronze_to_silver_task >> validate_task >> silver_to_gold_task >> end
