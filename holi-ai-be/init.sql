CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS episodic_memory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message TEXT NOT NULL,
    embedding vector(384),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_job_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    payload JSONB NOT NULL,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coach_prompts (
  user_id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_crons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    cron_id TEXT NOT NULL,
    title TEXT NOT NULL,
    schedule TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    category TEXT DEFAULT 'Custom',
    linked_module TEXT,
    requires_logging BOOLEAN DEFAULT FALSE,
    log_type TEXT,
    log_unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, cron_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    cron_id TEXT,
    activity_title TEXT NOT NULL,
    log_type TEXT NOT NULL,
    number_value NUMERIC,
    boolean_value BOOLEAN,
    text_value TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_queues (
    user_id TEXT PRIMARY KEY, 
    question_queue JSONB DEFAULT '[]'::jsonb,
    rag_enabled BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS user_action_modules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    module_title TEXT NOT NULL,
    description TEXT,
    key_metrics JSONB,
    categories JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, module_title)
);

CREATE TABLE IF NOT EXISTS user_facts (
    user_id VARCHAR(255) NOT NULL,
    fact_key VARCHAR(255) NOT NULL,
    fact_value TEXT NOT NULL,
    embedding vector(384),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, fact_key)
);

CREATE TABLE IF NOT EXISTS biometrics_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    steps INTEGER,
    resting_hr INTEGER,
    hrv_rmssd REAL,
    hrv_source VARCHAR(50),
    hrv_status VARCHAR(50),
    stress_score INTEGER,
    body_battery INTEGER,
    sleep_duration_seconds INTEGER,
    sleep_score INTEGER,
    spo2 REAL,
    respiration_rate REAL,
    active_calories INTEGER
);

CREATE INDEX IF NOT EXISTS idx_biometrics_logs_user_id ON biometrics_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_biometrics_logs_logged_at ON biometrics_logs(logged_at DESC);

CREATE TABLE IF NOT EXISTS llm_traces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    model TEXT NOT NULL,
    latency_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    payload_input JSONB,
    payload_output JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
