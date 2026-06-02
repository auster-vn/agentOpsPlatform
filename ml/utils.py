"""
AgentOps ML - Shared utilities for training pipelines.
Provides DB connection, data loading, and MLflow helpers.
"""

import os
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Tuple

import numpy as np
import pandas as pd
import psycopg2

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
PG_HOST = os.getenv("POSTGRES_HOST", "postgres")
PG_USER = os.getenv("POSTGRES_USER", "agentops")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "agentops")
PG_DB   = os.getenv("POSTGRES_DB", "agentops")

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")


def get_pg_conn():
    return psycopg2.connect(host=PG_HOST, user=PG_USER, password=PG_PASS, dbname=PG_DB)


def load_conversations(min_rows: int = 500) -> pd.DataFrame:
    """
    Load conversation data from PostgreSQL.
    If fewer than min_rows exist, augment with synthetic data so training
    always has enough samples to work with.
    """
    conn = get_pg_conn()
    df = pd.read_sql("""
        SELECT
            conversation_id, agent_id, user_question, agent_response,
            context_text, latency_ms, token_count, cost, success,
            hallucination_score, failure_probability, tool_count, feedback_score
        FROM fact_conversations
        WHERE latency_ms > 0 AND token_count > 0
        ORDER BY ingested_at DESC
        LIMIT 50000
    """, conn)
    conn.close()

    if len(df) < min_rows:
        logger.warning(f"Only {len(df)} rows in DB – augmenting with {min_rows - len(df)} synthetic rows.")
        df = pd.concat([df, _synthetic_conversations(min_rows - len(df))], ignore_index=True)

    logger.info(f"Loaded {len(df):,} conversation rows for training.")
    return df


def _synthetic_conversations(n: int) -> pd.DataFrame:
    """Generate realistic synthetic rows for cold-start training."""
    agents = ["support_agent", "coding_agent", "sales_agent", "hr_agent", "knowledge_agent"]
    latency_profiles = {
        "support_agent":   (300, 1500),
        "coding_agent":    (800, 4000),
        "sales_agent":     (500, 2500),
        "hr_agent":        (200, 1000),
        "knowledge_agent": (600, 3000),
    }
    hallucination_base = {
        "support_agent":   0.08,
        "coding_agent":    0.05,
        "sales_agent":     0.18,
        "hr_agent":        0.06,
        "knowledge_agent": 0.10,
    }

    rows = []
    for _ in range(n):
        agent = random.choice(agents)
        lat_lo, lat_hi = latency_profiles[agent]
        latency = random.randint(lat_lo, lat_hi)
        tokens  = random.randint(100, 1800)
        cost    = tokens * 0.000022 * random.uniform(0.8, 1.2)
        success = random.random() > 0.08
        hall    = max(0.0, min(1.0, hallucination_base[agent] + random.gauss(0, 0.05)))
        fail_p  = min(1.0, (latency / 5000) * 0.5 + (0.4 if not success else 0))

        questions = [
            "How do I reset my password?",
            "Explain Docker multi-stage builds.",
            "What's our win rate against Salesforce?",
            "How many vacation days do I have?",
            "What's our SLA for critical incidents?",
        ]
        contexts = [
            "Based on our internal documentation...",
            "According to the company policy...",
            "Our platform docs state...",
            "The knowledge base article says...",
        ]

        rows.append({
            "conversation_id":    str(uuid.uuid4()),
            "agent_id":           agent,
            "user_question":      random.choice(questions),
            "agent_response":     "Synthetic response for training purposes.",
            "context_text":       random.choice(contexts),
            "latency_ms":         latency,
            "token_count":        tokens,
            "cost":               round(cost, 6),
            "success":            success,
            "hallucination_score": round(hall, 4),
            "failure_probability": round(fail_p, 4),
            "tool_count":         random.randint(0, 5),
            "feedback_score":     round(random.uniform(3.0, 5.0) if success else random.uniform(1.0, 3.0), 2),
        })

    return pd.DataFrame(rows)
