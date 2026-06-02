-- =====================================================
-- AgentOps Platform - Database Schema Initialization
-- =====================================================

-- =====================================================
-- DIMENSIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS dim_agents (
    agent_id VARCHAR(100) PRIMARY KEY,
    agent_name VARCHAR(200) NOT NULL,
    agent_type VARCHAR(100),
    owner_team VARCHAR(100),
    model_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_time (
    time_id SERIAL PRIMARY KEY,
    event_date DATE NOT NULL,
    hour INT,
    day_of_week INT,
    week_of_year INT,
    month INT,
    quarter INT,
    year INT,
    is_weekend BOOLEAN,
    UNIQUE (event_date, hour)
);

-- =====================================================
-- FACT TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS fact_conversations (
    id SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    agent_id VARCHAR(100) REFERENCES dim_agents(agent_id),
    user_question TEXT,
    agent_response TEXT,
    context_text TEXT,
    latency_ms INT,
    token_count INT,
    cost DECIMAL(10, 6),
    success BOOLEAN,
    hallucination_score DECIMAL(5, 4),
    failure_probability DECIMAL(5, 4),
    tool_count INT DEFAULT 0,
    feedback_score DECIMAL(3, 2),
    event_timestamp TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_tool_calls (
    id SERIAL PRIMARY KEY,
    call_id UUID,
    conversation_id UUID,
    agent_id VARCHAR(100),
    tool_name VARCHAR(200),
    latency_ms INT,
    success BOOLEAN,
    error_message TEXT,
    event_timestamp TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_errors (
    id SERIAL PRIMARY KEY,
    error_id UUID,
    conversation_id UUID,
    agent_id VARCHAR(100),
    error_type VARCHAR(100),
    error_message TEXT,
    severity VARCHAR(50),
    event_timestamp TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- REAL-TIME METRICS TABLE (Updated by Spark Streaming)
-- =====================================================
CREATE TABLE IF NOT EXISTS realtime_metrics (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100),
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    request_count INT DEFAULT 0,
    avg_latency_ms DECIMAL(10, 2),
    avg_cost DECIMAL(10, 6),
    total_cost DECIMAL(10, 4),
    error_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_rate DECIMAL(5, 4),
    success_rate DECIMAL(5, 4),
    total_tokens BIGINT DEFAULT 0,
    avg_tokens DECIMAL(10, 2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GOLD LAYER - AGGREGATED METRICS
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_agent_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL,
    agent_id VARCHAR(100),
    total_requests INT,
    total_cost DECIMAL(10, 4),
    avg_latency_ms DECIMAL(10, 2),
    avg_tokens DECIMAL(10, 2),
    error_rate DECIMAL(5, 4),
    success_rate DECIMAL(5, 4),
    avg_hallucination_score DECIMAL(5, 4),
    avg_failure_prob DECIMAL(5, 4),
    quality_score DECIMAL(5, 4),
    p95_latency_ms DECIMAL(10, 2),
    p99_latency_ms DECIMAL(10, 2),
    unique_conversations INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (metric_date, agent_id)
);

CREATE TABLE IF NOT EXISTS hourly_agent_metrics (
    id SERIAL PRIMARY KEY,
    metric_hour TIMESTAMPTZ NOT NULL,
    agent_id VARCHAR(100),
    request_count INT,
    total_cost DECIMAL(10, 4),
    avg_latency_ms DECIMAL(10, 2),
    error_rate DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (metric_hour, agent_id)
);

CREATE TABLE IF NOT EXISTS cost_forecasts (
    id SERIAL PRIMARY KEY,
    forecast_date DATE NOT NULL,
    agent_id VARCHAR(100),
    predicted_cost DECIMAL(10, 4),
    predicted_tokens BIGINT,
    confidence_lower DECIMAL(10, 4),
    confidence_upper DECIMAL(10, 4),
    model_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (forecast_date, agent_id)
);

-- =====================================================
-- ML PREDICTIONS AUDIT LOG
-- =====================================================
CREATE TABLE IF NOT EXISTS ml_predictions_log (
    id SERIAL PRIMARY KEY,
    prediction_type VARCHAR(100),
    input_data JSONB,
    prediction DECIMAL(6, 4),
    model_version VARCHAR(100),
    latency_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SEED: Default Agent Definitions
-- =====================================================
INSERT INTO dim_agents (agent_id, agent_name, agent_type, owner_team, model_version) VALUES
    ('support_agent', 'Customer Support Agent', 'support', 'Customer Experience', 'v2.1'),
    ('coding_agent', 'Code Assistant Agent', 'coding', 'Engineering', 'v1.5'),
    ('sales_agent', 'Sales Intelligence Agent', 'sales', 'Revenue', 'v3.0'),
    ('hr_agent', 'HR Assistant Agent', 'hr', 'People Operations', 'v1.2'),
    ('knowledge_agent', 'Knowledge Base Agent', 'knowledge', 'Product', 'v2.0')
ON CONFLICT (agent_id) DO NOTHING;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_fact_conv_agent ON fact_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_fact_conv_ts ON fact_conversations(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_fact_conv_conv_id ON fact_conversations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_realtime_agent ON realtime_metrics(agent_id, window_start);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_agent_metrics(metric_date, agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_conv ON fact_tool_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_errors_agent ON fact_errors(agent_id, event_timestamp);

-- =====================================================
-- VIEWS FOR COMMON ANALYTICS
-- =====================================================
CREATE OR REPLACE VIEW v_agent_summary AS
SELECT
    a.agent_id,
    a.agent_name,
    a.agent_type,
    a.owner_team,
    COUNT(DISTINCT f.conversation_id) AS total_conversations,
    AVG(f.latency_ms) AS avg_latency_ms,
    SUM(f.cost) AS total_cost,
    AVG(f.cost) AS avg_cost_per_call,
    AVG(f.token_count) AS avg_tokens,
    SUM(CASE WHEN f.success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) AS success_rate,
    AVG(f.hallucination_score) AS avg_hallucination_score,
    (
        0.4 * (SUM(CASE WHEN f.success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0)) +
        0.3 * (1 - AVG(COALESCE(f.failure_probability, 0))) -
        0.2 * AVG(COALESCE(f.hallucination_score, 0)) -
        0.1 * (1 - SUM(CASE WHEN f.success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0))
    ) AS quality_score
FROM dim_agents a
LEFT JOIN fact_conversations f ON a.agent_id = f.agent_id
GROUP BY a.agent_id, a.agent_name, a.agent_type, a.owner_team;

CREATE OR REPLACE VIEW v_latest_realtime AS
SELECT DISTINCT ON (agent_id)
    agent_id, window_start, window_end,
    request_count, avg_latency_ms, avg_cost,
    total_cost, error_rate, success_rate, total_tokens,
    updated_at
FROM realtime_metrics
ORDER BY agent_id, window_start DESC;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO agentops;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO agentops;
