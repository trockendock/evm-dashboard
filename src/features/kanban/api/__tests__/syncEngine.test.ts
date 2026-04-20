/**
 * Unit tests for pure exported functions from syncEngine.ts:
 *  - buildDefaultJql
 *  - resolveCategory
 *  - mapIssueToTicket
 *
 * Supabase and crypto dependencies are mocked so they never execute.
 */

import { describe, it, expect, vi } from 'vitest'
import type { JiraRawIssue, StatusOverride } from '../../types'

// Mock side-effectful modules so their top-level imports don't fail.
vi.mock('../supabaseRepo', () => ({}))
vi.mock('../crypto', () => ({ decrypt: vi.fn() }))

const { buildDefaultJql, resolveCategory, mapIssueToTicket } = await import('../syncEngine')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<JiraRawIssue['fields']> = {}): JiraRawIssue {
  return {
    id: '10001',
    key: 'CRM-42',
    fields: {
      summary: 'Test issue summary',
      status: {
        id: 'status-1',
        name: 'In Progress',
        statusCategory: { key: 'indeterminate' },
      },
      priority: { name: 'High', iconUrl: 'https://example.com/high.svg' },
      issuetype: { name: 'Story', iconUrl: 'https://example.com/story.svg' },
      assignee: {
        displayName: 'Jane Doe',
        avatarUrls: { '48x48': 'https://example.com/avatar.png' },
      },
      duedate: '2026-12-31',
      parent: undefined,
      updated: '2026-04-01T10:00:00.000Z',
      customfield_10014: null,
      ...overrides,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDefaultJql
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDefaultJql', () => {
  it('returns the correct JQL for a given project key', () => {
    expect(buildDefaultJql('CRM')).toBe(
      'project = "CRM" AND statusCategory != Done AND updated >= -90d',
    )
  })

  it('works for any project key', () => {
    expect(buildDefaultJql('PROJ')).toBe(
      'project = "PROJ" AND statusCategory != Done AND updated >= -90d',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCategory', () => {
  const noOverrides: StatusOverride[] = []

  it('maps statusCategory key "new" → "todo"', () => {
    expect(
      resolveCategory({ id: 's1', statusCategory: { key: 'new' } }, noOverrides),
    ).toBe('todo')
  })

  it('maps statusCategory key "indeterminate" → "in_progress"', () => {
    expect(
      resolveCategory({ id: 's1', statusCategory: { key: 'indeterminate' } }, noOverrides),
    ).toBe('in_progress')
  })

  it('maps statusCategory key "done" → "done"', () => {
    expect(
      resolveCategory({ id: 's1', statusCategory: { key: 'done' } }, noOverrides),
    ).toBe('done')
  })

  it('maps unknown statusCategory key → "todo" (default)', () => {
    expect(
      resolveCategory({ id: 's1', statusCategory: { key: 'whatever' } }, noOverrides),
    ).toBe('todo')
  })

  it('override takes precedence over Jira statusCategory', () => {
    const overrides: StatusOverride[] = [
      { id: 'o1', board_project_id: 'bp1', jira_status_id: 's1', category: 'done' },
    ]
    // Without override this would be "todo" (key "new"), but override forces "done"
    expect(
      resolveCategory({ id: 's1', statusCategory: { key: 'new' } }, overrides),
    ).toBe('done')
  })

  it('override for a different status id is ignored', () => {
    const overrides: StatusOverride[] = [
      { id: 'o1', board_project_id: 'bp1', jira_status_id: 'OTHER', category: 'done' },
    ]
    expect(
      resolveCategory({ id: 's1', statusCategory: { key: 'new' } }, overrides),
    ).toBe('todo')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// mapIssueToTicket
// ─────────────────────────────────────────────────────────────────────────────

describe('mapIssueToTicket', () => {
  const boardProjectId = 'bp-uuid-123'
  const noOverrides: StatusOverride[] = []

  it('maps issue_key correctly', () => {
    const ticket = mapIssueToTicket(makeIssue(), boardProjectId, noOverrides)
    expect(ticket.issue_key).toBe('CRM-42')
  })

  it('maps board_project_id correctly', () => {
    const ticket = mapIssueToTicket(makeIssue(), boardProjectId, noOverrides)
    expect(ticket.board_project_id).toBe(boardProjectId)
  })

  it('prefers parent.key over customfield_10014 for epic_key', () => {
    const issue = makeIssue({
      parent: {
        key: 'EPIC-1',
        fields: { summary: 'The Epic' },
      },
      customfield_10014: 'EPIC-99',
    })
    const ticket = mapIssueToTicket(issue, boardProjectId, noOverrides)
    expect(ticket.epic_key).toBe('EPIC-1')
  })

  it('falls back to customfield_10014 when no parent', () => {
    const issue = makeIssue({
      parent: undefined,
      customfield_10014: 'EPIC-99',
    })
    const ticket = mapIssueToTicket(issue, boardProjectId, noOverrides)
    expect(ticket.epic_key).toBe('EPIC-99')
  })

  it('epic_key is null when neither parent nor customfield_10014', () => {
    const issue = makeIssue({ parent: undefined, customfield_10014: null })
    const ticket = mapIssueToTicket(issue, boardProjectId, noOverrides)
    expect(ticket.epic_key).toBeNull()
  })

  it('uses resolveCategory — override path sets correct status_category', () => {
    const overrides: StatusOverride[] = [
      { id: 'o1', board_project_id: boardProjectId, jira_status_id: 'status-1', category: 'done' },
    ]
    const ticket = mapIssueToTicket(makeIssue(), boardProjectId, overrides)
    expect(ticket.status_category).toBe('done')
  })

  it('uses resolveCategory — default path (indeterminate → in_progress)', () => {
    const ticket = mapIssueToTicket(makeIssue(), boardProjectId, noOverrides)
    expect(ticket.status_category).toBe('in_progress')
  })

  it('assignee_name is null when assignee is null', () => {
    const issue = makeIssue({ assignee: null })
    const ticket = mapIssueToTicket(issue, boardProjectId, noOverrides)
    expect(ticket.assignee_name).toBeNull()
  })

  it('priority is null when priority is null', () => {
    const issue = makeIssue({ priority: null })
    const ticket = mapIssueToTicket(issue, boardProjectId, noOverrides)
    expect(ticket.priority).toBeNull()
  })

  it('priority_icon_url is null when priority is null', () => {
    const issue = makeIssue({ priority: null })
    const ticket = mapIssueToTicket(issue, boardProjectId, noOverrides)
    expect(ticket.priority_icon_url).toBeNull()
  })
})
