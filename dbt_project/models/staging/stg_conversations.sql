-- stg_conversations.sql
-- Staging model: clean and standardize raw conversation data

{{ config(materialized='view') }}

WITH source AS (
    SELECT
        conversation_id::TEXT AS conversation_id,
        agent_id,
        user_question,
        agent_response,
        context_text,
        latency_ms,
        token_count,
        cost,
        success,
        COALESCE(hallucination_score, 0.0) AS hallucination_score,
        COALESCE(failure_probability, 0.0) AS failure_probability,
        COALESCE(tool_count, 0) AS tool_count,
        COALESCE(feedback_score, 3.0) AS feedback_score,
        event_timestamp,
        ingested_at
    FROM {{ source('agentops', 'fact_conversations') }}
    WHERE
        conversation_id IS NOT NULL
        AND agent_id IS NOT NULL
        AND latency_ms > 0
        AND token_count > 0
        AND cost >= 0
),

deduplicated AS (
    SELECT *,
        ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY ingested_at DESC) AS row_num
    FROM source
)

SELECT
    conversation_id,
    agent_id,
    user_question,
    agent_response,
    context_text,
    latency_ms,
    token_count,
    cost,
    success,
    hallucination_score,
    failure_probability,
    tool_count,
    feedback_score,
    event_timestamp,
    ingested_at
FROM deduplicated
WHERE row_num = 1
