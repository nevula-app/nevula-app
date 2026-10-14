-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

CREATE TABLE IF NOT EXISTS community_credentials (user_id TEXT PRIMARY KEY REFERENCES community_members(user_id) ON DELETE CASCADE, login_name TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS community_setup_grants (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES community_members(user_id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS community_auth_limits (bucket_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS community_auth_limits_expiry_idx ON community_auth_limits(expires_at);
CREATE INDEX IF NOT EXISTS community_sessions_user_idx ON community_sessions(user_id);
CREATE INDEX IF NOT EXISTS community_setup_grants_user_idx ON community_setup_grants(user_id);
