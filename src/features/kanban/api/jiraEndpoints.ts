/**
 * Typed wrappers around the Jira REST API v3 endpoints used by the Kanban feature.
 */

import { jiraFetch } from './jiraClient';
import type { JiraRawIssue, JiraRawStatus } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// /myself
// ─────────────────────────────────────────────────────────────────────────────

export async function getMyself(
  host: string,
  email: string,
  token: string,
): Promise<{ displayName: string; emailAddress: string }> {
  return jiraFetch<{ displayName: string; emailAddress: string }>(
    host,
    email,
    token,
    'myself',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /project/search
// ─────────────────────────────────────────────────────────────────────────────

interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrls: Record<string, string>;
}

export async function getProjects(
  host: string,
  email: string,
  token: string,
): Promise<JiraProject[]> {
  const result = await jiraFetch<{ values: JiraProject[] }>(
    host,
    email,
    token,
    'project/search',
    { maxResults: '200', expand: 'description' },
  );
  return result.values;
}

// ─────────────────────────────────────────────────────────────────────────────
// /project/{key}/statuses
// ─────────────────────────────────────────────────────────────────────────────

interface JiraIssueTypeStatuses {
  statuses: JiraRawStatus[];
}

/**
 * Returns the unique list of statuses for a project, de-duplicated across
 * all issue types (Jira returns one status list per issue type, and they
 * overlap extensively).
 */
export async function getProjectStatuses(
  host: string,
  email: string,
  token: string,
  projectKey: string,
): Promise<JiraRawStatus[]> {
  const issueTypes = await jiraFetch<JiraIssueTypeStatuses[]>(
    host,
    email,
    token,
    `project/${projectKey}/statuses`,
  );

  // De-duplicate by status ID using a Map
  const seen = new Map<string, JiraRawStatus>();
  for (const issueType of issueTypes) {
    for (const status of issueType.statuses) {
      if (!seen.has(status.id)) {
        seen.set(status.id, status);
      }
    }
  }

  return Array.from(seen.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// /search/jql
// ─────────────────────────────────────────────────────────────────────────────

interface JiraSearchResult {
  issues: JiraRawIssue[];
  total: number;
  maxResults: number;
}

export async function searchIssues(
  host: string,
  email: string,
  token: string,
  jql: string,
  startAt = 0,
): Promise<JiraSearchResult> {
  return jiraFetch<JiraSearchResult>(
    host,
    email,
    token,
    'search/jql',
    {
      jql,
      startAt: String(startAt),
      maxResults: '100',
      fields: 'summary,status,priority,issuetype,assignee,duedate,updated,parent,customfield_10014',
    },
  );
}
