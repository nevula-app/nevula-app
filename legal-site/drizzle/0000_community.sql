-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

CREATE TABLE IF NOT EXISTS community_members (user_id TEXT PRIMARY KEY, nickname TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator','admin')), suspended_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS community_posts (id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES community_members(user_id), title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'question', locked_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS community_replies (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES community_posts(id), author_id TEXT NOT NULL REFERENCES community_members(user_id), body TEXT NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS community_reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES community_members(user_id), post_id TEXT, reply_id TEXT, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS community_login_codes (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS community_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES community_members(user_id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS community_posts_created_idx ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS community_replies_post_idx ON community_replies(post_id, created_at);
