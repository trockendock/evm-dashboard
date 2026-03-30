-- EVM Dashboard: Supabase Schema
-- Dieses SQL im Supabase Dashboard unter SQL Editor ausführen

-- Projekte
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}',
  jira_config jsonb not null default '{}',
  rates jsonb not null default '[]',
  milestones jsonb not null default '[]',
  last_jira_sync timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Epics (= Issues/Work Items)
create table epics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  jira_key text,
  summary text not null,
  status text not null default 'To Do',
  jira_status text,
  start_date date,
  end_date date,
  current_estimate numeric not null default 0,
  time_spent numeric not null default 0,
  baseline_estimate numeric not null default 0,
  is_baseline_locked boolean default false,
  rate_id text,
  pert_optimistic numeric,
  pert_most_likely numeric,
  pert_pessimistic numeric,
  removed_from_jira boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index für schnelle Projekt-Abfragen
create index idx_epics_project_id on epics(project_id);

-- Row Level Security (Single-User: alles erlaubt mit anon key)
alter table projects enable row level security;
alter table epics enable row level security;
create policy "Allow all" on projects for all using (true) with check (true);
create policy "Allow all" on epics for all using (true) with check (true);

-- Auto-Update updated_at Trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();
create trigger epics_updated_at before update on epics
  for each row execute function update_updated_at();

-- PERT Estimation: FTE und Uplift Spalten
ALTER TABLE epics ADD COLUMN IF NOT EXISTS pert_fte numeric NOT NULL DEFAULT 1;
ALTER TABLE epics ADD COLUMN IF NOT EXISTS pert_uplift numeric NOT NULL DEFAULT 0;

-- Baseline Management: Snapshots auf Projekt, Zuordnung auf Epics
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baselines jsonb NOT NULL DEFAULT '[]';
ALTER TABLE epics ADD COLUMN IF NOT EXISTS baseline_id text;

-- Child Features pro Epic (optionale PERT-Schätzung mit Rolle/Kostensatz)
create table features (
  id uuid primary key default gen_random_uuid(),
  epic_id uuid references epics(id) on delete cascade,
  name text not null default '',
  role_id text,
  pert_optimistic numeric,
  pert_most_likely numeric,
  pert_pessimistic numeric,
  fte numeric not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_features_epic_id on features(epic_id);
alter table features enable row level security;
create policy "Allow all" on features for all using (true) with check (true);
create trigger features_updated_at before update on features
  for each row execute function update_updated_at();

-- MoSCoW-Priorisierung: Kategorie, Phase, Priorität, Bemerkung
ALTER TABLE epics ADD COLUMN IF NOT EXISTS moscow text;
ALTER TABLE epics ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE epics ADD COLUMN IF NOT EXISTS priority integer;
ALTER TABLE epics ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '';
