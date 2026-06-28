CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(subject);
CREATE INDEX IF NOT EXISTS idx_jobs_subject ON reconnect_jobs(subject);
CREATE INDEX IF NOT EXISTS idx_jobs_session_id ON reconnect_jobs(session_id);
