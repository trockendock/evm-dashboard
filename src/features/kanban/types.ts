// ─────────────────────────────────────────────────────────────────────────────
// Domain primitives
// ─────────────────────────────────────────────────────────────────────────────

export type StatusCategory = 'todo' | 'in_progress' | 'done';

// ─────────────────────────────────────────────────────────────────────────────
// Database-backed entities
// ─────────────────────────────────────────────────────────────────────────────

export interface JiraInstance {
  id: string;
  user_id: string | null;
  name: string;
  host: string;
  email: string;
  api_token_encrypted: string;
  color: string;
  created_at: string;
}

export interface BoardProject {
  id: string;
  instance_id: string;
  project_key: string;
  project_name: string;
  jql_override: string | null;
  display_order: number;
  created_at: string;
}

export interface StatusOverride {
  id: string;
  board_project_id: string;
  jira_status_id: string;
  category: StatusCategory;
}

export interface Ticket {
  id: string;
  board_project_id: string;
  issue_key: string;
  summary: string | null;
  issue_type: string | null;
  issue_type_icon_url: string | null;
  priority: string | null;
  priority_icon_url: string | null;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
  status_id: string | null;
  status_name: string | null;
  status_category: StatusCategory;
  epic_key: string | null;
  epic_name: string | null;
  epic_color: string | null;
  due_date: string | null;
  jira_updated_at: string | null;
  synced_at: string;
  raw?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Jira REST API v3 raw shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of a single issue returned by /rest/api/3/search/jql */
export interface JiraRawIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      id: string;
      name: string;
      statusCategory: {
        key: string;
      };
    };
    priority: {
      name: string;
      iconUrl: string;
    } | null;
    issuetype: {
      name: string;
      iconUrl: string;
    };
    assignee: {
      displayName: string;
      avatarUrls: {
        '48x48': string;
      };
    } | null;
    duedate: string | null;
    /** Epic link via parent (next-gen projects) */
    parent?: {
      key: string;
      fields: {
        summary: string;
        status?: {
          statusCategory?: {
            colorName?: string;
          };
        };
      };
    } | null;
    updated: string | null;
    /** Epic link via custom field (classic projects) */
    customfield_10014: string | null;
  };
}

/** Shape of a Jira status object returned by /rest/api/3/project/{key}/statuses */
export interface JiraRawStatus {
  id: string;
  name: string;
  statusCategory: {
    key: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI / sync state
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncProgress {
  projectId: string;
  status: 'syncing' | 'done' | 'error';
  error?: string;
}

export interface BoardFilters {
  search: string;
  instanceIds: string[];
  projectIds: string[];
  assignees: string[];
}
