-- marts/agent_quality_scores.sql
-- Compute composite quality score per agent over rolling 7-day window

{{ config(materialized='table') }}

WITH base AS (
    SELECT
        agent_id,
        DATE(event_timestamp) AS metric_date,
        COUNT(*) AS total_requests,
        SUM(cost) AS total_cost,
        AVG(latency_ms) AS avg_latency_ms,
        AVG(token_count) AS avg_tokens,
        SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) AS success_rate,
        1 - SUM(CASE WHEN success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) AS error_rate,
        AVG(hallucination_score) AS avg_hallucination_score,
        AVG(failure_probability) AS avg_failure_probability,
        AVG(feedback_score) AS avg_feedback_score,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
        COUNT(DISTINCT conversation_id) AS unique_conversations
    FROM {{ ref('stg_conversations') }}
    GROUP BY agent_id, DATE(event_timestamp)
),

with_quality_score AS (
    SELECT
        *,
        -- Composite Quality Score Formula (weighted)
        GREATEST(0, LEAST(1,
            0.40 * success_rate
            + 0.30 * (1 - COALESCE(avg_failure_probability, 0))
            - 0.20 * COALESCE(avg_hallucination_score, 0)
            - 0.10 * error_rate
        )) AS quality_score,
        -- 7-day rolling average quality score
        AVG(GREATEST(0, LEAST(1,
            0.40 * success_rate
            + 0.30 * (1 - COALESCE(avg_failure_probability, 0))
            - 0.20 * COALESCE(avg_hallucination_score, 0)
            - 0.10 * error_rate
        ))) OVER (
            PARTITION BY agent_id
            ORDER BY metric_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) AS rolling_7d_quality_score,
        -- Trend (today vs yesterday)
        LAG(success_rate) OVER (PARTITION BY agent_id ORDER BY metric_date) AS prev_success_rate,
        LAG(total_cost) OVER (PARTITION BY agent_id ORDER BY metric_date) AS prev_total_cost
    FROM base
)

SELECT
    agent_id,
    metric_date,
    total_requests,
    ROUND(total_cost::numeric, 4) AS total_cost,
    ROUND(avg_latency_ms::numeric, 2) AS avg_latency_ms,
    ROUND(avg_tokens::numeric, 2) AS avg_tokens,
    ROUND(success_rate::numeric, 4) AS success_rate,
    ROUND(error_rate::numeric, 4) AS error_rate,
    ROUND(avg_hallucination_score::numeric, 4) AS avg_hallucination_score,
    ROUND(avg_failure_probability::numeric, 4) AS avg_failure_probability,
    ROUND(avg_feedback_score::numeric, 2) AS avg_feedback_score,
    ROUND(p50_latency::numeric, 2) AS p50_latency,
    ROUND(p95_latency::numeric, 2) AS p95_latency,
    unique_conversations,
    ROUND(quality_score::numeric, 4) AS quality_score,
    ROUND(rolling_7d_quality_score::numeric, 4) AS rolling_7d_quality_score,
    ROUND((success_rate - COALESCE(prev_success_rate, success_rate))::numeric, 4) AS success_rate_trend,
    ROUND((total_cost - COALESCE(prev_total_cost, total_cost))::numeric, 4) AS cost_trend,
    NOW() AS computed_at
FROM with_quality_score
ORDER BY metric_date DESC, quality_score DESC
