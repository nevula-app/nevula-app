-- Pinned announcements and hidden drafts. Existing rows keep status 'published'.
ALTER TABLE community_posts ADD COLUMN pinned_at TEXT;
ALTER TABLE community_posts ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE community_posts ADD COLUMN preview_token TEXT;
CREATE INDEX IF NOT EXISTS community_posts_list_idx ON community_posts(status, pinned_at DESC, created_at DESC);
