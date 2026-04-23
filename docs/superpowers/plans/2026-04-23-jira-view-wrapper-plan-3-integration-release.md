# Jira View Wrapper — Plan 3: Integration, E2E, and Release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-23-jira-view-wrapper-extraction-design.md` (sections 8, 9)

**Depends on:** Plan 1 (frontend package) and Plan 2 (reference backend) are both complete.

**Goal:** Add end-to-end verification that wires the frontend bundle against the reference backend through two Playwright flows, plus a CI pipeline that runs typecheck, unit tests, contract tests, bundle-size check on every PR, and an E2E + publish step on tag pushes.

**Architecture:** Single repo root, two CI jobs (`ci` on PRs, `release` on tag pushes). Playwright uses a msw-backed mock for the Jira REST API so no real Jira credentials are needed.

**Tech Stack:** GitHub Actions, Playwright 1.4x, msw, pnpm or npm (plan uses npm), Deno (already installed for Plan 2 tests).

**Target directory:** `/Users/pascalmuller/Library/Mobile Documents/com~apple~CloudDocs/Claude-Repo/jira-view-wrapper/`. All paths relative to this root.

---

## File Structure (end-state of this plan)

```
jira-view-wrapper/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── tests/e2e/
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   ├── jira-search-response.json
│   │   └── snapshot.json
│   ├── mock-backend.ts
│   └── flows.spec.ts
├── scripts/
│   └── check-bundle-size.mjs
├── LICENSE
└── CHANGELOG.md
```

---

## Task 1: Add LICENSE + CHANGELOG

**Files:**
- Create: `LICENSE`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Pascal Müller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — unreleased

### Added
- `<jira-public-view>` web component with snapshot loading, slots, theming, auto-refresh.
- `<jira-admin-panel>` web component with config form, token management, status mapping, sync.
- `JiraApiClient` typed HTTP client.
- Reference backend (Supabase Edge Functions + migrations).
- Publishable HTTP contract spec and contract-test runner.
```

- [ ] **Step 3: Commit**

```bash
git add LICENSE CHANGELOG.md
git commit -m "chore: add LICENSE (MIT) and CHANGELOG"
```

---

## Task 2: Bundle-size check script

**Files:**
- Create: `scripts/check-bundle-size.mjs`
- Modify: `package.json` (add npm script)

- [ ] **Step 1: Create `scripts/check-bundle-size.mjs`**

```js
// scripts/check-bundle-size.mjs
// Fails if any gzipped bundle exceeds the budget.
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
  'dist/jira-wrapper.esm.js':  25 * 1024,
  'dist/jira-wrapper.iife.js': 25 * 1024,
};

let failed = false;
for (const [path, budget] of Object.entries(BUDGETS)) {
  try {
    const raw = readFileSync(path);
    const gz = gzipSync(raw, { level: 9 });
    const rawKB = (raw.byteLength / 1024).toFixed(1);
    const gzKB = (gz.byteLength / 1024).toFixed(1);
    const mark = gz.byteLength <= budget ? 'OK  ' : 'FAIL';
    console.log(`${mark}  ${path}  raw=${rawKB}KB  gz=${gzKB}KB  budget=${(budget/1024).toFixed(0)}KB`);
    if (gz.byteLength > budget) failed = true;
  } catch (e) {
    console.error(`MISSING  ${path}: ${e.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);
```

- [ ] **Step 2: Add `size` script to `package.json`**

In the `"scripts"` object, add:

```json
    "size": "node scripts/check-bundle-size.mjs"
```

- [ ] **Step 3: Verify it runs after a build**

```bash
npm run build && npm run size
```

Expected: two `OK` lines, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-bundle-size.mjs package.json
git commit -m "chore(ci): bundle-size budget check"
```

---

## Task 3: Playwright setup + mock backend

**Files:**
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/mock-backend.ts`
- Create: `tests/e2e/fixtures/jira-search-response.json`
- Create: `tests/e2e/fixtures/snapshot.json`
- Create: `tests/e2e/index.html` (test harness page)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Create `tests/e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx http-server tests/e2e -p 4173 -c-1 --cors',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Create harness page `tests/e2e/index.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>e2e harness</title></head>
<body>
  <div id="admin-slot"></div>
  <div id="public-slot"></div>
  <script type="module" src="../../dist/jira-wrapper.esm.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create fixture files**

```json
// tests/e2e/fixtures/snapshot.json
{
  "version": 1,
  "projectId": "p-e2e",
  "syncedAt": "2026-04-23T12:00:00Z",
  "initiative": { "key": "PROJ-1" },
  "issues": [
    {
      "key": "PROJ-11", "summary": "First thing",
      "jiraStatus": "Done", "mappedStatus": "Done",
      "startDate": "2026-04-01", "endDate": "2026-04-05",
      "estimateHours": 4, "timeSpentHours": 3.5, "moscow": "MUST",
      "url": "https://x.atlassian.net/browse/PROJ-11"
    },
    {
      "key": "PROJ-12", "summary": "Second thing",
      "jiraStatus": "In Progress", "mappedStatus": "In Progress",
      "startDate": "2026-04-06", "endDate": null,
      "estimateHours": 8, "timeSpentHours": 2, "moscow": "SHOULD",
      "url": "https://x.atlassian.net/browse/PROJ-12"
    }
  ]
}
```

- [ ] **Step 5: Create `tests/e2e/mock-backend.ts`**

This is a small helper used from inside Playwright's `page.route` to intercept backend calls:

```ts
// tests/e2e/mock-backend.ts
import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = JSON.parse(readFileSync(join(__dirname, 'fixtures/snapshot.json'), 'utf8'));

export interface MockBackendOptions {
  adminBase: string;      // e.g. 'https://backend.test/jira-admin'
  snapshotBase: string;   // e.g. 'https://backend.test/snapshot'
  tokenSet?: boolean;     // initial state
  failSync?: boolean;     // for broken-token flow
}

export async function mountMockBackend(page: Page, opts: MockBackendOptions): Promise<void> {
  let tokenSet = opts.tokenSet ?? false;

  await page.route(`${opts.adminBase}/config`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

  await page.route(`${opts.adminBase}/token`, async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (body.action === 'delete') tokenSet = false;
    else tokenSet = true;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, tokenSet }) });
  });

  await page.route(`${opts.adminBase}/sync`, (route) => {
    if (opts.failSync) {
      return route.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'No Jira token stored', code: 'INVALID_CONFIG' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, syncedAt: '2026-04-23T12:00:00Z', issueCount: SNAPSHOT.issues.length }) });
  });

  await page.route(`${opts.snapshotBase}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) }));
}
```

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/ package.json package-lock.json
git commit -m "chore(e2e): Playwright config + mock backend + fixtures"
```

---

## Task 4: E2E flow — happy path

**Files:**
- Create: `tests/e2e/flows.spec.ts`

- [ ] **Step 1: Write happy-path test**

```ts
// tests/e2e/flows.spec.ts
import { test, expect } from '@playwright/test';
import { mountMockBackend } from './mock-backend.js';

const ADMIN = 'https://backend.test/jira-admin';
const SNAP  = 'https://backend.test/snapshot';

test('admin configures, sets token, syncs, then public view renders the snapshot', async ({ page }) => {
  await mountMockBackend(page, { adminBase: ADMIN, snapshotBase: SNAP });
  await page.goto('/');

  // Mount admin panel
  await page.evaluate(({ ADMIN }) => {
    const el = document.createElement('jira-admin-panel');
    el.setAttribute('api-base', ADMIN);
    el.setAttribute('auth-token', 'tok-e2e');
    el.setAttribute('project-id', 'p-e2e');
    el.setAttribute('snapshot-url', 'https://backend.test/snapshot/p-e2e');
    document.getElementById('admin-slot')!.appendChild(el);
  }, { ADMIN });

  const admin = page.locator('jira-admin-panel');

  // Fill config
  await admin.locator('[name="domain"]').fill('x.atlassian.net');
  await admin.locator('[name="email"]').fill('u@e');
  await admin.locator('[name="initiativeKey"]').fill('PROJ-1');
  await admin.locator('[data-testid="save-config"]').click();

  // Set token
  await admin.locator('[data-testid="token-input"]').fill('atoken12');
  await admin.locator('[data-testid="token-set"]').click();
  await expect(admin.locator('[data-testid="token-delete"]')).toBeVisible();

  // Sync
  await admin.locator('[data-testid="sync"]').click();
  await expect(admin.locator('[data-testid="preview-count"]')).toContainText('2');

  // Mount public view
  await page.evaluate(({ SNAP }) => {
    const el = document.createElement('jira-public-view');
    el.setAttribute('snapshot-url', `${SNAP}/p-e2e`);
    document.getElementById('public-slot')!.appendChild(el);
  }, { SNAP });

  const publicView = page.locator('jira-public-view');
  await expect(publicView.locator('[data-testid="issue-row"]')).toHaveCount(2);
  await expect(publicView).toContainText('PROJ-11');
  await expect(publicView).toContainText('First thing');
});
```

- [ ] **Step 2: Run**

```bash
npm run build
npx playwright test tests/e2e/flows.spec.ts
```

Expected: 1 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/flows.spec.ts
git commit -m "test(e2e): happy path — admin → sync → public view renders"
```

---

## Task 5: E2E flow — broken token

**Files:**
- Modify: `tests/e2e/flows.spec.ts`

- [ ] **Step 1: Append test**

```ts
test('admin sync fails with INVALID_CONFIG when no token stored; error event fires', async ({ page }) => {
  await mountMockBackend(page, { adminBase: ADMIN, snapshotBase: SNAP, failSync: true });
  await page.goto('/');

  const errors: unknown[] = [];
  await page.exposeFunction('__pushError', (d: unknown) => errors.push(d));
  await page.evaluate(({ ADMIN }) => {
    const el = document.createElement('jira-admin-panel');
    el.setAttribute('api-base', ADMIN);
    el.setAttribute('auth-token', 'tok-e2e');
    el.setAttribute('project-id', 'p-e2e');
    el.addEventListener('jira-error', (e) => (window as unknown as { __pushError: (d: unknown) => void }).__pushError((e as CustomEvent).detail));
    document.getElementById('admin-slot')!.appendChild(el);
  }, { ADMIN });

  const admin = page.locator('jira-admin-panel');
  // Simulate tokenSet=true in-DOM so sync button is enabled
  await page.evaluate(() => {
    const el = document.querySelector('jira-admin-panel') as unknown as { tokenSet: boolean };
    el.tokenSet = true;
  });
  await admin.locator('[data-testid="sync"]').click();

  await expect.poll(() => errors.length).toBeGreaterThan(0);
  const first = errors[0] as { operation: string; message: string };
  expect(first.operation).toBe('sync');
  expect(first.message).toContain('token');
});
```

- [ ] **Step 2: Run and commit**

```bash
npx playwright test tests/e2e/flows.spec.ts
git add tests/e2e/flows.spec.ts
git commit -m "test(e2e): broken-token flow — sync fires jira-error"
```

---

## Task 6: GitHub Actions CI (PRs)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflow**

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run size

  backend-unit:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: reference-backend
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with: { deno-version: v1.x }
      - run: deno test --allow-read --allow-env supabase/functions/jira-admin/tests/

  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - uses: denoland/setup-deno@v1
        with: { deno-version: v1.x }
      - name: Start Supabase
        working-directory: reference-backend
        run: supabase start
      - name: Seed test user and project
        working-directory: reference-backend
        run: |
          supabase db query "
            insert into auth.users(id, email) values ('11111111-1111-1111-1111-111111111111', 'ci@example.com') on conflict do nothing;
            insert into jira_configs(project_id, owner_id) values ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111') on conflict do nothing;
          "
      - name: Issue JWT for test user
        id: jwt
        working-directory: reference-backend
        run: echo "token=$(supabase gotrue jwt new --sub 11111111-1111-1111-1111-111111111111)" >> $GITHUB_OUTPUT
      - name: Run contract tests
        working-directory: reference-backend
        env:
          BASE_URL: http://127.0.0.1:54321/functions/v1
          AUTH_TOKEN: ${{ steps.jwt.outputs.token }}
          PROJECT_ID: 00000000-0000-0000-0000-000000000001
        run: deno test --allow-net --allow-read --allow-env supabase/tests/contract.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, unit, build, size, and contract tests on PRs"
```

Note: the `contract` job spins up a real Supabase (~60s startup). If the JWT-issuing command changes between Supabase CLI versions, adjust the `Issue JWT` step accordingly — the contract tests only need any valid JWT for the seeded user.

---

## Task 7: Release workflow (E2E + npm publish on tag)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create workflow**

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    tags: ['v*']

jobs:
  e2e-and-publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write    # npm provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm run size
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/e2e/flows.spec.ts
      - run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow — E2E + npm publish on v* tag"
```

Required repo secrets: `NPM_TOKEN` (automation token on the npm org).

---

## Task 8: Tag v0.1.0

- [ ] **Step 1: Final verification**

```bash
npm run typecheck
npm test
npm run build
npm run size
npx playwright test tests/e2e/flows.spec.ts
```

All green.

- [ ] **Step 2: Update CHANGELOG**

Edit `CHANGELOG.md` and change `## [0.1.0] — unreleased` to `## [0.1.0] — 2026-04-23`.

```bash
git add CHANGELOG.md
git commit -m "chore: release v0.1.0"
```

- [ ] **Step 3: Tag and push**

Do NOT push until the user approves the release (npm publish is irreversible).

When approved:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main
git push origin v0.1.0
```

The `release.yml` workflow will run E2E and publish to npm.

---

## End-of-plan verification

- [ ] PR CI passes on a throwaway branch (frontend + backend jobs green).
- [ ] E2E flows pass locally.
- [ ] Bundle-size budget respected.
- [ ] Release workflow file present with `NPM_TOKEN` secret configured.
- [ ] Tag `v0.1.0` cut (after user approval).

Plan 3 complete when the checklist above is green.
