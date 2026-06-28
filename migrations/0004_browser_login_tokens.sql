CREATE TABLE IF NOT EXISTS mcp_bearer_tokens (
  token_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  username TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_bearer_tokens_subject_status
  ON mcp_bearer_tokens(subject, status);

CREATE TABLE IF NOT EXISTS oauth_manage_codes (
  code_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  revoked_at INTEGER
);
