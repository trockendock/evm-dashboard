-- EVM Dashboard: Migration zu nutzerbasiertem RLS
--
-- Vorher: "Allow all" Policies => jeder mit dem anon-Key liest/schreibt alle Daten.
-- Nachher: Jeder Nutzer sieht nur seine eigenen Projekte.
--
-- Reihenfolge im Supabase SQL Editor ausführen. Bestehende Daten werden dem
-- zuletzt eingeloggten Nutzer zugewiesen -- vor Migration ggf. anpassen.

-- 1) Owner-Spalte ergänzen
alter table projects add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- 2) Bestandsdaten einem Nutzer zuordnen (optional, falls nötig anpassen)
-- update projects set owner_id = '<USER-UUID>' where owner_id is null;

-- 3) owner_id künftig nicht mehr NULL zulassen
-- alter table projects alter column owner_id set not null;

-- 4) Alte Policies verwerfen
drop policy if exists "Allow all" on projects;
drop policy if exists "Allow all" on epics;
drop policy if exists "Allow all" on features;

-- 5) Nur authentifizierte Nutzer, nur eigene Projekte
create policy "projects_owner_select" on projects
  for select to authenticated using (owner_id = auth.uid());
create policy "projects_owner_insert" on projects
  for insert to authenticated with check (owner_id = auth.uid());
create policy "projects_owner_update" on projects
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects_owner_delete" on projects
  for delete to authenticated using (owner_id = auth.uid());

-- 6) Epics/Features erben die Berechtigung über das Parent-Projekt
create policy "epics_owner_all" on epics
  for all to authenticated
  using (exists (select 1 from projects p where p.id = epics.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = epics.project_id and p.owner_id = auth.uid()));

create policy "features_owner_all" on features
  for all to authenticated
  using (exists (
    select 1 from epics e join projects p on p.id = e.project_id
    where e.id = features.epic_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from epics e join projects p on p.id = e.project_id
    where e.id = features.epic_id and p.owner_id = auth.uid()
  ));

-- 7) owner_id beim Insert automatisch setzen (Client muss nichts ändern)
create or replace function set_project_owner()
returns trigger as $$
begin
  if new.owner_id is null then
    new.owner_id = auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists projects_set_owner on projects;
create trigger projects_set_owner before insert on projects
  for each row execute function set_project_owner();

-- Hinweis: jira_config enthält das Jira-API-Token im Klartext.
-- Mit den neuen Policies ist es zwar nur noch für den Owner lesbar, aber weiterhin
-- im Browser einsehbar. Empfehlung: Token in einer Supabase Edge Function halten
-- (Secrets), Client ruft nur noch den Proxy auf ohne das Token zu sehen.
