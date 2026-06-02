-- models/core/fact_conversations_core.sql
-- Core fact table with surrogate keys and dim joins

{{ config(materialized='table') }}

SELECT
    s.conversation_id,
    s.agent_id,
    d.agent_name,
    d.agent_type,
    d.owner_team,
    s.user_question,
    s.agent_response,
    s.latency_ms,
    s.token_count,
    s.cost,
    s.success,
    s.hallucination_score,
    s.failure_probability,
    s.tool_count,
    s.feedback_score,
    s.event_timestamp,
    DATE(s.event_timestamp) AS event_date,
    EXTRACT(HOUR FROM s.event_timestamp) AS event_hour,
    EXTRACT(DOW FROM s.event_timestamp) AS day_of_week,
    EXTRACT(WEEK FROM s.event_timestamp) AS week_of_year,
    EXTRACT(MONTH FROM s.event_timestamp) AS month,
    EXTRACT(QUARTER FROM s.event_timestamp) AS quarter,
    EXTRACT(YEAR FROM s.event_timestamp) AS year
FROM {{ ref('stg_conversations') }} s
LEFT JOIN {{ source('agentops', 'dim_agents') }} d
    ON s.agent_id = d.agent_id
