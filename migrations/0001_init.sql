CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  subject TEXT,
  owner_type TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  auth_bundle_secret_id TEXT,
  captured_at INTEGER,
  last_validated_at INTEGER,
  default_project_id TEXT,
  default_workspace_id TEXT,
  bootstrap_user_path TEXT,
  bootstrap_get_token_path TEXT,
  last_referer_by_feature_json TEXT NOT NULL DEFAULT '{}',
  last_rate_limit_state_json TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS auth_bundles (
  secret_id TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reconnect_jobs (
  job_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  error_message TEXT
);
