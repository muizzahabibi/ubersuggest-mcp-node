CREATE TABLE IF NOT EXISTS authorization_codes (
  code_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS oauth_runtime_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_invites (
  code_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL,
  redeemed_at INTEGER
);

CREATE TABLE IF NOT EXISTS oauth_authorize_requests (
  code_hash TEXT PRIMARY KEY,
  auth_request_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS oauth_connect_codes (
  code_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  consumed_at INTEGER
);
