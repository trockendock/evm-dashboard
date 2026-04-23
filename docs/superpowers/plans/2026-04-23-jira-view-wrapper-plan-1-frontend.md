# Jira View Wrapper — Plan 1: Frontend Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-23-jira-view-wrapper-extraction-design.md` (sections 3, 4, 5, 6, 8, 9)

**Goal:** Build the publishable `@your/jira-view-wrapper` npm package containing the two web components, typed API client, and unit tests. Output: a `dist/` with ESM+IIFE bundles that work against any HTTP backend implementing the §4 contract (tested here against mocked backends only).

**Architecture:** Lit-based web components with Shadow DOM. Framework-agnostic. One runtime dep (`lit`). Components fetch via a pluggable `JiraApiClient`. Tests run in a real browser via `@web/test-runner` + `@open-wc/testing`, with `msw` mocking backend responses.

**Tech Stack:** TypeScript 5.x, Lit 3.x, tsup (bundler), @web/test-runner, @open-wc/testing, msw, Node 20.

**Target directory:** `/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper/` (new sibling to the EVM 2 repo). All relative paths in this plan are relative to that directory unless otherwise noted.

---

## File Structure (end-state of this plan)

```
jira-view-wrapper/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── web-test-runner.config.mjs
├── .gitignore
├── README.md
├── src/
│   ├── types.ts                    # shared types (JiraConfig, Issue, IssueSnapshot)
│   ├── api-client.ts               # JiraApiClient wraps fetch
│   ├── jira-public-view.ts         # <jira-public-view>
│   ├── jira-admin-panel.ts         # <jira-admin-panel>
│   └── index.ts                    # side-effect imports register both tags
├── tests/unit/
│   ├── helpers/msw-server.ts       # msw bootstrap for tests
│   ├── api-client.test.ts
│   ├── jira-public-view.test.ts
│   └── jira-admin-panel.test.ts
├── example/
│   └── index.html                  # standalone demo using IIFE bundle
└── dist/                           # gitignored
    ├── jira-wrapper.esm.js
    ├── jira-wrapper.iife.js
    └── jira-wrapper.d.ts
```

---

## Task 1: Initialize repo and package.json

**Files:**
- Create: `/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper/package.json`
- Create: `/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper/.gitignore`

- [ ] **Step 1: Create the target directory and init git**

```bash
mkdir -p "/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper"
cd "/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper"
git init -b main
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@your/jira-view-wrapper",
  "version": "0.1.0",
  "description": "Framework-agnostic web components for embedding Jira initiative views. Admin panel + public snapshot view.",
  "type": "module",
  "main": "./dist/jira-wrapper.esm.js",
  "module": "./dist/jira-wrapper.esm.js",
  "types": "./dist/jira-wrapper.d.ts",
  "exports": {
    ".": {
      "types": "./dist/jira-wrapper.d.ts",
      "import": "./dist/jira-wrapper.esm.js"
    },
    "./iife": "./dist/jira-wrapper.iife.js"
  },
  "files": ["dist"],
  "sideEffects": ["./dist/jira-wrapper.esm.js", "./dist/jira-wrapper.iife.js"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "web-test-runner \"tests/**/*.test.ts\" --node-resolve",
    "test:watch": "web-test-runner \"tests/**/*.test.ts\" --node-resolve --watch"
  },
  "engines": { "node": ">=20" },
  "license": "MIT"
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold @your/jira-view-wrapper package"
```

---

## Task 2: Install toolchain and configure build

**Files:**
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `src/index.ts` (placeholder)

- [ ] **Step 1: Install runtime + dev deps**

```bash
npm install lit@^3
npm install -D typescript@^5 tsup@^8 @types/node
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "useDefineForClassFields": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'jira-wrapper': 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outExtension: () => ({ js: '.esm.js' }),
    target: 'es2022',
  },
  {
    entry: { 'jira-wrapper': 'src/index.ts' },
    format: ['iife'],
    globalName: 'JiraViewWrapper',
    sourcemap: true,
    clean: false,
    outExtension: () => ({ js: '.iife.js' }),
    target: 'es2022',
    noExternal: [/.*/],
  },
]);
```

- [ ] **Step 4: Create `src/index.ts` placeholder**

```ts
// Side-effect entry that registers both custom elements once bundled.
// Components are wired up in later tasks.
export const __packageMarker = 'jira-view-wrapper';
```

- [ ] **Step 5: Verify build succeeds**

```bash
npm run build
ls dist
```

Expected: `dist/jira-wrapper.esm.js`, `dist/jira-wrapper.iife.js`, `dist/jira-wrapper.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts src/index.ts
git commit -m "chore: configure TypeScript and tsup bundler"
```

---

## Task 3: Install and configure test runner

**Files:**
- Create: `web-test-runner.config.mjs`
- Create: `tests/unit/helpers/msw-server.ts`
- Create: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Install test tooling**

```bash
npm install -D @web/test-runner @web/dev-server-esbuild @open-wc/testing msw
```

- [ ] **Step 2: Create `web-test-runner.config.mjs`**

```js
import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true, target: 'es2022' })],
  files: ['tests/**/*.test.ts'],
  browsers: [],
  testFramework: {
    config: { ui: 'bdd', timeout: '5000' },
  },
};
```

- [ ] **Step 3: Create msw helper**

```ts
// tests/unit/helpers/msw-server.ts
import { setupWorker, type HttpHandler } from 'msw/browser';

let worker: ReturnType<typeof setupWorker> | null = null;

export async function startMockServer(handlers: HttpHandler[] = []) {
  if (!worker) {
    worker = setupWorker(...handlers);
    await worker.start({ quiet: true, onUnhandledRequest: 'bypass' });
  } else {
    worker.resetHandlers(...handlers);
  }
  return worker;
}

export async function stopMockServer() {
  worker?.stop();
  worker = null;
}
```

- [ ] **Step 4: Create smoke test**

```ts
// tests/unit/smoke.test.ts
import { expect } from '@open-wc/testing';

describe('smoke', () => {
  it('runs in a real browser', () => {
    expect(typeof window).to.equal('object');
    expect(typeof customElements).to.equal('object');
  });
});
```

- [ ] **Step 5: Run and confirm smoke passes**

```bash
npm test
```

Expected: 1 test passes. If it fails because msw needs a service worker file, run `npx msw init public/ --save` first.

- [ ] **Step 6: Commit**

```bash
git add web-test-runner.config.mjs tests/unit/helpers/msw-server.ts tests/unit/smoke.test.ts package.json package-lock.json public/mockServiceWorker.js 2>/dev/null || true
git add -A
git commit -m "chore: configure @web/test-runner and msw"
```

---

## Task 4: Define shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
// src/types.ts
// Shared types — the public contract of this package.
// IssueSnapshot version is bumped when the schema changes incompatibly.

export type MappedStatus = 'To Do' | 'In Progress' | 'Done';
export type Moscow = 'MUST' | 'SHOULD' | 'COULD' | 'WONT';

export interface JiraConfig {
  domain: string;
  email: string;
  initiativeKey: string;
  linkTypeName?: string;
  startDateField?: string;
  endDateField?: string;
  moscowField?: string | null;
  statusMapping?: Record<string, MappedStatus>;
}

export interface Issue {
  key: string;
  summary: string;
  jiraStatus: string;
  mappedStatus: MappedStatus;
  startDate: string | null;
  endDate: string | null;
  estimateHours: number;
  timeSpentHours: number;
  moscow: Moscow | null;
  url: string;
}

export interface IssueSnapshot {
  version: 1;
  projectId: string;
  syncedAt: string;
  initiative: { key: string; summary?: string };
  issues: Issue[];
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'JIRA_ERROR'
  | 'INVALID_CONFIG'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class JiraApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = 'JiraApiError';
    this.code = code;
    this.status = status;
  }
}

export type Locale = 'de' | 'en';
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add JiraConfig, Issue, IssueSnapshot, JiraApiError"
```

---

## Task 5: API client (fetch wrapper + typed endpoints)

**Files:**
- Create: `src/api-client.ts`
- Create: `tests/unit/api-client.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/api-client.test.ts
import { expect } from '@open-wc/testing';
import { http, HttpResponse } from 'msw';
import { startMockServer } from './helpers/msw-server.js';
import { JiraApiClient } from '../../src/api-client.js';
import { JiraApiError, type JiraConfig } from '../../src/types.js';

const base = 'https://example.test/jira-admin';

describe('JiraApiClient', () => {
  afterEach(async () => {
    const { stopMockServer } = await import('./helpers/msw-server.js');
    await stopMockServer();
  });

  it('sends Authorization: Bearer on admin calls', async () => {
    let received = '';
    await startMockServer([
      http.post(`${base}/config`, ({ request }) => {
        received = request.headers.get('authorization') ?? '';
        return HttpResponse.json({ ok: true });
      }),
    ]);
    const client = new JiraApiClient({ apiBase: base, authToken: 'tok-123' });
    await client.saveConfig('proj-1', { domain: 'x', email: 'y', initiativeKey: 'K-1' } as JiraConfig);
    expect(received).to.equal('Bearer tok-123');
  });

  it('throws JiraApiError with mapped code on 401', async () => {
    await startMockServer([
      http.post(`${base}/config`, () =>
        HttpResponse.json({ error: 'nope', code: 'UNAUTHORIZED' }, { status: 401 })
      ),
    ]);
    const client = new JiraApiClient({ apiBase: base, authToken: 't' });
    let err: unknown;
    try {
      await client.saveConfig('p', {} as JiraConfig);
    } catch (e) {
      err = e;
    }
    expect(err).to.be.instanceOf(JiraApiError);
    expect((err as JiraApiError).code).to.equal('UNAUTHORIZED');
    expect((err as JiraApiError).status).to.equal(401);
  });

  it('getSnapshot requires no auth and parses IssueSnapshot', async () => {
    const snapshot = {
      version: 1,
      projectId: 'p',
      syncedAt: '2026-04-23T00:00:00Z',
      initiative: { key: 'PROJ-1' },
      issues: [],
    };
    await startMockServer([
      http.get('https://example.test/snapshot/p', ({ request }) => {
        if (request.headers.get('authorization')) {
          return HttpResponse.json({ error: 'should not auth' }, { status: 400 });
        }
        return HttpResponse.json(snapshot);
      }),
    ]);
    const result = await JiraApiClient.getSnapshot('https://example.test/snapshot/p');
    expect(result.projectId).to.equal('p');
    expect(result.version).to.equal(1);
  });

  it('getSnapshot returns null on 404 (not yet synced)', async () => {
    await startMockServer([
      http.get('https://example.test/snapshot/p', () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 })
      ),
    ]);
    const result = await JiraApiClient.getSnapshot('https://example.test/snapshot/p');
    expect(result).to.equal(null);
  });

  it('maps network failure to NETWORK_ERROR', async () => {
    await startMockServer([
      http.post(`${base}/sync`, () => HttpResponse.error()),
    ]);
    const client = new JiraApiClient({ apiBase: base, authToken: 't' });
    let err: JiraApiError | undefined;
    try {
      await client.sync('p');
    } catch (e) {
      err = e as JiraApiError;
    }
    expect(err?.code).to.equal('NETWORK_ERROR');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: tests fail because `src/api-client.ts` does not yet exist (import error).

- [ ] **Step 3: Implement `src/api-client.ts`**

```ts
// src/api-client.ts
import {
  JiraApiError,
  type ApiErrorCode,
  type IssueSnapshot,
  type JiraConfig,
} from './types.js';

export interface JiraApiClientOptions {
  apiBase: string;
  authToken: string;
}

interface ErrorBody {
  error?: string;
  code?: ApiErrorCode;
}

async function parseError(res: Response): Promise<JiraApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // ignore JSON parse failure
  }
  const code: ApiErrorCode =
    body.code ??
    (res.status === 401 ? 'UNAUTHORIZED' :
     res.status === 404 ? 'NOT_FOUND' :
     res.status === 400 ? 'INVALID_CONFIG' :
     'UNKNOWN');
  return new JiraApiError(body.error ?? `HTTP ${res.status}`, code, res.status);
}

export class JiraApiClient {
  private readonly apiBase: string;
  private readonly authToken: string;

  constructor(opts: JiraApiClientOptions) {
    this.apiBase = opts.apiBase.replace(/\/+$/, '');
    this.authToken = opts.authToken;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new JiraApiError((e as Error).message, 'NETWORK_ERROR', 0);
    }
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  }

  saveConfig(projectId: string, config: JiraConfig): Promise<{ ok: true }> {
    return this.post('/config', { projectId, config });
  }

  setToken(projectId: string, apiToken: string): Promise<{ ok: true; tokenSet: boolean }> {
    return this.post('/token', { projectId, action: 'set', apiToken });
  }

  deleteToken(projectId: string): Promise<{ ok: true; tokenSet: boolean }> {
    return this.post('/token', { projectId, action: 'delete' });
  }

  sync(projectId: string): Promise<{ ok: true; syncedAt: string; issueCount: number }> {
    return this.post('/sync', { projectId });
  }

  static async getSnapshot(url: string): Promise<IssueSnapshot | null> {
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET' });
    } catch (e) {
      throw new JiraApiError((e as Error).message, 'NETWORK_ERROR', 0);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as IssueSnapshot;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 5 api-client tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api-client.ts tests/unit/api-client.test.ts
git commit -m "feat(api-client): typed HTTP client with error normalization"
```

---

## Task 6: `<jira-public-view>` skeleton + snapshot loading

**Files:**
- Create: `src/jira-public-view.ts`
- Create: `tests/unit/jira-public-view.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/jira-public-view.test.ts
import { expect, fixture, html, aTimeout } from '@open-wc/testing';
import { http, HttpResponse } from 'msw';
import { startMockServer, stopMockServer } from './helpers/msw-server.js';
import '../../src/jira-public-view.js';
import type { IssueSnapshot } from '../../src/types.js';

const SNAP_URL = 'https://example.test/snapshot/p1';

const sampleSnapshot: IssueSnapshot = {
  version: 1,
  projectId: 'p1',
  syncedAt: '2026-04-23T10:00:00Z',
  initiative: { key: 'PROJ-1', summary: 'Initiative' },
  issues: [
    {
      key: 'PROJ-11',
      summary: 'Build thing',
      jiraStatus: 'In Progress',
      mappedStatus: 'In Progress',
      startDate: '2026-04-01',
      endDate: null,
      estimateHours: 8,
      timeSpentHours: 2,
      moscow: 'MUST',
      url: 'https://x.atlassian.net/browse/PROJ-11',
    },
  ],
};

describe('<jira-public-view>', () => {
  afterEach(async () => { await stopMockServer(); });

  it('fetches snapshot-url on connect and renders issues', async () => {
    await startMockServer([
      http.get(SNAP_URL, () => HttpResponse.json(sampleSnapshot)),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL}></jira-public-view>`);
    await aTimeout(50);
    const rows = el.shadowRoot!.querySelectorAll('[data-testid="issue-row"]');
    expect(rows.length).to.equal(1);
    expect(rows[0].textContent).to.contain('PROJ-11');
    expect(rows[0].textContent).to.contain('Build thing');
  });

  it('shows loading state before fetch completes', async () => {
    await startMockServer([
      http.get(SNAP_URL, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(sampleSnapshot);
      }),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL}></jira-public-view>`);
    expect(el.shadowRoot!.querySelector('[data-testid="loading"]')).to.exist;
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test -- --group jira-public-view 2>/dev/null || npm test
```

Expected: fails because `src/jira-public-view.ts` doesn't exist.

- [ ] **Step 3: Implement `src/jira-public-view.ts` (skeleton + loading + table)**

```ts
// src/jira-public-view.ts
import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { JiraApiClient } from './api-client.js';
import type { IssueSnapshot, Issue, Locale } from './types.js';

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const STRINGS: Record<Locale, Record<string, string>> = {
  de: {
    loading: 'Lade…', empty: 'Noch keine Daten', error: 'Fehler beim Laden',
    key: 'Key', summary: 'Titel', status: 'Status', start: 'Start', end: 'Ende', estimate: 'h',
  },
  en: {
    loading: 'Loading…', empty: 'No data yet', error: 'Failed to load',
    key: 'Key', summary: 'Title', status: 'Status', start: 'Start', end: 'End', estimate: 'h',
  },
};

@customElement('jira-public-view')
export class JiraPublicView extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--jwv-font, system-ui, sans-serif);
      color: var(--jwv-fg, #0f172a);
      background: var(--jwv-bg, #fff);
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid var(--jwv-border, #e2e8f0); }
    th { font-weight: 600; font-size: .85rem; }
    .status { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .75rem; }
    .status-todo      { background: var(--jwv-status-todo-bg, #f1f5f9);  color: var(--jwv-status-todo-fg, #475569); }
    .status-progress  { background: var(--jwv-status-progress-bg, #dbeafe); color: var(--jwv-status-progress-fg, #1e40af); }
    .status-done      { background: var(--jwv-status-done-bg, #dcfce7); color: var(--jwv-status-done-fg, #166534); }
    .msg { padding: 1rem; color: var(--jwv-fg, #0f172a); }
  `;

  @property({ attribute: 'snapshot-url' }) snapshotUrl = '';
  @property({ attribute: 'empty-message' }) emptyMessage = '';
  @property() locale: Locale = 'de';
  @state() private status: Status = 'idle';
  @state() private snapshot: IssueSnapshot | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.snapshotUrl) return;
    this.status = 'loading';
    try {
      const snap = await JiraApiClient.getSnapshot(this.snapshotUrl);
      if (!snap) {
        this.snapshot = null;
        this.status = 'empty';
        return;
      }
      this.snapshot = snap;
      this.status = snap.issues.length === 0 ? 'empty' : 'ready';
      this.dispatchEvent(new CustomEvent('jira-snapshot-loaded', {
        detail: { snapshot: snap }, bubbles: true, composed: true,
      }));
    } catch (e) {
      this.status = 'error';
      this.dispatchEvent(new CustomEvent('jira-snapshot-error', {
        detail: { status: (e as { status?: number }).status ?? 0, message: (e as Error).message },
        bubbles: true, composed: true,
      }));
    }
  }

  private t(key: string): string {
    return STRINGS[this.locale]?.[key] ?? STRINGS.de[key] ?? key;
  }

  private statusClass(m: Issue['mappedStatus']): string {
    return m === 'Done' ? 'status-done' : m === 'In Progress' ? 'status-progress' : 'status-todo';
  }

  override render(): TemplateResult {
    if (this.status === 'loading')
      return html`<div class="msg" data-testid="loading">${this.t('loading')}</div>`;
    if (this.status === 'error')
      return html`<div class="msg" data-testid="error">${this.t('error')}</div>`;
    if (this.status === 'empty' || !this.snapshot)
      return html`<slot name="empty"><div class="msg" data-testid="empty">${this.emptyMessage || this.t('empty')}</div></slot>`;
    return html`
      <slot name="header"></slot>
      <table>
        <thead><tr>
          <th>${this.t('key')}</th><th>${this.t('summary')}</th><th>${this.t('status')}</th>
          <th>${this.t('start')}</th><th>${this.t('end')}</th><th>${this.t('estimate')}</th>
        </tr></thead>
        <tbody>
          ${this.snapshot.issues.map((i) => html`
            <tr data-testid="issue-row">
              <td><a href=${i.url} target="_blank" rel="noopener">${i.key}</a></td>
              <td>${i.summary}</td>
              <td><span class="status ${this.statusClass(i.mappedStatus)}">${i.mappedStatus}</span></td>
              <td>${i.startDate ?? '—'}</td>
              <td>${i.endDate ?? '—'}</td>
              <td>${i.estimateHours}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: both `<jira-public-view>` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/jira-public-view.ts tests/unit/jira-public-view.test.ts
git commit -m "feat(public-view): render snapshot as table with loading state"
```

---

## Task 7: `<jira-public-view>` — error, empty, slots, locale

**Files:**
- Modify: `tests/unit/jira-public-view.test.ts` (append new tests)

The component code from Task 6 already implements these. This task is purely adding tests that lock in the behavior and catch regressions.

- [ ] **Step 1: Append tests to `tests/unit/jira-public-view.test.ts`**

Add these inside the existing `describe('<jira-public-view>')` block:

```ts
  it('shows default empty message on 404', async () => {
    await startMockServer([
      http.get(SNAP_URL, () => HttpResponse.json({ error: 'not found' }, { status: 404 })),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL}></jira-public-view>`);
    await aTimeout(30);
    expect(el.shadowRoot!.querySelector('[data-testid="empty"]')).to.exist;
  });

  it('shows empty-message attribute when set', async () => {
    await startMockServer([
      http.get(SNAP_URL, () => HttpResponse.json({ error: 'not found' }, { status: 404 })),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL} empty-message="Nichts zu sehen"></jira-public-view>`);
    await aTimeout(30);
    expect(el.shadowRoot!.querySelector('[data-testid="empty"]')!.textContent).to.contain('Nichts zu sehen');
  });

  it('respects the "empty" slot', async () => {
    await startMockServer([
      http.get(SNAP_URL, () => HttpResponse.json({ error: 'not found' }, { status: 404 })),
    ]);
    const el = await fixture(html`
      <jira-public-view snapshot-url=${SNAP_URL}>
        <div slot="empty" id="custom-empty">nix da</div>
      </jira-public-view>
    `);
    await aTimeout(30);
    // Default element is still in shadow, but light-DOM slot child renders in the <slot>
    expect(el.querySelector('#custom-empty')).to.exist;
  });

  it('shows error state on 500 and emits jira-snapshot-error', async () => {
    await startMockServer([
      http.get(SNAP_URL, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    ]);
    let eventStatus = -1;
    const onErr = (e: Event) => { eventStatus = (e as CustomEvent).detail.status; };
    window.addEventListener('jira-snapshot-error', onErr);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL}></jira-public-view>`);
    await aTimeout(30);
    window.removeEventListener('jira-snapshot-error', onErr);
    expect(el.shadowRoot!.querySelector('[data-testid="error"]')).to.exist;
    expect(eventStatus).to.equal(500);
  });

  it('renders English strings when locale="en"', async () => {
    await startMockServer([
      http.get(SNAP_URL, async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json(sampleSnapshot);
      }),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL} locale="en"></jira-public-view>`);
    expect(el.shadowRoot!.textContent).to.contain('Loading…');
  });

  it('renders null dates as "—"', async () => {
    await startMockServer([
      http.get(SNAP_URL, () => HttpResponse.json({
        ...sampleSnapshot,
        issues: [{ ...sampleSnapshot.issues[0], startDate: null, endDate: null }],
      })),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL}></jira-public-view>`);
    await aTimeout(30);
    const row = el.shadowRoot!.querySelector('[data-testid="issue-row"]')!;
    expect(row.textContent).to.contain('—');
  });
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all new tests pass (component already implements the behavior).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/jira-public-view.test.ts
git commit -m "test(public-view): lock in empty, error, slots, locale, null dates"
```

---

## Task 8: `<jira-public-view>` — `refresh-interval` auto-refetch

**Files:**
- Modify: `src/jira-public-view.ts` (add `refresh-interval` attribute + interval management)
- Modify: `tests/unit/jira-public-view.test.ts` (append)

- [ ] **Step 1: Write failing test**

Append to the existing describe block:

```ts
  it('auto-refetches when refresh-interval is set', async () => {
    let calls = 0;
    await startMockServer([
      http.get(SNAP_URL, () => {
        calls++;
        return HttpResponse.json(sampleSnapshot);
      }),
    ]);
    const el = await fixture(html`<jira-public-view snapshot-url=${SNAP_URL} refresh-interval="1"></jira-public-view>`);
    await aTimeout(1100);
    el.remove(); // disconnect to stop further intervals
    expect(calls).to.be.greaterThan(1);
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test
```

Expected: `calls` is 1 (no auto-refetch).

- [ ] **Step 3: Add `refreshInterval` property and interval management**

In `src/jira-public-view.ts`, add near the other `@property` decorators:

```ts
  @property({ attribute: 'refresh-interval', type: Number }) refreshInterval = 0;
  private intervalId: number | null = null;
```

In `connectedCallback`, after `void this.load();`:

```ts
    if (this.refreshInterval > 0) {
      this.intervalId = window.setInterval(() => { void this.load(); }, this.refreshInterval * 1000);
    }
```

Add `disconnectedCallback`:

```ts
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: `calls` is ≥ 2.

- [ ] **Step 5: Commit**

```bash
git add src/jira-public-view.ts tests/unit/jira-public-view.test.ts
git commit -m "feat(public-view): refresh-interval auto-refetch"
```

---

## Task 9: `<jira-admin-panel>` skeleton + config form + save

**Files:**
- Create: `src/jira-admin-panel.ts`
- Create: `tests/unit/jira-admin-panel.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/jira-admin-panel.test.ts
import { expect, fixture, html, aTimeout } from '@open-wc/testing';
import { http, HttpResponse } from 'msw';
import { startMockServer, stopMockServer } from './helpers/msw-server.js';
import '../../src/jira-admin-panel.js';

const API = 'https://example.test/jira-admin';

describe('<jira-admin-panel>', () => {
  afterEach(async () => { await stopMockServer(); });

  it('shows form inputs for the required config fields', async () => {
    const el = await fixture(html`
      <jira-admin-panel api-base=${API} auth-token="tok" project-id="p1"></jira-admin-panel>
    `);
    const root = el.shadowRoot!;
    for (const name of ['domain', 'email', 'initiativeKey']) {
      expect(root.querySelector(`[name="${name}"]`), `missing ${name}`).to.exist;
    }
  });

  it('POSTs to /config and fires jira-config-saved on save', async () => {
    let body: unknown = null;
    await startMockServer([
      http.post(`${API}/config`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    ]);
    let saved: unknown = null;
    const onSaved = (e: Event) => { saved = (e as CustomEvent).detail; };
    window.addEventListener('jira-config-saved', onSaved);
    const el = await fixture(html`
      <jira-admin-panel api-base=${API} auth-token="tok" project-id="p1"></jira-admin-panel>
    `);
    const root = el.shadowRoot!;
    (root.querySelector('[name="domain"]') as HTMLInputElement).value = 'firma.atlassian.net';
    (root.querySelector('[name="email"]') as HTMLInputElement).value = 'u@firma.ch';
    (root.querySelector('[name="initiativeKey"]') as HTMLInputElement).value = 'PROJ-1';
    (root.querySelector('[data-testid="save-config"]') as HTMLButtonElement).click();
    await aTimeout(50);
    window.removeEventListener('jira-config-saved', onSaved);
    expect(body).to.deep.include({ projectId: 'p1' });
    expect((body as { config: Record<string, string> }).config).to.deep.include({
      domain: 'firma.atlassian.net', email: 'u@firma.ch', initiativeKey: 'PROJ-1',
    });
    expect((saved as { projectId: string }).projectId).to.equal('p1');
  });

  it('read-only disables all inputs', async () => {
    const el = await fixture(html`
      <jira-admin-panel api-base=${API} auth-token="tok" project-id="p1" read-only></jira-admin-panel>
    `);
    const inputs = el.shadowRoot!.querySelectorAll('input');
    inputs.forEach((i) => expect(i.disabled, `input ${i.name} not disabled`).to.equal(true));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: import error for `jira-admin-panel.ts`.

- [ ] **Step 3: Implement skeleton**

```ts
// src/jira-admin-panel.ts
import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { JiraApiClient } from './api-client.js';
import type { JiraConfig, Locale, MappedStatus } from './types.js';

const STRINGS: Record<Locale, Record<string, string>> = {
  de: {
    domain: 'Jira-Domain', email: 'E-Mail', initiativeKey: 'Initiative-Key',
    linkType: 'Link-Typ', startField: 'Start-Datumsfeld', endField: 'End-Datumsfeld',
    moscowField: 'MoSCoW-Feld', save: 'Speichern', sync: 'Jira Sync', token: 'API-Token',
    setToken: 'Speichern', deleteToken: 'Entfernen', tokenSet: 'Token gespeichert',
    addMapping: 'Mapping hinzufügen',
  },
  en: {
    domain: 'Jira domain', email: 'Email', initiativeKey: 'Initiative key',
    linkType: 'Link type', startField: 'Start date field', endField: 'End date field',
    moscowField: 'MoSCoW field', save: 'Save', sync: 'Sync', token: 'API token',
    setToken: 'Save', deleteToken: 'Remove', tokenSet: 'Token saved',
    addMapping: 'Add mapping',
  },
};

@customElement('jira-admin-panel')
export class JiraAdminPanel extends LitElement {
  static styles = css`
    :host { display: block; font-family: var(--jwv-font, system-ui, sans-serif); color: var(--jwv-fg, #0f172a); }
    form { display: grid; gap: .75rem; max-width: 520px; }
    label { display: grid; gap: .25rem; font-size: .85rem; }
    input, select {
      padding: .5rem; border: 1px solid var(--jwv-border, #e2e8f0); border-radius: .4rem;
      background: var(--jwv-bg, #fff); color: var(--jwv-fg, #0f172a);
    }
    button {
      padding: .5rem 1rem; background: var(--jwv-accent, #7c3aed); color: #fff;
      border: 0; border-radius: .4rem; cursor: pointer;
    }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .err { color: #dc2626; font-size: .85rem; }
  `;

  @property({ attribute: 'api-base' }) apiBase = '';
  @property({ attribute: 'auth-token' }) authToken = '';
  @property({ attribute: 'project-id' }) projectId = '';
  @property() locale: Locale = 'de';
  @property({ attribute: 'read-only', type: Boolean }) readOnly = false;

  @state() private config: JiraConfig = { domain: '', email: '', initiativeKey: '' };
  @state() private busy = false;
  @state() private error = '';

  private client(): JiraApiClient {
    return new JiraApiClient({ apiBase: this.apiBase, authToken: this.authToken });
  }

  private t(k: string): string { return STRINGS[this.locale]?.[k] ?? STRINGS.de[k] ?? k; }

  private onInput(field: keyof JiraConfig) {
    return (e: Event) => {
      this.config = { ...this.config, [field]: (e.target as HTMLInputElement).value };
    };
  }

  private async saveConfig(): Promise<void> {
    this.busy = true; this.error = '';
    try {
      await this.client().saveConfig(this.projectId, this.config);
      this.dispatchEvent(new CustomEvent('jira-config-saved', {
        detail: { projectId: this.projectId, config: this.config },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      this.error = (e as Error).message;
      this.dispatchEvent(new CustomEvent('jira-error', {
        detail: { operation: 'config', message: this.error },
        bubbles: true, composed: true,
      }));
    } finally {
      this.busy = false;
    }
  }

  override render(): TemplateResult {
    const disabled = this.readOnly || this.busy;
    return html`
      <form @submit=${(e: Event) => { e.preventDefault(); void this.saveConfig(); }}>
        <label>${this.t('domain')}
          <input name="domain" .value=${this.config.domain} ?disabled=${disabled} @input=${this.onInput('domain')} />
        </label>
        <label>${this.t('email')}
          <input name="email" type="email" .value=${this.config.email} ?disabled=${disabled} @input=${this.onInput('email')} />
        </label>
        <label>${this.t('initiativeKey')}
          <input name="initiativeKey" .value=${this.config.initiativeKey} ?disabled=${disabled} @input=${this.onInput('initiativeKey')} />
        </label>
        <label>${this.t('linkType')}
          <input name="linkTypeName" .value=${this.config.linkTypeName ?? ''} ?disabled=${disabled}
            @input=${(e: Event) => { this.config = { ...this.config, linkTypeName: (e.target as HTMLInputElement).value }; }} />
        </label>
        <label>${this.t('startField')}
          <input name="startDateField" .value=${this.config.startDateField ?? ''} ?disabled=${disabled}
            @input=${(e: Event) => { this.config = { ...this.config, startDateField: (e.target as HTMLInputElement).value }; }} />
        </label>
        <label>${this.t('endField')}
          <input name="endDateField" .value=${this.config.endDateField ?? ''} ?disabled=${disabled}
            @input=${(e: Event) => { this.config = { ...this.config, endDateField: (e.target as HTMLInputElement).value }; }} />
        </label>
        <label>${this.t('moscowField')}
          <input name="moscowField" .value=${this.config.moscowField ?? ''} ?disabled=${disabled}
            @input=${(e: Event) => { this.config = { ...this.config, moscowField: (e.target as HTMLInputElement).value || null }; }} />
        </label>
        <button data-testid="save-config" type="submit" ?disabled=${disabled}>${this.t('save')}</button>
        ${this.error ? html`<div class="err">${this.error}</div>` : ''}
      </form>
    `;
  }
}

// Exported type stub so later tasks type status mappings without re-import churn
export type { MappedStatus };
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: three `<jira-admin-panel>` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/jira-admin-panel.ts tests/unit/jira-admin-panel.test.ts
git commit -m "feat(admin-panel): config form + save, read-only, error event"
```

---

## Task 10: `<jira-admin-panel>` — token field + status mapping

**Files:**
- Modify: `src/jira-admin-panel.ts`
- Modify: `tests/unit/jira-admin-panel.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the existing describe block:

```ts
  it('POSTs /token with action=set and emits jira-token-changed', async () => {
    let body: { action?: string; apiToken?: string } = {};
    await startMockServer([
      http.post(`${API}/token`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true, tokenSet: body.action !== 'delete' });
      }),
    ]);
    let changed: unknown = null;
    const onChanged = (e: Event) => { changed = (e as CustomEvent).detail; };
    window.addEventListener('jira-token-changed', onChanged);
    const el = await fixture(html`<jira-admin-panel api-base=${API} auth-token="t" project-id="p1"></jira-admin-panel>`);
    const root = el.shadowRoot!;
    (root.querySelector('[data-testid="token-input"]') as HTMLInputElement).value = 'tok-xyz';
    (root.querySelector('[data-testid="token-set"]') as HTMLButtonElement).click();
    await aTimeout(40);
    window.removeEventListener('jira-token-changed', onChanged);
    expect(body.action).to.equal('set');
    expect(body.apiToken).to.equal('tok-xyz');
    expect((changed as { tokenSet: boolean }).tokenSet).to.equal(true);
  });

  it('POSTs /token with action=delete when removing', async () => {
    let action = '';
    await startMockServer([
      http.post(`${API}/token`, async ({ request }) => {
        action = ((await request.json()) as { action: string }).action;
        return HttpResponse.json({ ok: true, tokenSet: false });
      }),
    ]);
    const el = await fixture(html`<jira-admin-panel api-base=${API} auth-token="t" project-id="p1"></jira-admin-panel>`);
    // Force tokenSet=true so the delete button is visible
    (el as unknown as { tokenSet: boolean }).tokenSet = true;
    await (el as LitElement).updateComplete;
    (el.shadowRoot!.querySelector('[data-testid="token-delete"]') as HTMLButtonElement).click();
    await aTimeout(40);
    expect(action).to.equal('delete');
  });

  it('adds and removes statusMapping rows', async () => {
    const el = await fixture(html`<jira-admin-panel api-base=${API} auth-token="t" project-id="p1"></jira-admin-panel>`);
    const root = el.shadowRoot!;
    (root.querySelector('[data-testid="add-mapping"]') as HTMLButtonElement).click();
    await (el as LitElement).updateComplete;
    expect(root.querySelectorAll('[data-testid="mapping-row"]').length).to.equal(1);
    (root.querySelector('[data-testid="remove-mapping"]') as HTMLButtonElement).click();
    await (el as LitElement).updateComplete;
    expect(root.querySelectorAll('[data-testid="mapping-row"]').length).to.equal(0);
  });
```

Add the import for `LitElement` at the top of the test file if not already there:

```ts
import type { LitElement } from 'lit';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: selectors like `[data-testid="token-input"]` not found.

- [ ] **Step 3: Extend `src/jira-admin-panel.ts`**

Add new `@state` properties below the existing ones:

```ts
  @state() private tokenSet = false;
  @state() private tokenValue = '';
  @state() private mappingRows: Array<{ jira: string; app: MappedStatus }> = [];
```

Add methods inside the class (before `render`):

```ts
  private async setToken(): Promise<void> {
    if (this.tokenValue.length < 4) { this.error = 'Token zu kurz'; return; }
    this.busy = true; this.error = '';
    try {
      const res = await this.client().setToken(this.projectId, this.tokenValue);
      this.tokenSet = res.tokenSet;
      this.tokenValue = '';
      this.dispatchEvent(new CustomEvent('jira-token-changed', {
        detail: { projectId: this.projectId, tokenSet: this.tokenSet },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      this.error = (e as Error).message;
      this.dispatchEvent(new CustomEvent('jira-error', {
        detail: { operation: 'token', message: this.error }, bubbles: true, composed: true,
      }));
    } finally { this.busy = false; }
  }

  private async deleteToken(): Promise<void> {
    this.busy = true; this.error = '';
    try {
      await this.client().deleteToken(this.projectId);
      this.tokenSet = false;
      this.dispatchEvent(new CustomEvent('jira-token-changed', {
        detail: { projectId: this.projectId, tokenSet: false },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      this.error = (e as Error).message;
      this.dispatchEvent(new CustomEvent('jira-error', {
        detail: { operation: 'token', message: this.error }, bubbles: true, composed: true,
      }));
    } finally { this.busy = false; }
  }

  private addMapping(): void {
    this.mappingRows = [...this.mappingRows, { jira: '', app: 'To Do' }];
  }
  private removeMapping(i: number): void {
    this.mappingRows = this.mappingRows.filter((_, idx) => idx !== i);
    this.config = { ...this.config, statusMapping: this.mappingToRecord() };
  }
  private updateMapping(i: number, patch: Partial<{ jira: string; app: MappedStatus }>): void {
    this.mappingRows = this.mappingRows.map((row, idx) => idx === i ? { ...row, ...patch } : row);
    this.config = { ...this.config, statusMapping: this.mappingToRecord() };
  }
  private mappingToRecord(): Record<string, MappedStatus> {
    const out: Record<string, MappedStatus> = {};
    for (const row of this.mappingRows) if (row.jira) out[row.jira] = row.app;
    return out;
  }
```

Replace the `render()` method body's closing section (before the final `</form>`) with additions. Add these blocks **immediately before** the `<button data-testid="save-config" …>`:

```ts
        <fieldset style="border:1px solid var(--jwv-border, #e2e8f0); border-radius:.4rem; padding:.75rem;">
          <legend>${this.t('token')}</legend>
          ${this.tokenSet ? html`
            <div>${this.t('tokenSet')}
              <button type="button" data-testid="token-delete" ?disabled=${disabled} @click=${() => this.deleteToken()}>
                ${this.t('deleteToken')}
              </button>
            </div>
          ` : html`
            <input data-testid="token-input" type="password" autocomplete="new-password"
              .value=${this.tokenValue} ?disabled=${disabled}
              @input=${(e: Event) => { this.tokenValue = (e.target as HTMLInputElement).value; }} />
            <button type="button" data-testid="token-set" ?disabled=${disabled || !this.tokenValue}
              @click=${() => this.setToken()}>${this.t('setToken')}</button>
          `}
        </fieldset>

        <fieldset style="border:1px solid var(--jwv-border, #e2e8f0); border-radius:.4rem; padding:.75rem;">
          <legend>Status-Mapping</legend>
          ${this.mappingRows.map((row, i) => html`
            <div data-testid="mapping-row" style="display:flex; gap:.5rem; margin-bottom:.25rem;">
              <input placeholder="Jira-Status" .value=${row.jira} ?disabled=${disabled}
                @input=${(e: Event) => this.updateMapping(i, { jira: (e.target as HTMLInputElement).value })} />
              <select .value=${row.app} ?disabled=${disabled}
                @change=${(e: Event) => this.updateMapping(i, { app: (e.target as HTMLSelectElement).value as MappedStatus })}>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Done</option>
              </select>
              <button type="button" data-testid="remove-mapping" ?disabled=${disabled}
                @click=${() => this.removeMapping(i)}>×</button>
            </div>
          `)}
          <button type="button" data-testid="add-mapping" ?disabled=${disabled} @click=${() => this.addMapping()}>
            ${this.t('addMapping')}
          </button>
        </fieldset>
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all admin-panel tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/jira-admin-panel.ts tests/unit/jira-admin-panel.test.ts
git commit -m "feat(admin-panel): API token field + dynamic status mapping"
```

---

## Task 11: `<jira-admin-panel>` — Sync button + preview + events

**Files:**
- Modify: `src/jira-admin-panel.ts`
- Modify: `tests/unit/jira-admin-panel.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
  it('calls /sync and fires jira-sync-completed, then renders preview count', async () => {
    await startMockServer([
      http.post(`${API}/sync`, () => HttpResponse.json({ ok: true, syncedAt: '2026-04-23T09:00:00Z', issueCount: 3 })),
      http.get('https://example.test/snapshot/p1', () => HttpResponse.json({
        version: 1, projectId: 'p1', syncedAt: '2026-04-23T09:00:00Z',
        initiative: { key: 'PROJ-1' },
        issues: [
          { key: 'A', summary: 'A', jiraStatus: 'Done', mappedStatus: 'Done', startDate: null, endDate: null, estimateHours: 0, timeSpentHours: 0, moscow: null, url: '#' },
          { key: 'B', summary: 'B', jiraStatus: 'Done', mappedStatus: 'Done', startDate: null, endDate: null, estimateHours: 0, timeSpentHours: 0, moscow: null, url: '#' },
          { key: 'C', summary: 'C', jiraStatus: 'Done', mappedStatus: 'Done', startDate: null, endDate: null, estimateHours: 0, timeSpentHours: 0, moscow: null, url: '#' },
        ],
      })),
    ]);
    let syncDetail: { issueCount?: number } = {};
    const onSync = (e: Event) => { syncDetail = (e as CustomEvent).detail; };
    window.addEventListener('jira-sync-completed', onSync);
    const el = await fixture(html`
      <jira-admin-panel api-base=${API} auth-token="t" project-id="p1"
        snapshot-url="https://example.test/snapshot/p1"></jira-admin-panel>
    `);
    (el.shadowRoot!.querySelector('[data-testid="sync"]') as HTMLButtonElement).click();
    await aTimeout(60);
    window.removeEventListener('jira-sync-completed', onSync);
    expect(syncDetail.issueCount).to.equal(3);
    expect(el.shadowRoot!.querySelector('[data-testid="preview-count"]')!.textContent).to.contain('3');
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test
```

Expected: selector `[data-testid="sync"]` not found.

- [ ] **Step 3: Extend `src/jira-admin-panel.ts`**

Add `@property` below the existing ones:

```ts
  @property({ attribute: 'snapshot-url' }) snapshotUrl = '';
```

Add `@state` below existing:

```ts
  @state() private lastIssueCount: number | null = null;
```

Add method:

```ts
  private async sync(): Promise<void> {
    this.busy = true; this.error = '';
    try {
      const res = await this.client().sync(this.projectId);
      this.lastIssueCount = res.issueCount;
      this.dispatchEvent(new CustomEvent('jira-sync-completed', {
        detail: { projectId: this.projectId, syncedAt: res.syncedAt, issueCount: res.issueCount },
        bubbles: true, composed: true,
      }));
      if (this.snapshotUrl) {
        // refresh preview (best-effort; errors logged, not surfaced)
        try {
          const snap = await JiraApiClient.getSnapshot(this.snapshotUrl);
          if (snap) this.lastIssueCount = snap.issues.length;
        } catch { /* ignore */ }
      }
    } catch (e) {
      this.error = (e as Error).message;
      this.dispatchEvent(new CustomEvent('jira-error', {
        detail: { operation: 'sync', message: this.error }, bubbles: true, composed: true,
      }));
    } finally { this.busy = false; }
  }
```

Add sync button + preview count just before the `<button data-testid="save-config">` in `render()`:

```ts
        <div style="display:flex; gap:.5rem; align-items:center;">
          <button type="button" data-testid="sync" ?disabled=${disabled || !this.tokenSet}
            @click=${() => this.sync()}>${this.t('sync')}</button>
          ${this.lastIssueCount !== null
            ? html`<span data-testid="preview-count">${this.lastIssueCount} issues</span>`
            : ''}
        </div>
```

The sync button's disabled check uses `!this.tokenSet`; but for the test to click it we need `tokenSet = true`. Add a pre-set in the test or adjust the disabled logic. Adjust to `disabled && !this.tokenSet`? Safer: keep disabled check but also adjust the test by setting `tokenSet` before click. Update the test as follows — replace the test's click line with:

```ts
    (el as unknown as { tokenSet: boolean }).tokenSet = true;
    await (el as LitElement).updateComplete;
    (el.shadowRoot!.querySelector('[data-testid="sync"]') as HTMLButtonElement).click();
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: sync test passes.

- [ ] **Step 5: Commit**

```bash
git add src/jira-admin-panel.ts tests/unit/jira-admin-panel.test.ts
git commit -m "feat(admin-panel): sync button + post-sync preview + events"
```

---

## Task 12: Register both elements in `src/index.ts`

**Files:**
- Modify: `src/index.ts`
- Create: `tests/unit/index.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/index.test.ts
import { expect } from '@open-wc/testing';
import '../../src/index.js';

describe('index side-effect registration', () => {
  it('registers <jira-public-view>', () => {
    expect(customElements.get('jira-public-view')).to.exist;
  });
  it('registers <jira-admin-panel>', () => {
    expect(customElements.get('jira-admin-panel')).to.exist;
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test
```

Expected: both tags are undefined since `index.ts` is still the placeholder from Task 2.

- [ ] **Step 3: Update `src/index.ts`**

```ts
// src/index.ts
// Side-effect import — registers both custom elements when bundled.
import './jira-public-view.js';
import './jira-admin-panel.js';

export { JiraApiClient } from './api-client.js';
export { JiraApiError } from './types.js';
export type {
  JiraConfig,
  Issue,
  IssueSnapshot,
  MappedStatus,
  Moscow,
  Locale,
  ApiErrorCode,
} from './types.js';
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: both registration tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/unit/index.test.ts
git commit -m "feat: register both tags + re-export public API from index"
```

---

## Task 13: Verify bundle output and size budget

**Files:** none (verification only)

- [ ] **Step 1: Run clean build**

```bash
npm run build
```

Expected: `dist/jira-wrapper.esm.js`, `dist/jira-wrapper.iife.js`, `dist/jira-wrapper.d.ts` present.

- [ ] **Step 2: Gzip-size check**

```bash
gzip -9 -c dist/jira-wrapper.esm.js | wc -c
gzip -9 -c dist/jira-wrapper.iife.js | wc -c
```

Expected: each ≤ 25600 bytes (25 KB). If over budget, re-open the bundle with `npx esbuild --bundle --metafile=meta.json src/index.ts --outfile=/dev/null` and inspect `meta.json` with https://esbuild.github.io/analyze/ to find the culprit.

- [ ] **Step 3: Typecheck passes**

```bash
npm run typecheck
```

- [ ] **Step 4: No commit (verification task)** — but if you created a temporary bundle-analyzer config, discard it.

---

## Task 14: Example HTML demo

**Files:**
- Create: `example/index.html`
- Create: `example/mock-snapshot.json`

- [ ] **Step 1: Create `example/mock-snapshot.json`**

```json
{
  "version": 1,
  "projectId": "demo",
  "syncedAt": "2026-04-23T08:00:00Z",
  "initiative": { "key": "DEMO-1", "summary": "Demo Initiative" },
  "issues": [
    {
      "key": "DEMO-10", "summary": "Design review",
      "jiraStatus": "Done", "mappedStatus": "Done",
      "startDate": "2026-04-01", "endDate": "2026-04-10",
      "estimateHours": 8, "timeSpentHours": 7, "moscow": "MUST",
      "url": "https://example.atlassian.net/browse/DEMO-10"
    },
    {
      "key": "DEMO-11", "summary": "Implement API",
      "jiraStatus": "In Progress", "mappedStatus": "In Progress",
      "startDate": "2026-04-11", "endDate": null,
      "estimateHours": 16, "timeSpentHours": 4, "moscow": "SHOULD",
      "url": "https://example.atlassian.net/browse/DEMO-11"
    }
  ]
}
```

- [ ] **Step 2: Create `example/index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>jira-view-wrapper demo</title>
  <style>
    body { font-family: system-ui; padding: 2rem; background: #f8fafc; }
    h1 { margin-top: 0; }
    jira-public-view { background: #fff; border-radius: .5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 1rem; }
  </style>
</head>
<body>
  <h1>jira-public-view demo</h1>
  <jira-public-view snapshot-url="./mock-snapshot.json"></jira-public-view>

  <script type="module" src="../dist/jira-wrapper.esm.js"></script>
</body>
</html>
```

- [ ] **Step 3: Manual verification (skip in CI)**

```bash
npx http-server . -p 8080 -c-1
```

Open `http://localhost:8080/example/` and confirm two rows render with status pills.

- [ ] **Step 4: Commit**

```bash
git add example/
git commit -m "docs(example): standalone HTML demo using ESM bundle"
```

---

## Task 15: Package docs + README

**Files:**
- Create: `docs/http-contract.md`
- Create: `docs/snapshot-schema.md`
- Create: `docs/theming.md`
- Create: `README.md`

- [ ] **Step 1: Create `docs/http-contract.md`**

```markdown
# HTTP contract

The web components in this package talk to any backend implementing these four endpoints. The reference Supabase backend in `reference-backend/` is one implementation; others can be written for Hono, Express, Cloudflare Workers, etc.

## Admin endpoints — require caller-supplied `Authorization: Bearer <token>`

### `POST /config`
Body:
```json
{
  "projectId": "opaque-string",
  "config": {
    "domain": "firma.atlassian.net",
    "email": "user@firma.ch",
    "initiativeKey": "PROJ-1",
    "linkTypeName": "is part of",
    "startDateField": "customfield_10015",
    "endDateField": "duedate",
    "moscowField": "priority",
    "statusMapping": { "In Review": "In Progress", "Done": "Done" }
  }
}
```
→ `200 { "ok": true }`

### `POST /token`
Body: `{ "projectId": "…", "action": "set" | "delete", "apiToken": "…" }`
→ `200 { "ok": true, "tokenSet": boolean }`

### `POST /sync`
Body: `{ "projectId": "…" }`
Server fetches from Jira, normalizes, upserts snapshot.
→ `200 { "ok": true, "syncedAt": ISO8601, "issueCount": number }`

## Public endpoint — no auth

### `GET /snapshot/:projectId`
→ `200 IssueSnapshot` (see `snapshot-schema.md`)
→ `404` when not publicly visible (absent, private, or not yet synced)
→ `410` MAY be used by implementations that accept leaking project existence

## Error shape
Any non-2xx response:
```json
{ "error": "human-readable", "code": "UNAUTHORIZED" | "NOT_FOUND" | "JIRA_ERROR" | "INVALID_CONFIG" }
```
```

- [ ] **Step 2: Create `docs/snapshot-schema.md`**

```markdown
# Snapshot schema

`GET /snapshot/:projectId` returns an `IssueSnapshot`:

| Field | Type | Notes |
|---|---|---|
| `version` | `1` | Bump on breaking schema changes. |
| `projectId` | string | Opaque per-project id. |
| `syncedAt` | ISO 8601 string | Server time of last successful sync. |
| `initiative.key` | string | e.g. `"PROJ-1"`. |
| `initiative.summary` | string \| undefined | Optional. |
| `issues` | `Issue[]` | See below. |

`Issue`:

| Field | Type | Notes |
|---|---|---|
| `key` | string | `"PROJ-42"` |
| `summary` | string | Raw Jira summary. |
| `jiraStatus` | string | Raw Jira status name. |
| `mappedStatus` | `"To Do" \| "In Progress" \| "Done"` | Resolved server-side via the admin's `statusMapping`. |
| `startDate` | ISO date string \| null | `YYYY-MM-DD`. |
| `endDate` | ISO date string \| null | `YYYY-MM-DD`. |
| `estimateHours` | number | `timeoriginalestimate / 3600`, rounded to 0.1. |
| `timeSpentHours` | number | `timespent / 3600`, rounded to 0.1. |
| `moscow` | `"MUST" \| "SHOULD" \| "COULD" \| "WONT" \| null` | Extracted from the configured `moscowField`. |
| `url` | string | `https://{domain}/browse/{key}` — server-computed, so clients don't learn the domain. |

## Out of v1
- Attachments, subtasks, comments.
- Assignees (privacy concern for public views).
- Arbitrary custom-field passthrough (restricted to prevent accidental leakage).
```

- [ ] **Step 3: Create `docs/theming.md`**

```markdown
# Theming

All styles are scoped to Shadow DOM. Consumer CSS cannot reach in; components cannot reach out. Theme by setting CSS custom properties on the host element.

## Supported custom properties

| Property | Default | Used by |
|---|---|---|
| `--jwv-font` | `system-ui, sans-serif` | both |
| `--jwv-bg` | `#fff` | both |
| `--jwv-fg` | `#0f172a` | both |
| `--jwv-border` | `#e2e8f0` | both |
| `--jwv-accent` | `#7c3aed` | admin panel (buttons) |
| `--jwv-status-todo-bg` | `#f1f5f9` | public view |
| `--jwv-status-todo-fg` | `#475569` | public view |
| `--jwv-status-progress-bg` | `#dbeafe` | public view |
| `--jwv-status-progress-fg` | `#1e40af` | public view |
| `--jwv-status-done-bg` | `#dcfce7` | public view |
| `--jwv-status-done-fg` | `#166534` | public view |

## Example

```css
jira-public-view {
  --jwv-bg: #1e293b;
  --jwv-fg: #f1f5f9;
  --jwv-border: #334155;
  --jwv-status-done-bg: #065f46;
  --jwv-status-done-fg: #d1fae5;
}
```

`::part()` is deliberately not exposed in v1 to avoid accidental API lock-in. If you need deeper styling control, open an issue describing the use case.
```

- [ ] **Step 4: Create `README.md`**

```markdown
# @your/jira-view-wrapper

Framework-agnostic web components for embedding Jira initiative views.

- `<jira-admin-panel>` — authenticated config form, token management, and sync trigger.
- `<jira-public-view>` — unauthenticated snapshot display.

Talks HTTP + JSON to any backend implementing the [HTTP contract](./docs/http-contract.md). Ships with a reference Supabase backend (see sibling repo / subdirectory).

## Install

```bash
npm install @your/jira-view-wrapper
```

Or drop into plain HTML:

```html
<script type="module" src="https://unpkg.com/@your/jira-view-wrapper/dist/jira-wrapper.iife.js"></script>
```

## Usage

### Public view

```html
<jira-public-view
  snapshot-url="https://your-backend.example.com/snapshot/my-project"
  refresh-interval="60"
  locale="de"
></jira-public-view>
```

### Admin panel

```html
<jira-admin-panel
  api-base="https://your-backend.example.com/jira-admin"
  auth-token="<bearer-jwt-or-api-key>"
  project-id="my-project"
  snapshot-url="https://your-backend.example.com/snapshot/my-project"
></jira-admin-panel>
```

### React 19

```tsx
import '@your/jira-view-wrapper';
import { useEffect, useRef } from 'react';

function Jira() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const onLoaded = (e: Event) => console.log((e as CustomEvent).detail);
    el?.addEventListener('jira-snapshot-loaded', onLoaded);
    return () => el?.removeEventListener('jira-snapshot-loaded', onLoaded);
  }, []);
  return <jira-public-view ref={ref} snapshot-url="…" />;
}
```

## Theming

All styles are scoped to Shadow DOM. Theme via CSS custom properties on the host:

```css
jira-public-view {
  --jwv-bg: #fff;
  --jwv-fg: #0f172a;
  --jwv-border: #e2e8f0;
  --jwv-accent: #7c3aed;
  --jwv-status-done-bg: #dcfce7;
  --jwv-status-done-fg: #166534;
  --jwv-status-progress-bg: #dbeafe;
  --jwv-status-progress-fg: #1e40af;
  --jwv-status-todo-bg: #f1f5f9;
  --jwv-status-todo-fg: #475569;
  --jwv-font: system-ui, sans-serif;
}
```

## Events

### `<jira-public-view>`

| Event | Detail |
|---|---|
| `jira-snapshot-loaded` | `{ snapshot: IssueSnapshot }` |
| `jira-snapshot-error` | `{ status: number; message: string }` |

### `<jira-admin-panel>`

| Event | Detail |
|---|---|
| `jira-config-saved` | `{ projectId, config }` |
| `jira-token-changed` | `{ projectId, tokenSet }` |
| `jira-sync-completed` | `{ projectId, syncedAt, issueCount }` |
| `jira-error` | `{ operation, message, code? }` |

All events bubble and cross the Shadow DOM boundary (`composed: true`).

## License

MIT
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/
git commit -m "docs: README + http-contract + snapshot-schema + theming"
```

---

## End-of-plan verification

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (~18 tests).
- [ ] `npm run build` produces ESM + IIFE ≤ 25 KB gzipped.
- [ ] Open `example/index.html` in a browser; see rendered demo table.

Plan 1 complete when the checklist above is green.
