-- Supabase migration: Jira Multi-Instance Kanban
-- Run this in the Supabase SQL editor or via the Supabase CLI.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. jira_instances
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_instances (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid,
  name                 text NOT NULL,
  host                 text NOT NULL,
  email                text NOT NULL,
  api_token_encrypted  text NOT NULL,
  color                text NOT NULL DEFAULT '#6366f1',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jira_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all on jira_instances"
  ON jira_instances
  AS PERMISSIVE
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. jira_board_projects
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_board_projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id    uuid NOT NULL REFERENCES jira_instances (id) ON DELETE CASCADE,
  project_key    text NOT NULL,
  project_name   text NOT NULL,
  jql_override   text,
  display_order  int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, project_key)
);

ALTER TABLE jira_board_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all on jira_board_projects"
  ON jira_board_projects
  AS PERMISSIVE
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. jira_status_overrides
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_status_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_project_id  uuid NOT NULL REFERENCES jira_board_projects (id) ON DELETE CASCADE,
  jira_status_id    text NOT NULL,
  category          text NOT NULL CHECK (category IN ('todo', 'in_progress', 'done')),
  UNIQUE (board_project_id, jira_status_id)
);

ALTER TABLE jira_status_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all on jira_status_overrides"
  ON jira_status_overrides
  AS PERMISSIVE
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. jira_tickets_cache
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jira_tickets_cache (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_project_id     uuid NOT NULL REFERENCES jira_board_projects (id) ON DELETE CASCADE,
  issue_key            text NOT NULL,
  summary              text,
  issue_type           text,
  issue_type_icon_url  text,
  priority             text,
  priority_icon_url    text,
  assignee_name        text,
  assignee_avatar_url  text,
  status_id            text,
  status_name          text,
  status_category      text NOT NULL,
  epic_key             text,
  epic_name            text,
  epic_color           text,
  due_date             date,
  jira_updated_at      timestamptz,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb,
  UNIQUE (board_project_id, issue_key)
);

ALTER TABLE jira_tickets_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all on jira_tickets_cache"
  ON jira_tickets_cache
  AS PERMISSIVE
  FOR ALL
  USING (true)
  WITH CHECK (true);
