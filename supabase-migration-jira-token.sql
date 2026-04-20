-- EVM Dashboard: Jira-Token aus dem Browser entfernen
--
-- Vorher: projects.jira_config.apiToken lag als Klartext in Supabase und im Client-State.
-- Nachher: Token liegt in einer separaten Tabelle ohne RLS-Policies -- nur die Edge
-- Function (service_role) kann lesen/schreiben.
--
-- Reihenfolge: zuerst supabase-migration-rls.sql ausführen, dann dieses Script.

create table if not exists jira_credentials (
  project_id uuid primary key references projects(id) on delete cascade,
  api_token text not null,
  updated_at timestamptz default now()
);

alter table jira_credentials enable row level security;
-- Keine Policies: anon/authenticated können weder SELECT noch INSERT.
-- Nur service_role (Edge Functions) umgeht RLS.

-- Bestehende Klartext-Tokens nach jira_credentials migrieren
insert into jira_credentials (project_id, api_token)
  select id, jira_config->>'apiToken'
  from projects
  where jira_config ? 'apiToken'
    and coalesce(jira_config->>'apiToken', '') <> ''
  on conflict (project_id) do update set api_token = excluded.api_token, updated_at = now();

-- jira_config: apiToken entfernen, Flag tokenSet setzen
update projects
  set jira_config = (jira_config - 'apiToken') || jsonb_build_object('tokenSet', true)
  where jira_config ? 'apiToken'
    and coalesce(jira_config->>'apiToken', '') <> '';

update projects
  set jira_config = jira_config - 'apiToken'
  where jira_config ? 'apiToken';

-- updated_at Trigger
create trigger jira_credentials_updated_at before update on jira_credentials
  for each row execute function update_updated_at();
