"""
AgentOps Platform - Spark Structured Streaming Processor
Reads AI Agent events from Kafka in real-time and:
1. Writes raw events to MinIO Data Lake (Bronze Layer - Parquet)
2. Computes windowed aggregations and writes to PostgreSQL (Real-time metrics)
"""

import os
import json
import logging
from datetime import datetime

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType,
    FloatType, BooleanType, TimestampType, DoubleType
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURATION
# =====================================================
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_USER = os.getenv("POSTGRES_USER", "agentops")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "agentops")
POSTGRES_DB = os.getenv("POSTGRES_DB", "agentops")
POSTGRES_JDBC_URL = f"jdbc:postgresql://{POSTGRES_HOST}:5432/{POSTGRES_DB}"

# S3A paths for MinIO Data Lake
BRONZE_PATH = "s3a://agentops-lake/bronze"
SILVER_PATH = "s3a://agentops-lake/silver"

# =====================================================
# EVENT SCHEMAS
# =====================================================
CONVERSATION_SCHEMA = StructType([
    StructField("event_type", StringType()),
    StructField("conversation_id", StringType()),
    StructField("agent_id", StringType()),
    StructField("agent_name", StringType()),
    StructField("model", StringType()),
    StructField("user_question", StringType()),
    StructField("context", StringType()),
    StructField("agent_response", StringType()),
    StructField("latency_ms", IntegerType()),
    StructField("token_count", IntegerType()),
    StructField("cost", DoubleType()),
    StructField("success", BooleanType()),
    StructField("tool_count", IntegerType()),
    StructField("hallucination_score", DoubleType()),
    StructField("failure_probability", DoubleType()),
    StructField("feedback_score", DoubleType()),
    StructField("session_id", StringType()),
    StructField("timestamp", StringType()),
])

TOOL_CALL_SCHEMA = StructType([
    StructField("event_type", StringType()),
    StructField("call_id", StringType()),
    StructField("conversation_id", StringType()),
    StructField("agent_id", StringType()),
    StructField("tool_name", StringType()),
    StructField("latency_ms", IntegerType()),
    StructField("success", BooleanType()),
    StructField("error_message", StringType()),
    StructField("timestamp", StringType()),
])

# =====================================================
# SPARK SESSION
# =====================================================
def create_spark_session() -> SparkSession:
    """Create a Spark session with MinIO/S3A and Kafka configuration."""
    spark = (
        SparkSession.builder
        .appName("AgentOps Streaming Processor")
        .config("spark.sql.streaming.checkpointLocation", "/tmp/agentops_checkpoint")
        .config("spark.hadoop.fs.s3a.endpoint", f"http://{MINIO_ENDPOINT}")
        .config("spark.hadoop.fs.s3a.access.key", MINIO_ACCESS_KEY)
        .config("spark.hadoop.fs.s3a.secret.key", MINIO_SECRET_KEY)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
        .config("spark.sql.shuffle.partitions", "4")
        .config("spark.streaming.stopGracefullyOnShutdown", "true")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")
    logger.info("✅ Spark session created successfully")
    return spark


# =====================================================
# KAFKA READERS
# =====================================================
def read_kafka_topic(spark: SparkSession, topic: str):
    """Create a streaming reader for a Kafka topic."""
    return (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
        .option("subscribe", topic)
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .option("maxOffsetsPerTrigger", 1000)
        .load()
    )


# =====================================================
# BRONZE LAYER WRITER
# =====================================================
def write_to_bronze(df, topic_name: str):
    """Write raw events to MinIO Bronze layer as Parquet, partitioned by date."""
    df_with_partition = df.withColumn(
        "event_date", F.to_date(F.col("event_timestamp"))
    ).withColumn(
        "event_hour", F.hour(F.col("event_timestamp"))
    )

    return (
        df_with_partition.writeStream
        .format("parquet")
        .outputMode("append")
        .option("path", f"{BRONZE_PATH}/{topic_name}")
        .option("checkpointLocation", f"/tmp/checkpoint/bronze_{topic_name}")
        .partitionBy("event_date", "event_hour")
        .trigger(processingTime="30 seconds")
        .start()
    )


# =====================================================
# REALTIME METRICS WRITER (PostgreSQL)
# =====================================================
def write_realtime_metrics_to_postgres(df, epoch_id):
    """Write windowed aggregations to PostgreSQL realtime_metrics table."""
    if df.count() == 0:
        return

    jdbc_props = {
        "user": POSTGRES_USER,
        "password": POSTGRES_PASSWORD,
        "driver": "org.postgresql.Driver",
    }

    # Write using UPSERT logic via temp view
    df_to_write = df.select(
        F.col("agent_id"),
        F.col("window.start").alias("window_start"),
        F.col("window.end").alias("window_end"),
        F.col("request_count"),
        F.col("avg_latency_ms"),
        F.col("avg_cost"),
        F.col("total_cost"),
        F.col("error_count"),
        F.col("success_count"),
        F.col("error_rate"),
        F.col("success_rate"),
        F.col("total_tokens"),
        F.col("avg_tokens"),
        F.current_timestamp().alias("updated_at"),
    )

    df_to_write.write \
        .jdbc(
            url=POSTGRES_JDBC_URL,
            table="realtime_metrics",
            mode="append",
            properties=jdbc_props,
        )
    logger.info(f"✅ Epoch {epoch_id}: Wrote {df_to_write.count()} metric rows to PostgreSQL")


# =====================================================
# MAIN STREAMING PIPELINE
# =====================================================
def run_streaming():
    spark = create_spark_session()

    # --- READ FROM KAFKA ---
    raw_agent_events = read_kafka_topic(spark, "agent_events")
    raw_tool_calls = read_kafka_topic(spark, "tool_calls")

    # --- PARSE CONVERSATION EVENTS ---
    conversation_df = (
        raw_agent_events
        .select(F.from_json(F.col("value").cast("string"), CONVERSATION_SCHEMA).alias("data"))
        .select("data.*")
        .withColumn("event_timestamp", F.to_timestamp(F.col("timestamp")))
        .withWatermark("event_timestamp", "2 minutes")
        .filter(F.col("agent_id").isNotNull())
    )

    # --- PARSE TOOL CALL EVENTS ---
    tool_calls_df = (
        raw_tool_calls
        .select(F.from_json(F.col("value").cast("string"), TOOL_CALL_SCHEMA).alias("data"))
        .select("data.*")
        .withColumn("event_timestamp", F.to_timestamp(F.col("timestamp")))
        .withWatermark("event_timestamp", "2 minutes")
        .filter(F.col("agent_id").isNotNull())
    )

    # --- WINDOWED AGGREGATIONS (1 minute window, 30 second slide) ---
    windowed_metrics = (
        conversation_df
        .groupBy(
            F.window(F.col("event_timestamp"), "1 minute", "30 seconds"),
            F.col("agent_id")
        )
        .agg(
            F.count("*").alias("request_count"),
            F.avg("latency_ms").alias("avg_latency_ms"),
            F.avg("cost").alias("avg_cost"),
            F.sum("cost").alias("total_cost"),
            F.sum(F.when(~F.col("success"), 1).otherwise(0)).alias("error_count"),
            F.sum(F.when(F.col("success"), 1).otherwise(0)).alias("success_count"),
            (F.sum(F.when(~F.col("success"), 1).otherwise(0)).cast("double") / F.count("*")).alias("error_rate"),
            (F.sum(F.when(F.col("success"), 1).otherwise(0)).cast("double") / F.count("*")).alias("success_rate"),
            F.sum("token_count").alias("total_tokens"),
            F.avg("token_count").alias("avg_tokens"),
        )
    )

    # --- WRITE BRONZE LAYER to MinIO ---
    bronze_conversations_query = write_to_bronze(
        conversation_df.select(
            "conversation_id", "agent_id", "agent_name", "model",
            "user_question", "agent_response", "latency_ms",
            "token_count", "cost", "success", "tool_count",
            "hallucination_score", "failure_probability",
            "feedback_score", "event_timestamp"
        ),
        "conversations"
    )

    bronze_tool_calls_query = write_to_bronze(
        tool_calls_df.select(
            "call_id", "conversation_id", "agent_id", "tool_name",
            "latency_ms", "success", "error_message", "event_timestamp"
        ),
        "tool_calls"
    )

    # --- WRITE REALTIME METRICS to PostgreSQL ---
    realtime_query = (
        windowed_metrics.writeStream
        .outputMode("update")
        .foreachBatch(write_realtime_metrics_to_postgres)
        .option("checkpointLocation", "/tmp/checkpoint/realtime_metrics")
        .trigger(processingTime="30 seconds")
        .start()
    )

    logger.info("🚀 All streaming queries started. Awaiting termination...")
    logger.info(f"  📦 Bronze Conversations -> {BRONZE_PATH}/conversations")
    logger.info(f"  📦 Bronze Tool Calls    -> {BRONZE_PATH}/tool_calls")
    logger.info(f"  📊 Realtime Metrics     -> PostgreSQL::realtime_metrics")

    # Wait for all queries
    spark.streams.awaitAnyTermination()


if __name__ == "__main__":
    run_streaming()
