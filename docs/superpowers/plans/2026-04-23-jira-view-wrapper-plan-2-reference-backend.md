# Jira View Wrapper — Plan 2: Reference Backend (Supabase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-23-jira-view-wrapper-extraction-design.md` (sections 4, 5, 7)

**Goal:** Build the Supabase-based reference backend satisfying the §4 HTTP contract: two Edge Functions (`jira-admin` with path routing, `jira-snapshot` public), three SQL migrations, and a JSON-driven contract-test suite that verifies the backend's conformance.

**Architecture:** Deno Edge Functions. `jira-admin` handles admin operations with JWT-based ownership check and service-role writes for secrets. `jira-snapshot` is deployed with `--no-verify-jwt` and reads `jira_snapshots` via RLS (public rows only). Snapshot model: admin's `/sync` fetches Jira, normalizes, upserts the snapshot row. Public viewers only read the snapshot.

**Tech Stack:** Supabase CLI, Deno 1.40+, Postgres (Supabase-hosted), msw-deno for Jira mocking in tests.

**Target directory:** same repo as Plan 1 — `/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper/reference-backend/supabase/`. All paths in this plan are relative to that `jira-view-wrapper/` root.

---

## File Structure (end-state of this plan)

```
jira-view-wrapper/
└── reference-backend/
    └── supabase/
        ├── config.toml
        ├── migrations/
        │   ├── 20260423_001_jira_configs.sql
        │   ├── 20260423_002_jira_credentials.sql
        │   └── 20260423_003_jira_snapshots.sql
        ├── functions/
        │   ├── jira-admin/
        │   │   ├── index.ts
        │   │   ├── handlers/
        │   │   │   ├── config.ts
        │   │   │   ├── token.ts
        │   │   │   └── sync.ts
        │   │   ├── lib/
        │   │   │   ├── auth.ts          # extract user + ownership helpers
        │   │   │   ├── jira.ts          # fetch + normalize
        │   │   │   └── cors.ts
        │   │   └── tests/
        │   │       ├── sync_normalize.test.ts
        │   │       └── cors.test.ts
        │   └── jira-snapshot/
        │       ├── index.ts
        │       └── tests/
        │           └── handler.test.ts
        └── tests/
            ├── contract.json           # published contract spec
            └── contract.test.ts        # runner
```

---

## Task 1: Initialize Supabase project locally

**Files:**
- Create: `reference-backend/supabase/config.toml` (via CLI)

- [ ] **Step 1: Install Supabase CLI if missing**

```bash
which supabase || brew install supabase/tap/supabase
```

- [ ] **Step 2: Initialize Supabase project**

```bash
cd "/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper"
mkdir -p reference-backend
cd reference-backend
supabase init
```

Expected: `reference-backend/supabase/config.toml` and `reference-backend/supabase/.gitignore` created.

- [ ] **Step 3: Start local Supabase**

```bash
supabase start
```

Expected: outputs `API URL`, `anon key`, `service_role key`. Keep these for local testing.

- [ ] **Step 4: Commit**

```bash
cd ..
git add reference-backend/
git commit -m "chore(backend): supabase init"
```

---

## Task 2: Migration 001 — `jira_configs`

**Files:**
- Create: `reference-backend/supabase/migrations/20260423_001_jira_configs.sql`

- [ ] **Step 1: Create migration**

```sql
-- reference-backend/supabase/migrations/20260423_001_jira_configs.sql
create table if not exists public.jira_configs (
  project_id uuid primary key,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  config    jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  last_sync_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.jira_configs enable row level security;

create policy "owner can read/write their configs"
  on public.jira_configs
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create index jira_configs_owner_idx on public.jira_configs(owner_id);
```

- [ ] **Step 2: Apply migration locally**

```bash
cd reference-backend
supabase db reset
```

Expected: migration applies without errors; `\dt jira_configs` in psql shows the table.

- [ ] **Step 3: Sanity-check RLS**

```bash
supabase db query "select policyname from pg_policies where tablename = 'jira_configs';"
```

Expected: row with `owner can read/write their configs`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add reference-backend/supabase/migrations/20260423_001_jira_configs.sql
git commit -m "feat(db): jira_configs table with owner RLS"
```

---

## Task 3: Migration 002 — `jira_credentials`

**Files:**
- Create: `reference-backend/supabase/migrations/20260423_002_jira_credentials.sql`

- [ ] **Step 1: Create migration**

```sql
-- reference-backend/supabase/migrations/20260423_002_jira_credentials.sql
create table if not exists public.jira_credentials (
  project_id uuid primary key references public.jira_configs(project_id) on delete cascade,
  api_token  text not null,
  updated_at timestamptz not null default now()
);

alter table public.jira_credentials enable row level security;
-- No policies: reads and writes only via service_role.
```

- [ ] **Step 2: Apply and verify**

```bash
cd reference-backend && supabase db reset
supabase db query "select count(*) from pg_policies where tablename = 'jira_credentials';"
```

Expected: `count = 0` (no policies → only service_role can access).

- [ ] **Step 3: Commit**

```bash
cd ..
git add reference-backend/supabase/migrations/20260423_002_jira_credentials.sql
git commit -m "feat(db): jira_credentials table (service_role only)"
```

---

## Task 4: Migration 003 — `jira_snapshots` with public-read RLS

**Files:**
- Create: `reference-backend/supabase/migrations/20260423_003_jira_snapshots.sql`

- [ ] **Step 1: Create migration**

```sql
-- reference-backend/supabase/migrations/20260423_003_jira_snapshots.sql
create table if not exists public.jira_snapshots (
  project_id uuid primary key references public.jira_configs(project_id) on delete cascade,
  snapshot   jsonb not null,
  synced_at  timestamptz not null default now()
);

alter table public.jira_snapshots enable row level security;

-- SECURITY DEFINER helper that bypasses RLS on jira_configs so the
-- jira_snapshots policy can check is_public without anon needing any
-- read privilege on jira_configs itself.
create or replace function public.is_project_public(p uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
  as $$ select coalesce(is_public, false) from jira_configs where project_id = p $$;

revoke all on function public.is_project_public(uuid) from public;
grant execute on function public.is_project_public(uuid) to anon, authenticated;

create policy "public read when enabled"
  on public.jira_snapshots
  for select
  using (public.is_project_public(project_id));
-- Writes: service_role only (no insert/update policy).
```

- [ ] **Step 2: Apply and test the RLS boundary**

```bash
cd reference-backend && supabase db reset
supabase db query "
  insert into jira_configs(project_id, owner_id, is_public) values (gen_random_uuid(), gen_random_uuid(), true);
  insert into jira_snapshots(project_id, snapshot) select project_id, '{}'::jsonb from jira_configs limit 1;
  select count(*) from jira_snapshots;  -- service-role sees it
"
```

Expected: `count = 1`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add reference-backend/supabase/migrations/20260423_003_jira_snapshots.sql
git commit -m "feat(db): jira_snapshots with RLS gated by is_public"
```

---

## Task 5: `jira-admin` Edge Function skeleton + path router

**Files:**
- Create: `reference-backend/supabase/functions/jira-admin/lib/cors.ts`
- Create: `reference-backend/supabase/functions/jira-admin/lib/auth.ts`
- Create: `reference-backend/supabase/functions/jira-admin/index.ts`

- [ ] **Step 1: CORS helper**

```ts
// reference-backend/supabase/functions/jira-admin/lib/cors.ts
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Auth helper (user extraction + ownership)**

```ts
// reference-backend/supabase/functions/jira-admin/lib/auth.ts
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json } from './cors.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface AuthedContext {
  userClient: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
}

export async function authenticate(req: Request): Promise<AuthedContext | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header', code: 'UNAUTHORIZED' }, 401);
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json({ error: 'Invalid token', code: 'UNAUTHORIZED' }, 401);
  const admin = createClient(url, serviceKey);
  return { userClient, admin, userId: user.id };
}

export async function requireOwnedConfig(
  ctx: AuthedContext,
  projectId: string,
): Promise<{ projectId: string; config: Record<string, unknown>; isPublic: boolean } | Response> {
  const { data, error } = await ctx.userClient
    .from('jira_configs')
    .select('project_id, config, is_public')
    .eq('project_id', projectId)
    .single();
  if (error || !data) return json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);
  return { projectId: data.project_id, config: data.config ?? {}, isPublic: data.is_public };
}
```

- [ ] **Step 3: Index router (path-based)**

```ts
// reference-backend/supabase/functions/jira-admin/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, json } from './lib/cors.ts';
import { handleConfig } from './handlers/config.ts';
import { handleToken } from './handlers/token.ts';
import { handleSync } from './handlers/sync.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  // Path looks like: /jira-admin/config, /jira-admin/token, /jira-admin/sync
  const segments = url.pathname.split('/').filter(Boolean);
  const action = segments[segments.length - 1];

  switch (action) {
    case 'config': return handleConfig(req);
    case 'token':  return handleToken(req);
    case 'sync':   return handleSync(req);
    default: return json({ error: `Unknown action: ${action}`, code: 'NOT_FOUND' }, 404);
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add reference-backend/supabase/functions/jira-admin/
git commit -m "feat(jira-admin): path-routed skeleton with cors + auth helpers"
```

---

## Task 6: `/config` handler

**Files:**
- Create: `reference-backend/supabase/functions/jira-admin/handlers/config.ts`

- [ ] **Step 1: Write test (Deno)**

```ts
// reference-backend/supabase/functions/jira-admin/tests/config.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

// NOTE: This is a lightweight shape test. Full HTTP behavior is covered by contract tests (Task 13).

Deno.test('handler config module shape', async () => {
  const mod = await import('../handlers/config.ts');
  assertEquals(typeof mod.handleConfig, 'function');
});
```

Run: `deno test reference-backend/supabase/functions/jira-admin/tests/config.test.ts` — expected to fail (missing file).

- [ ] **Step 2: Implement handler**

```ts
// reference-backend/supabase/functions/jira-admin/handlers/config.ts
import { json } from '../lib/cors.ts';
import { authenticate } from '../lib/auth.ts';

interface RequestBody {
  projectId?: string;
  config?: {
    domain?: string;
    email?: string;
    initiativeKey?: string;
    linkTypeName?: string;
    startDateField?: string;
    endDateField?: string;
    moscowField?: string | null;
    statusMapping?: Record<string, 'To Do' | 'In Progress' | 'Done'>;
  };
}

export async function handleConfig(req: Request): Promise<Response> {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  let body: RequestBody;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON', code: 'INVALID_CONFIG' }, 400); }

  if (!body.projectId || !body.config) {
    return json({ error: 'projectId and config required', code: 'INVALID_CONFIG' }, 400);
  }
  const c = body.config;
  if (!c.domain || !c.email || !c.initiativeKey) {
    return json({ error: 'domain, email, initiativeKey required', code: 'INVALID_CONFIG' }, 400);
  }

  const { error } = await ctx.admin
    .from('jira_configs')
    .upsert({
      project_id: body.projectId,
      owner_id: ctx.userId,
      config: c,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
```

- [ ] **Step 3: Verify test passes**

```bash
deno test reference-backend/supabase/functions/jira-admin/tests/config.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add reference-backend/supabase/functions/jira-admin/handlers/config.ts reference-backend/supabase/functions/jira-admin/tests/config.test.ts
git commit -m "feat(jira-admin): /config handler with ownership upsert"
```

---

## Task 7: `/token` handler (set + delete)

**Files:**
- Create: `reference-backend/supabase/functions/jira-admin/handlers/token.ts`

- [ ] **Step 1: Implement handler**

```ts
// reference-backend/supabase/functions/jira-admin/handlers/token.ts
import { json } from '../lib/cors.ts';
import { authenticate, requireOwnedConfig } from '../lib/auth.ts';

interface RequestBody {
  projectId?: string;
  action?: 'set' | 'delete';
  apiToken?: string;
}

export async function handleToken(req: Request): Promise<Response> {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  let body: RequestBody;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON', code: 'INVALID_CONFIG' }, 400); }

  if (!body.projectId) return json({ error: 'projectId required', code: 'INVALID_CONFIG' }, 400);

  const owned = await requireOwnedConfig(ctx, body.projectId);
  if (owned instanceof Response) return owned;

  if (body.action === 'delete') {
    const { error } = await ctx.admin
      .from('jira_credentials')
      .delete()
      .eq('project_id', body.projectId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, tokenSet: false });
  }

  if (body.action === 'set' || body.action === undefined) {
    if (!body.apiToken || body.apiToken.length < 4) {
      return json({ error: 'Token too short', code: 'INVALID_CONFIG' }, 400);
    }
    const { error } = await ctx.admin
      .from('jira_credentials')
      .upsert({
        project_id: body.projectId,
        api_token: body.apiToken,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, tokenSet: true });
  }

  return json({ error: `Unknown action: ${body.action}`, code: 'INVALID_CONFIG' }, 400);
}
```

- [ ] **Step 2: Commit**

```bash
git add reference-backend/supabase/functions/jira-admin/handlers/token.ts
git commit -m "feat(jira-admin): /token handler (set + delete)"
```

---

## Task 8: Jira fetch + normalization helper

**Files:**
- Create: `reference-backend/supabase/functions/jira-admin/lib/jira.ts`
- Create: `reference-backend/supabase/functions/jira-admin/tests/sync_normalize.test.ts`

- [ ] **Step 1: Write failing test for the normalizer**

```ts
// reference-backend/supabase/functions/jira-admin/tests/sync_normalize.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { normalizeIssue, buildJql } from '../lib/jira.ts';

const config = {
  domain: 'x.atlassian.net',
  email: 'u@e',
  initiativeKey: 'PROJ-1',
  linkTypeName: 'is part of',
  startDateField: 'customfield_10015',
  endDateField: 'duedate',
  moscowField: 'priority',
  statusMapping: { 'In Review': 'In Progress' as const, 'Done': 'Done' as const },
};

Deno.test('buildJql uses linkedIssues with configured link type', () => {
  const jql = buildJql(config);
  assertEquals(jql, 'issue in linkedIssues("PROJ-1", "is part of")');
});

Deno.test('normalizeIssue maps fields + status + moscow + dates + url', () => {
  const raw = {
    key: 'PROJ-42',
    fields: {
      summary: 'Do a thing',
      status: { name: 'In Review' },
      customfield_10015: '2026-04-01',
      duedate: '2026-04-15',
      timeoriginalestimate: 28800,   // 8h
      timespent: 3600,                // 1h
      priority: { name: 'Must have' },
    },
  };
  const n = normalizeIssue(raw, config);
  assertEquals(n.key, 'PROJ-42');
  assertEquals(n.summary, 'Do a thing');
  assertEquals(n.jiraStatus, 'In Review');
  assertEquals(n.mappedStatus, 'In Progress');
  assertEquals(n.startDate, '2026-04-01');
  assertEquals(n.endDate, '2026-04-15');
  assertEquals(n.estimateHours, 8);
  assertEquals(n.timeSpentHours, 1);
  assertEquals(n.moscow, 'MUST');
  assertEquals(n.url, 'https://x.atlassian.net/browse/PROJ-42');
});

Deno.test('normalizeIssue falls back to "To Do" when no mapping matches', () => {
  const n = normalizeIssue(
    { key: 'P-1', fields: { summary: 's', status: { name: 'Wat' }, customfield_10015: null, duedate: null, timeoriginalestimate: 0, timespent: 0 } },
    { ...config, statusMapping: {}, moscowField: null },
  );
  assertEquals(n.mappedStatus, 'To Do');
  assertEquals(n.moscow, null);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
deno test reference-backend/supabase/functions/jira-admin/tests/sync_normalize.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `lib/jira.ts`**

```ts
// reference-backend/supabase/functions/jira-admin/lib/jira.ts
export interface JiraConfigShape {
  domain: string;
  email: string;
  initiativeKey: string;
  linkTypeName?: string;
  startDateField?: string;
  endDateField?: string;
  moscowField?: string | null;
  statusMapping?: Record<string, 'To Do' | 'In Progress' | 'Done'>;
}

export interface NormalizedIssue {
  key: string;
  summary: string;
  jiraStatus: string;
  mappedStatus: 'To Do' | 'In Progress' | 'Done';
  startDate: string | null;
  endDate: string | null;
  estimateHours: number;
  timeSpentHours: number;
  moscow: 'MUST' | 'SHOULD' | 'COULD' | 'WONT' | null;
  url: string;
}

interface RawIssue {
  key: string;
  fields: Record<string, unknown>;
}

export function buildJql(c: JiraConfigShape): string {
  const linkType = c.linkTypeName || 'is part of';
  return `issue in linkedIssues("${c.initiativeKey}", "${linkType}")`;
}

const MOSCOW_MAP: Record<string, 'MUST' | 'SHOULD' | 'COULD' | 'WONT'> = {
  MUST: 'MUST', MUSTHAVE: 'MUST',
  SHOULD: 'SHOULD', SHOULDHAVE: 'SHOULD',
  COULD: 'COULD', COULDHAVE: 'COULD',
  WONT: 'WONT', WONTHAVE: 'WONT',
};

function roundTenths(n: number): number { return Math.round(n * 10) / 10; }

export function normalizeIssue(raw: RawIssue, c: JiraConfigShape): NormalizedIssue {
  const f = raw.fields;
  const startField = c.startDateField || 'customfield_10015';
  const endField = c.endDateField || 'duedate';
  const jiraStatus = ((f.status as { name?: string })?.name) ?? '';
  const mapped = c.statusMapping?.[jiraStatus] ?? 'To Do';

  let moscow: NormalizedIssue['moscow'] = null;
  if (c.moscowField) {
    const rawMoscow = f[c.moscowField];
    const val = typeof rawMoscow === 'object' && rawMoscow !== null
      ? ((rawMoscow as { name?: string; value?: string }).name ?? (rawMoscow as { value?: string }).value ?? '')
      : (rawMoscow ?? '');
    const normalized = String(val).toUpperCase().replace(/[^A-Z]/g, '');
    moscow = MOSCOW_MAP[normalized] ?? null;
  }

  return {
    key: raw.key,
    summary: String(f.summary ?? ''),
    jiraStatus,
    mappedStatus: mapped,
    startDate: (f[startField] as string | null) ?? null,
    endDate: (f[endField] as string | null) ?? null,
    estimateHours: roundTenths(((f.timeoriginalestimate as number) ?? 0) / 3600),
    timeSpentHours: roundTenths(((f.timespent as number) ?? 0) / 3600),
    moscow,
    url: `https://${c.domain}/browse/${raw.key}`,
  };
}

export async function fetchIssues(
  c: JiraConfigShape,
  apiToken: string,
): Promise<RawIssue[]> {
  const auth = btoa(`${c.email}:${apiToken}`);
  const fields = [
    'summary', 'status',
    c.startDateField || 'customfield_10015',
    c.endDateField || 'duedate',
    'timeoriginalestimate', 'timespent',
    ...(c.moscowField ? [c.moscowField] : []),
  ].join(',');
  const url = `https://${c.domain}/rest/api/3/search?jql=${encodeURIComponent(buildJql(c))}&fields=${encodeURIComponent(fields)}&maxResults=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.errorMessages?.[0] ?? `Jira HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.issues ?? []) as RawIssue[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
deno test reference-backend/supabase/functions/jira-admin/tests/sync_normalize.test.ts
```

Expected: all three tests pass.

- [ ] **Step 5: Commit**

```bash
git add reference-backend/supabase/functions/jira-admin/lib/jira.ts reference-backend/supabase/functions/jira-admin/tests/sync_normalize.test.ts
git commit -m "feat(jira-admin): Jira fetch + normalizeIssue + JQL builder"
```

---

## Task 9: `/sync` handler + snapshot upsert

**Files:**
- Create: `reference-backend/supabase/functions/jira-admin/handlers/sync.ts`

- [ ] **Step 1: Implement handler**

```ts
// reference-backend/supabase/functions/jira-admin/handlers/sync.ts
import { json } from '../lib/cors.ts';
import { authenticate, requireOwnedConfig } from '../lib/auth.ts';
import { fetchIssues, normalizeIssue, type JiraConfigShape } from '../lib/jira.ts';

interface RequestBody { projectId?: string }

export async function handleSync(req: Request): Promise<Response> {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  let body: RequestBody;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON', code: 'INVALID_CONFIG' }, 400); }
  if (!body.projectId) return json({ error: 'projectId required', code: 'INVALID_CONFIG' }, 400);

  const owned = await requireOwnedConfig(ctx, body.projectId);
  if (owned instanceof Response) return owned;
  const config = owned.config as unknown as JiraConfigShape;
  if (!config.domain || !config.email || !config.initiativeKey) {
    return json({ error: 'Incomplete Jira config', code: 'INVALID_CONFIG' }, 400);
  }

  const { data: credRow } = await ctx.admin
    .from('jira_credentials')
    .select('api_token')
    .eq('project_id', body.projectId)
    .single();
  if (!credRow?.api_token) {
    return json({ error: 'No Jira token stored', code: 'INVALID_CONFIG' }, 400);
  }

  let rawIssues;
  try {
    rawIssues = await fetchIssues(config, credRow.api_token);
  } catch (e) {
    return json({ error: (e as Error).message, code: 'JIRA_ERROR' }, 502);
  }

  const issues = rawIssues.map((r) => normalizeIssue(r, config));
  const syncedAt = new Date().toISOString();
  const snapshot = {
    version: 1,
    projectId: body.projectId,
    syncedAt,
    initiative: { key: config.initiativeKey },
    issues,
  };

  const { error: snapErr } = await ctx.admin
    .from('jira_snapshots')
    .upsert({ project_id: body.projectId, snapshot, synced_at: syncedAt },
            { onConflict: 'project_id' });
  if (snapErr) return json({ error: snapErr.message }, 500);

  await ctx.admin.from('jira_configs')
    .update({ last_sync_at: syncedAt })
    .eq('project_id', body.projectId);

  return json({ ok: true, syncedAt, issueCount: issues.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add reference-backend/supabase/functions/jira-admin/handlers/sync.ts
git commit -m "feat(jira-admin): /sync handler with snapshot upsert"
```

---

## Task 10: `jira-snapshot` Edge Function (public GET)

**Files:**
- Create: `reference-backend/supabase/functions/jira-snapshot/index.ts`

- [ ] **Step 1: Implement function**

```ts
// reference-backend/supabase/functions/jira-snapshot/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

function respond(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return respond({ error: 'Method not allowed' }, 405);

  const u = new URL(req.url);
  const segments = u.pathname.split('/').filter(Boolean);
  // Path looks like /jira-snapshot/:projectId
  const projectId = segments[segments.length - 1];
  if (!projectId || projectId === 'jira-snapshot') {
    return respond({ error: 'projectId required', code: 'NOT_FOUND' }, 404);
  }

  const anon = createClient(url, anonKey);

  // RLS on jira_snapshots uses is_project_public() helper (SECURITY DEFINER),
  // so the anon client sees this row iff jira_configs.is_public = true.
  // If the project doesn't exist OR is private, the row is filtered → null → 404.
  // This intentionally does not distinguish "private" from "nonexistent" to
  // avoid leaking the existence of private projects.
  const { data, error } = await anon
    .from('jira_snapshots')
    .select('snapshot')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) return respond({ error: error.message }, 500);
  if (!data?.snapshot) return respond({ error: 'not found', code: 'NOT_FOUND' }, 404);

  return respond(data.snapshot, 200, {
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
  });
});
```

- [ ] **Step 2: Deploy locally and smoke-test**

```bash
cd reference-backend && supabase functions serve jira-snapshot --no-verify-jwt --env-file .env.local &
curl -s http://127.0.0.1:54321/functions/v1/jira-snapshot/does-not-exist -o /tmp/out -w "%{http_code}\n"
```

Expected: `404`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add reference-backend/supabase/functions/jira-snapshot/
git commit -m "feat(jira-snapshot): public GET with is_public gate + cache headers"
```

---

## Task 11: Contract spec (`contract.json`)

**Files:**
- Create: `reference-backend/supabase/tests/contract.json`

- [ ] **Step 1: Create spec**

```json
{
  "$schema": "./contract.schema.json",
  "version": 1,
  "description": "HTTP contract conformance spec. Any backend implementing the §4 contract should pass all cases.",
  "cases": [
    {
      "name": "POST /config rejects missing auth",
      "path": "/jira-admin/config",
      "method": "POST",
      "headers": {},
      "body": { "projectId": "any", "config": {} },
      "expectStatus": 401,
      "expectCode": "UNAUTHORIZED"
    },
    {
      "name": "POST /config rejects invalid JSON",
      "path": "/jira-admin/config",
      "method": "POST",
      "headers": { "authorization": "Bearer $AUTH_TOKEN", "content-type": "application/json" },
      "rawBody": "not json",
      "expectStatus": 400,
      "expectCode": "INVALID_CONFIG"
    },
    {
      "name": "POST /config rejects missing required fields",
      "path": "/jira-admin/config",
      "method": "POST",
      "headers": { "authorization": "Bearer $AUTH_TOKEN", "content-type": "application/json" },
      "body": { "projectId": "$PROJECT_ID", "config": { "domain": "" } },
      "expectStatus": 400,
      "expectCode": "INVALID_CONFIG"
    },
    {
      "name": "POST /config upserts owned config",
      "path": "/jira-admin/config",
      "method": "POST",
      "headers": { "authorization": "Bearer $AUTH_TOKEN", "content-type": "application/json" },
      "body": {
        "projectId": "$PROJECT_ID",
        "config": { "domain": "x.atlassian.net", "email": "u@e", "initiativeKey": "K-1" }
      },
      "expectStatus": 200,
      "expectBodyIncludes": { "ok": true }
    },
    {
      "name": "POST /token rejects short token",
      "path": "/jira-admin/token",
      "method": "POST",
      "headers": { "authorization": "Bearer $AUTH_TOKEN", "content-type": "application/json" },
      "body": { "projectId": "$PROJECT_ID", "action": "set", "apiToken": "ab" },
      "expectStatus": 400,
      "expectCode": "INVALID_CONFIG"
    },
    {
      "name": "POST /token saves and returns tokenSet: true",
      "path": "/jira-admin/token",
      "method": "POST",
      "headers": { "authorization": "Bearer $AUTH_TOKEN", "content-type": "application/json" },
      "body": { "projectId": "$PROJECT_ID", "action": "set", "apiToken": "atoken12" },
      "expectStatus": 200,
      "expectBodyIncludes": { "ok": true, "tokenSet": true }
    },
    {
      "name": "POST /token deletes",
      "path": "/jira-admin/token",
      "method": "POST",
      "headers": { "authorization": "Bearer $AUTH_TOKEN", "content-type": "application/json" },
      "body": { "projectId": "$PROJECT_ID", "action": "delete" },
      "expectStatus": 200,
      "expectBodyIncludes": { "tokenSet": false }
    },
    {
      "name": "GET /snapshot/:projectId returns 404 for unknown/private project",
      "path": "/jira-snapshot/00000000-0000-0000-0000-000000000099",
      "method": "GET",
      "expectStatus": 404,
      "expectCode": "NOT_FOUND"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add reference-backend/supabase/tests/contract.json
git commit -m "docs(contract): publishable contract spec with 8 baseline cases"
```

---

## Task 12: Contract test runner

**Files:**
- Create: `reference-backend/supabase/tests/contract.test.ts`

- [ ] **Step 1: Implement runner**

```ts
// reference-backend/supabase/tests/contract.test.ts
// Runs every case in contract.json against a running backend (BASE_URL env).
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

interface Case {
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  expectStatus: number;
  expectCode?: string;
  expectBodyIncludes?: Record<string, unknown>;
}

interface Spec { cases: Case[] }

const BASE = Deno.env.get('BASE_URL') ?? 'http://127.0.0.1:54321/functions/v1';
const AUTH = Deno.env.get('AUTH_TOKEN') ?? '';
const PROJECT_ID = Deno.env.get('PROJECT_ID') ?? '00000000-0000-0000-0000-000000000001';

function substitute(v: string): string {
  return v.replace('$AUTH_TOKEN', AUTH).replace('$PROJECT_ID', PROJECT_ID);
}

const spec = JSON.parse(await Deno.readTextFile(new URL('./contract.json', import.meta.url))) as Spec;

for (const c of spec.cases) {
  Deno.test(c.name, async () => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.headers ?? {})) headers[k] = substitute(v);
    const init: RequestInit = { method: c.method, headers };
    if (c.rawBody !== undefined) init.body = c.rawBody;
    else if (c.body !== undefined) init.body = JSON.stringify(JSON.parse(substitute(JSON.stringify(c.body))));
    const res = await fetch(`${BASE}${c.path}`, init);
    assertEquals(res.status, c.expectStatus, `status for ${c.name}`);
    if (c.expectCode || c.expectBodyIncludes) {
      const body = await res.json();
      if (c.expectCode) assertEquals(body.code, c.expectCode);
      if (c.expectBodyIncludes) {
        for (const [k, v] of Object.entries(c.expectBodyIncludes)) {
          assertEquals((body as Record<string, unknown>)[k], v, `body.${k}`);
        }
      }
    }
  });
}
```

- [ ] **Step 2: Run contract tests against local Supabase**

```bash
# Start Supabase locally and get an auth token (example uses the built-in test user).
cd reference-backend && supabase start
# One-time: seed a user and a project row (replace with your local workflow).
supabase db query "
  insert into auth.users(id, email) values ('11111111-1111-1111-1111-111111111111', 'test@example.com') on conflict do nothing;
  insert into jira_configs(project_id, owner_id) values ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111') on conflict do nothing;
"
# Fetch a JWT via local auth; store as AUTH_TOKEN.
export AUTH_TOKEN=$(supabase gotrue jwt new --sub 11111111-1111-1111-1111-111111111111 2>/dev/null || echo "")
deno test --allow-net --allow-read --allow-env tests/contract.test.ts
```

Expected: 7/8 pass (one "invalid JSON" case needs POST body short-circuit — if failing, confirm handlers return 400 on `await req.json()` reject). If any fail, iterate on the relevant handler, not on the spec.

- [ ] **Step 3: Commit**

```bash
cd ..
git add reference-backend/supabase/tests/contract.test.ts
git commit -m "test(contract): runner that drives contract.json against live backend"
```

---

## Task 13: Reference backend README

**Files:**
- Create: `reference-backend/README.md`

- [ ] **Step 1: Write README**

```markdown
# Reference backend for `@your/jira-view-wrapper` (Supabase)

Implements the [HTTP contract](../docs/http-contract.md) using Supabase Edge Functions + Postgres RLS. Anyone can swap this for Cloudflare Workers, Hono, Express, etc. by satisfying the same contract.

## Tables

- `jira_configs` — per-project Jira config JSON; RLS restricts to owner.
- `jira_credentials` — per-project Jira API token; service-role only.
- `jira_snapshots` — normalized snapshot JSON; public-readable when `jira_configs.is_public = true`.

## Functions

- `jira-admin` — three path-routed endpoints (`/config`, `/token`, `/sync`). Requires `Authorization: Bearer <JWT>`.
- `jira-snapshot` — public `GET /:projectId`. Deployed with `--no-verify-jwt`.

## Local setup

```bash
cd reference-backend
supabase start
supabase db reset
supabase functions serve jira-admin --env-file .env.local &
supabase functions serve jira-snapshot --no-verify-jwt --env-file .env.local &
```

## Deploy

```bash
supabase link --project-ref <your-project>
supabase db push
supabase functions deploy jira-admin
supabase functions deploy jira-snapshot --no-verify-jwt
```

## Environment variables

| Name | Provided by |
|---|---|
| `SUPABASE_URL` | Supabase runtime |
| `SUPABASE_ANON_KEY` | Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase runtime |

## Kill switch

Flip `jira_configs.is_public = false` to block all public reads for a project without deleting the snapshot.

## Contract tests

```bash
BASE_URL=http://127.0.0.1:54321/functions/v1 \
AUTH_TOKEN=<jwt> \
PROJECT_ID=<uuid> \
  deno test --allow-net --allow-read --allow-env supabase/tests/contract.test.ts
```

All cases in `supabase/tests/contract.json` should pass.
```

- [ ] **Step 2: Commit**

```bash
git add reference-backend/README.md
git commit -m "docs(backend): reference backend README"
```

---

## End-of-plan verification

- [ ] All migrations apply cleanly on a fresh `supabase db reset`.
- [ ] `deno test reference-backend/supabase/functions/jira-admin/tests/` passes.
- [ ] Contract tests pass against local Supabase.
- [ ] `curl` of an unauthenticated `GET /jira-snapshot/<uuid>` returns the expected 404/410/200 per `is_public` state.

Plan 2 complete when the checklist above is green.
