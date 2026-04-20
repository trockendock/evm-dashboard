/**
 * Sync engine: orchestrates fetching Jira tickets and upserting into Supabase cache.
 */

import { decrypt } from './crypto';
import { searchIssues } from './jiraEndpoints';
import {
  getTicketsForProjects,
  upsertTickets,
  deleteStaleTickets,
} from './supabaseRepo';
import type {
  BoardProject,
  JiraInstance,
  JiraRawIssue,
  StatusCategory,
  StatusOverride,
  SyncProgress,
  Ticket,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function buildDefaultJql(projectKey: string): string {
  return `project = "${projectKey}" AND statusCategory != Done AND updated >= -90d`;
}

export function resolveCategory(
  status: { id: string; statusCategory: { key: string } },
  overrides: StatusOverride[],
): StatusCategory {
  const override = overrides.find((o) => o.jira_status_id === status.id);
  if (override) return override.category;

  switch (status.statusCategory.key) {
    case 'new':
      return 'todo';
    case 'indeterminate':
      return 'in_progress';
    case 'done':
      return 'done';
    default:
      return 'todo';
  }
}

export function mapIssueToTicket(
  issue: JiraRawIssue,
  boardProjectId: string,
  overrides: StatusOverride[],
): Omit<Ticket, 'id'> {
  const fields = issue.fields;
  return {
    board_project_id: boardProjectId,
    issue_key: issue.key,
    summary: fields.summary,
    issue_type: fields.issuetype.name,
    issue_type_icon_url: fields.issuetype.iconUrl,
    priority: fields.priority?.name ?? null,
    priority_icon_url: fields.priority?.iconUrl ?? null,
    assignee_name: fields.assignee?.displayName ?? null,
    assignee_avatar_url: fields.assignee?.avatarUrls['48x48'] ?? null,
    status_id: fields.status.id,
    status_name: fields.status.name,
    status_category: resolveCategory(fields.status, overrides),
    epic_key: fields.parent?.key ?? fields.customfield_10014 ?? null,
    epic_name: fields.parent?.fields.summary ?? null,
    epic_color: null,
    due_date: fields.duedate,
    jira_updated_at: fields.updated ?? null,
    synced_at: new Date().toISOString(),
    raw: issue,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency limiter
// ─────────────────────────────────────────────────────────────────────────────

function createConcurrencyLimiter(maxConcurrent: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && running < maxConcurrent) {
      running++;
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await fn();
    } finally {
      running--;
      next();
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads cached tickets from Supabase for the given board project IDs.
 * Returns immediately without hitting Jira.
 */
export async function loadCache(boardProjectIds: string[]): Promise<Ticket[]> {
  return getTicketsForProjects(boardProjectIds);
}

/**
 * Fetches live data from Jira for all projects and upserts into Supabase cache.
 * Projects are processed with a max concurrency of 4.
 * One failing project does not block others.
 */
export async function revalidate(
  instances: JiraInstance[],
  projects: BoardProject[],
  overrides: Map<string, StatusOverride[]>,
  onProgress: (p: SyncProgress) => void,
): Promise<void> {
  // Build a lookup map: instance_id → JiraInstance
  const instanceMap = new Map<string, JiraInstance>(
    instances.map((inst) => [inst.id, inst]),
  );

  // Group projects by instance_id
  const byInstance = new Map<string, BoardProject[]>();
  for (const project of projects) {
    const existing = byInstance.get(project.instance_id) ?? [];
    existing.push(project);
    byInstance.set(project.instance_id, existing);
  }

  const limit = createConcurrencyLimiter(4);

  // Collect all per-project tasks across all instances
  const tasks: Array<Promise<PromiseSettledResult<void>>> = [];

  for (const [instanceId, instanceProjects] of byInstance) {
    const instance = instanceMap.get(instanceId);
    if (!instance) {
      // Mark all projects for this unknown instance as errors
      for (const project of instanceProjects) {
        onProgress({
          projectId: project.id,
          status: 'error',
          error: `Instance not found: ${instanceId}`,
        });
      }
      continue;
    }

    // Decrypt the API token once per instance (shared across projects)
    const tokenPromise = decrypt(instance.api_token_encrypted).catch((err) => {
      // Mark all projects as errored if we can't decrypt
      for (const project of instanceProjects) {
        onProgress({
          projectId: project.id,
          status: 'error',
          error: `Failed to decrypt API token: ${String(err)}`,
        });
      }
      return null;
    });

    for (const project of instanceProjects) {
      const task = (async (): Promise<PromiseSettledResult<void>> => {
        try {
          await limit(async () => {
            const token = await tokenPromise;
            if (token === null) {
              // Error already reported via tokenPromise.catch above
              return;
            }

            onProgress({ projectId: project.id, status: 'syncing' });

            const jql = project.jql_override ?? buildDefaultJql(project.project_key);

            // Paginate through all issues
            const allIssues: JiraRawIssue[] = [];
            let startAt = 0;

            while (true) {
              const result = await searchIssues(
                instance.host,
                instance.email,
                token,
                jql,
                startAt,
              );
              allIssues.push(...result.issues);
              if (allIssues.length >= result.total || result.issues.length === 0) {
                break;
              }
              startAt += result.issues.length;
            }

            // Map raw issues to our Ticket shape
            const projectOverrides = overrides.get(project.id) ?? [];
            const tickets = allIssues.map((issue) =>
              mapIssueToTicket(issue, project.id, projectOverrides),
            );

            // Upsert tickets, then clean up stale ones independently
            await upsertTickets(tickets);
            const activeKeys = tickets.map((t) => t.issue_key);
            const deleteResult = await Promise.allSettled([deleteStaleTickets(project.id, activeKeys)]);
            if (deleteResult[0].status === 'rejected') {
              console.warn(`[kanban] deleteStaleTickets failed for ${project.project_key}:`, deleteResult[0].reason);
            }

            onProgress({ projectId: project.id, status: 'done' });
          });
          return { status: 'fulfilled', value: undefined };
        } catch (err) {
          onProgress({
            projectId: project.id,
            status: 'error',
            error: String(err),
          });
          return { status: 'rejected', reason: err };
        }
      })();

      tasks.push(task);
    }
  }

  await Promise.allSettled(tasks);
}
