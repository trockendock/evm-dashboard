# Jira View Wrapper — Extraction Design

**Status:** Approved
**Date:** 2026-04-23
**Author:** Pascal Müller (EVM project)
**Scope:** Extract the existing Jira integration from EVM (`src/App.jsx` + `supabase/functions/jira-*`) into a standalone, framework-agnostic web-component package that can be reused by other applications with minimal dependencies.

---

## 1. Goal

The current EVM app ships a Jira integration scattered across three layers:
- React UI inside `src/App.jsx` (settings panel ~2951–3046, `JiraTokenField` at 531, `jiraSync` at 1071, `saveJiraToken`/`deleteJiraToken` at 1134/1145).
- Supabase Edge Functions `jira-proxy` and `jira-save-credentials`.
- Postgres tables `jira_credentials` and `projects.jira_config`.

The goal is to extract this integration into a standalone package that:

- Is **framework-agnostic** (web components, usable from plain HTML, React, Vue, Angular, etc.).
- Has **one runtime dependency** (`lit`).
- Supports **two audiences**: authenticated admins (who configure and sync) and unauthenticated public viewers (who only see snapshots).
- Ships a **reference Supabase backend** but is not coupled to Supabase — any HTTP backend satisfying the documented contract works.
- Is **clean-room extracted**: EVM keeps its current code; the wrapper is a greenfield package.

## 2. Non-goals

- Migrating EVM itself to the wrapper (explicit future-work; documented in `docs/migration-from-evm.md`).
- Live-updating public views (the snapshot model is deliberately pull-based with admin-driven sync).
- Custom-field passthrough in snapshots (security-driven restriction — see §5).
- Rendering Jira-specific artifacts beyond the normalized `Issue` shape (attachments, comments, subtasks).
- Visual-regression tests or a11y-compliance tooling in v1.

## 3. Architecture

A new repo, standalone from EVM:

```
jira-view-wrapper/
├── src/                     # published bundle
│   ├── jira-admin-panel.ts
│   ├── jira-public-view.ts
│   ├── api-client.ts        # plain fetch wrapper
│   ├── types.ts             # shared TS types
│   └── index.ts             # registers both custom elements
├── reference-backend/       # NOT part of the published bundle
│   └── supabase/
│       ├── functions/
│       │   ├── jira-admin/      # config + token + sync in one handler
│       │   └── jira-snapshot/   # public GET (anon-readable)
│       └── migrations/
│           ├── 001_jira_config.sql
│           ├── 002_jira_credentials.sql
│           └── 003_jira_snapshots.sql
├── docs/
│   ├── http-contract.md     # the JSON API any backend must implement
│   ├── snapshot-schema.md
│   ├── theming.md
│   └── migration-from-evm.md
├── example/
│   ├── index.html           # static demo consuming the IIFE bundle
│   └── react-demo/          # React+Vite consumer for QA
├── tests/
│   ├── unit/                # component behavior
│   ├── contract/            # validates reference backend
│   └── e2e/                 # Playwright against mock backend
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE                  # MIT
```

### Data flow

1. Admin opens a page rendering `<jira-admin-panel api-base=… auth-token=… project-id=…>`. Fills in config form, saves token, clicks **Sync**.
2. Component `POST`s to the consumer-provided `api-base`. Reference backend: authenticates the JWT, fetches from Jira REST, normalizes issues, upserts a row in `jira_snapshots` (public-readable).
3. Any page, anywhere, renders `<jira-public-view snapshot-url="…/snapshot/:projectId">`. It `GET`s the snapshot JSON (no auth) and renders a table.

### Core decoupling contracts

- The component bundle knows **nothing** about Supabase. It talks HTTP + JSON.
- The component bundle knows **nothing** about Jira's field shape. It talks the normalized snapshot schema (§5).
- The reference backend is swappable — Cloudflare Workers, Hono, Express — anything implementing the four endpoints works.

## 4. HTTP contract

All components speak to any backend that implements these four endpoints.

### Admin endpoints (caller-supplied auth)

```
POST /config
  Headers: Authorization: Bearer <auth-token>
  Body: {
    projectId: string,
    config: {
      domain: string,             // "firma.atlassian.net"
      email: string,
      initiativeKey: string,      // "PROJ-123"
      linkTypeName?: string,      // default "is part of"
      startDateField?: string,    // default "customfield_10015"
      endDateField?: string,      // default "duedate"
      moscowField?: string | null,
      statusMapping?: { [jiraStatus: string]: "To Do" | "In Progress" | "Done" }
    }
  }
  → 200 { ok: true }

POST /token
  Body: { projectId: string, action: "set" | "delete", apiToken?: string }
  → 200 { ok: true, tokenSet: boolean }

POST /sync
  Body: { projectId: string }
  → 200 { ok: true, syncedAt: ISO8601, issueCount: number }
  (Server-side: fetch from Jira → normalize → upsert snapshot)
```

### Public endpoint (no auth)

```
GET /snapshot/:projectId
  → 200 IssueSnapshot        (see §5)
  → 404 if no snapshot yet
  → 410 if the project disabled public viewing
```

### Uniform error shape

```
non-2xx → { error: string, code?: "UNAUTHORIZED" | "NOT_FOUND" | "JIRA_ERROR" | "INVALID_CONFIG" }
```

### Component → endpoint mapping

| Component action | HTTP call |
|---|---|
| `<jira-admin-panel>` save config form | `POST /config` |
| `<jira-admin-panel>` save/delete token | `POST /token` |
| `<jira-admin-panel>` click **Sync** | `POST /sync` then `GET /snapshot/:projectId` to refresh preview |
| `<jira-public-view>` initial load + refresh | `GET /snapshot/:projectId` |

### Admin auth

The component doesn't know the auth scheme. It takes an `auth-token` attribute and sends it as `Authorization: Bearer <auth-token>`. Works for Supabase JWTs, custom API keys, or anything else. Consumer backend interprets it.

## 5. Snapshot schema

Returned by `GET /snapshot/:projectId`. Also fetched by the admin panel after a sync to show what was just written.

```ts
interface IssueSnapshot {
  version: 1;                    // bump on breaking schema changes
  projectId: string;
  syncedAt: string;              // ISO 8601
  initiative: {
    key: string;                 // e.g. "PROJ-123"
    summary?: string;
  };
  issues: Issue[];
}

interface Issue {
  key: string;                   // "PROJ-456"
  summary: string;
  jiraStatus: string;            // raw Jira status name
  mappedStatus: "To Do" | "In Progress" | "Done";
  startDate: string | null;      // ISO date (YYYY-MM-DD)
  endDate: string | null;
  estimateHours: number;         // timeoriginalestimate / 3600, rounded to 0.1
  timeSpentHours: number;        // timespent / 3600, rounded to 0.1
  moscow: "MUST" | "SHOULD" | "COULD" | "WONT" | null;
  url: string;                   // "https://{domain}/browse/{key}" — server-computed
}
```

### Design decisions

- **Mirrors existing mapping logic** in `App.jsx:1088–1107`, so the reference backend reuses a proven normalization.
- **`mappedStatus` pre-resolved server-side** — public view never needs the admin's `statusMapping`.
- **`url` computed server-side** — the public view must not learn the Jira domain (admin config).
- **`version: 1`** — explicit versioning for future schema evolution.

### Explicitly out of v1

- Attachments / subtasks / comments.
- Assignees (privacy concern for public views).
- Custom-field passthrough (prevents misconfigured fields leaking to public JSON).

### Size / caching

Typical snapshot ≲ 50 issues × ~300 bytes = ~15 KB JSON. Reference backend sets `Cache-Control: public, max-age=30, stale-while-revalidate=300` on the public endpoint.

### Error snapshot

`GET /snapshot/:projectId` returns 404 if no sync has succeeded. Public view shows the `empty` slot (or `empty-message` attr). Network errors fire `jira-snapshot-error`.

## 6. Web-component surface

### `<jira-admin-panel>`

**Attributes:**

| Attribute | Required | Purpose |
|---|---|---|
| `api-base` | yes | Base URL (e.g. `https://xyz.functions.supabase.co/jira-admin`) |
| `auth-token` | yes | Sent as `Authorization: Bearer …` |
| `project-id` | yes | Opaque string identifying the project |
| `locale` | no | `"de"` (default) or `"en"` |
| `read-only` | no | Boolean attr; disables all form fields |

**Events:**

```ts
"jira-config-saved"    detail: { projectId: string, config: JiraConfig }
"jira-token-changed"   detail: { projectId: string, tokenSet: boolean }
"jira-sync-completed"  detail: { projectId: string, syncedAt: string, issueCount: number }
"jira-error"           detail: { operation: "config"|"token"|"sync", message: string, code?: string }
```

**Slots:** none (admin panel is intentionally opinionated).

### `<jira-public-view>`

**Attributes:**

| Attribute | Required | Purpose |
|---|---|---|
| `snapshot-url` | yes | Full URL to `GET /snapshot/:projectId` |
| `refresh-interval` | no | Seconds between auto-refetch (default `0`) |
| `locale` | no | Same as above |
| `empty-message` | no | Override "no data yet" placeholder |

**Events:**

```ts
"jira-snapshot-loaded"  detail: { snapshot: IssueSnapshot }
"jira-snapshot-error"   detail: { status: number, message: string }
```

**Slots in v1:** `header`, `empty`.
**Slots documented as future (not implemented in v1):** `row` (custom row template).

### Events bubble with `composed: true`

So they cross the Shadow DOM boundary into the light-DOM where consumers listen. No callback-property escape hatch — events only.

### Styling

- Shadow DOM, scoped CSS.
- Theming via ~15 CSS custom properties on the host (`--jwv-bg`, `--jwv-fg`, `--jwv-accent`, `--jwv-border`, `--jwv-status-done-bg`, `--jwv-status-done-fg`, `--jwv-font`, etc.). Full list in `docs/theming.md`.
- **No `::part()` exposed in v1** — deferred to avoid accidental API lock-in.

## 7. Reference backend (Supabase)

Ships in `reference-backend/supabase/`. Not part of the published npm bundle. Anyone can swap it out by implementing §4's HTTP contract.

### Edge Functions

**`jira-admin`** — single Edge Function that routes on `request.url` pathname to implement the three admin endpoints from §4. Replaces EVM's `jira-save-credentials` and `jira-proxy`, plus adds snapshot writing.

```
POST /functions/v1/jira-admin/config   → §4 POST /config
POST /functions/v1/jira-admin/token    → §4 POST /token
POST /functions/v1/jira-admin/sync     → §4 POST /sync
```

So `<jira-admin-panel api-base="https://xyz.functions.supabase.co/jira-admin" …>` appends `/config`, `/token`, `/sync` per action. The HTTP contract stays path-based; collapsing into one Edge Function is a Supabase-specific internal detail that does not leak to the contract.

Responsibilities per path:
- `/config` — validate JiraConfig shape, upsert into `jira_configs` (RLS ownership check).
- `/token` — same semantics as EVM's current `jira-save-credentials`. Dispatches on the request body's `action: "set" | "delete"`. Service-role writes `jira_credentials`. Token never leaves the server.
- `/sync`:
  1. Verify JWT + ownership (RLS on `jira_configs`).
  2. Load config + token.
  3. Call Jira `/rest/api/3/search` with JQL `issue in linkedIssues("{initiativeKey}", "{linkTypeName}")`.
  4. Normalize each issue to the `Issue` shape (reusing logic from `App.jsx:1088–1107`).
  5. Upsert into `jira_snapshots` (service-role write).
  6. Return `{ ok, syncedAt, issueCount }`.

**`jira-snapshot`** — public-readable. No auth header required. Deployed with `--no-verify-jwt`. RLS on `jira_snapshots` still gates what's returned.

```
GET /functions/v1/jira-snapshot/:projectId
```

- Reads `jira_snapshots` with anon key. Row visibility is enforced via a `SECURITY DEFINER` helper `is_project_public(uuid)` that the `jira_snapshots` RLS policy calls — the helper bypasses RLS on `jira_configs` so the anon role never needs any read privilege on the config table.
- 404 for any case where the snapshot isn't publicly visible: unknown project, `is_public = false`, or not yet synced. The §4 contract permits 410 for the "private" case, but the reference backend deliberately unifies on 404 to avoid leaking the existence of private projects (a standard security property for public enumeration endpoints). Alternative backends that don't care about the enumeration leak MAY return 410.
- `Cache-Control: public, max-age=30, stale-while-revalidate=300`.

### SQL migrations

```sql
-- 001_jira_config.sql
create table jira_configs (
  project_id uuid primary key,
  owner_id uuid not null references auth.users(id),
  config jsonb not null default '{}'::jsonb,   -- matches JiraConfig from §4
  is_public boolean not null default false,    -- admin toggles; safety default
  last_sync_at timestamptz,
  updated_at timestamptz default now()
);
alter table jira_configs enable row level security;
create policy "owner read/write" on jira_configs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 002_jira_credentials.sql
create table jira_credentials (
  project_id uuid primary key references jira_configs(project_id) on delete cascade,
  api_token text not null,
  updated_at timestamptz default now()
);
alter table jira_credentials enable row level security;
-- no policies → service_role only (identical to EVM's current model)

-- 003_jira_snapshots.sql
create table jira_snapshots (
  project_id uuid primary key references jira_configs(project_id) on delete cascade,
  snapshot jsonb not null,                      -- matches IssueSnapshot from §5
  synced_at timestamptz default now()
);
alter table jira_snapshots enable row level security;

-- SECURITY DEFINER helper bypasses RLS on jira_configs so the
-- jira_snapshots policy can check is_public without granting anon any
-- read privilege on the config table (which holds domain, email, etc.).
create or replace function public.is_project_public(p uuid)
  returns boolean
  language sql security definer stable
  set search_path = public
  as $$ select coalesce(is_public, false) from jira_configs where project_id = p $$;
revoke all on function public.is_project_public(uuid) from public;
grant execute on function public.is_project_public(uuid) to anon, authenticated;

create policy "public read when enabled" on jira_snapshots
  for select using (public.is_project_public(project_id));
-- writes: service_role only
```

### Environment variables

Same three EVM's functions require: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No new secrets.

### Deployment

```bash
supabase functions deploy jira-admin
supabase functions deploy jira-snapshot --no-verify-jwt
supabase db push
```

### Kill switch

`is_public` on `jira_configs` is the kill switch: flipping one boolean invalidates all public reads via RLS without deleting the snapshot.

## 8. Dependencies, bundle, packaging

### Runtime dependency

| Dep | Size (gz) | Why |
|---|---|---|
| `lit` | ~5 KB | Web-component authoring — reactive props, templating, scoped styles |
| — | — | No React, Tailwind, Supabase client, lucide, recharts |

**Bundle budget:** ≤ 25 KB gzipped for both components combined. CI fails builds that exceed it.

### Build outputs

- `dist/jira-wrapper.esm.js` — ES module, tree-shakeable.
- `dist/jira-wrapper.iife.js` — single `<script>` drop-in (auto-registers tags).
- `dist/jira-wrapper.d.ts` — TS types.
- `package.json` fields: `main`, `module`, `types`, `exports`, `sideEffects: false`.
- Node 20 engines.

### Consumer integration

**Plain HTML:**
```html
<script type="module" src="https://unpkg.com/@your/jira-view-wrapper/dist/jira-wrapper.iife.js"></script>
<jira-public-view snapshot-url="https://…/snapshot/abc"></jira-public-view>
```

**npm:**
```bash
npm install @your/jira-view-wrapper
```
```ts
import '@your/jira-view-wrapper';  // side-effect import registers tags
```

**React 19 consumer:** Same import. React 19 handles custom elements natively; a ~20-line example in README shows the idiomatic ref-based event wiring.

### Versioning

- Semver, starting at `0.1.0`. Breaking changes pre-`1.0` allowed but documented.
- Snapshot `version` field independent of package semver — bumped only when the schema changes incompatibly.

### License

MIT.

### Release pipeline

Publish via GitHub Actions on git tag push. CI checks:
1. Typecheck (`tsc --noEmit`).
2. Unit tests (Chrome headless).
3. Contract tests (reference backend vs `http-contract.md`).
4. Bundle-size budget.
5. E2E smoke (on tag only).
6. `npm publish`.

## 9. Testing strategy

### Unit tests (`tests/unit/`)

- **Runner:** `@web/test-runner` (real browser — Shadow DOM needs real DOM; jsdom's Shadow DOM implementation is incomplete and produces false confidence).
- **Focus:** attribute → rendered state, event emission, error states, snapshot rendering.
- Tests query Shadow DOM directly (regressions in scoping/theming are caught).

### Contract tests (`tests/contract/`)

- Validates reference backend against `docs/http-contract.md`.
- Driven by a JSON spec (`contract.json`) parameterizing each endpoint × (happy, 401, 404, 400, 500).
- **The spec is published as a file** so third-party backend authors can run it against their implementation.
- Jira REST mocked via `msw` at the Deno-function level.

### E2E smoke (`tests/e2e/`)

- **Runner:** Playwright.
- **Two flows only:** happy (configure + sync → snapshot written → public view renders correctly) and broken-token (admin gets `jira-error`).
- Runs on release tags only.

### Explicitly not tested in v1

- Real Jira API (mapping covered by unit tests with canned fixtures).
- Performance benchmarks.
- Visual regression.
- a11y compliance (deferred until there's user demand).

### CI on every PR

1. `tsc --noEmit`.
2. Unit tests.
3. Contract tests (local reference backend in Deno).
4. Bundle-size budget.

## 10. Key decisions and rationale

| Decision | Why |
|---|---|
| Web components over React | Framework-agnostic distribution; single-line integration for any consumer. |
| `lit` as the sole runtime dep | 5 KB is a fair price for maintainable reactive templating; hand-rolled DOM bitrots. |
| Snapshot model (admin syncs, public reads JSON) | Preserves the security contract (token stays server-side); avoids exposing the proxy to unauthenticated traffic. |
| `version: 1` field in snapshot | Schema evolution without silent breaks. |
| `is_public` defaults to `false` | Safety default — admin must opt in to public viewing per project. |
| Separate `jira_configs` table (not EVM's `projects`) | Makes the wrapper installable in a vacuum. |
| Pre-compute `mappedStatus` and `url` server-side | Clients stay dumb; transformations don't need to be re-implemented per consumer. |
| No custom-field passthrough | Prevents accidental leaking of sensitive Jira fields to public JSON. |
| Contract tests as a published file | Turns docs into executable spec; enables alternative-backend authors to verify interchangeability. |

## 11. Open questions / future work

- Migrating EVM itself to the wrapper (currently out of scope; separate design).
- Live-updating public views via SSE or polling hints (defer until use case emerges).
- `row` slot in `<jira-public-view>` (documented as future, no v1 code).
- `::part()` theming hatch (deferred until CSS custom properties prove insufficient).
- Localization beyond `de` / `en` (add as needed; current i18n boundary is a small strings table).
