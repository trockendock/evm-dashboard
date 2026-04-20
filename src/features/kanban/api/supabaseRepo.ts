/**
 * All Supabase queries for Kanban feature tables.
 * Throws on any Supabase error. Guards against supabase === null.
 */

import { supabase } from '../../../lib/supabase';
import type {
  BoardProject,
  JiraInstance,
  StatusOverride,
  Ticket,
} from '../types';

function assertClient(
  client: typeof supabase,
): asserts client is NonNullable<typeof supabase> {
  if (!client) {
    throw new Error('Supabase not configured');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// jira_instances
// ─────────────────────────────────────────────────────────────────────────────

export async function getInstances(): Promise<JiraInstance[]> {
  assertClient(supabase);
  const { data, error } = await supabase
    .from('jira_instances')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as JiraInstance[];
}

export async function upsertInstance(
  data: Omit<JiraInstance, 'created_at'> & { id?: string },
): Promise<JiraInstance> {
  assertClient(supabase);
  const { data: row, error } = await supabase
    .from('jira_instances')
    .upsert(data, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return row as JiraInstance;
}

export async function deleteInstance(id: string): Promise<void> {
  assertClient(supabase);
  const { error } = await supabase
    .from('jira_instances')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// jira_board_projects
// ─────────────────────────────────────────────────────────────────────────────

export async function getBoardProjects(instanceId?: string): Promise<BoardProject[]> {
  assertClient(supabase);
  let query = supabase
    .from('jira_board_projects')
    .select('*')
    .order('display_order', { ascending: true });

  if (instanceId !== undefined) {
    query = query.eq('instance_id', instanceId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as BoardProject[];
}

export async function upsertBoardProject(
  data: Omit<BoardProject, 'created_at'> & { id?: string },
): Promise<BoardProject> {
  assertClient(supabase);
  const { data: row, error } = await supabase
    .from('jira_board_projects')
    .upsert(data, { onConflict: 'instance_id,project_key' })
    .select()
    .single();
  if (error) throw error;
  return row as BoardProject;
}

export async function deleteBoardProject(id: string): Promise<void> {
  assertClient(supabase);
  const { error } = await supabase
    .from('jira_board_projects')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// jira_status_overrides
// ─────────────────────────────────────────────────────────────────────────────

export async function getStatusOverrides(boardProjectId: string): Promise<StatusOverride[]> {
  assertClient(supabase);
  const { data, error } = await supabase
    .from('jira_status_overrides')
    .select('*')
    .eq('board_project_id', boardProjectId);
  if (error) throw error;
  return data as StatusOverride[];
}

export async function upsertStatusOverride(
  data: Omit<StatusOverride, 'id'>,
): Promise<StatusOverride> {
  assertClient(supabase);
  const { data: row, error } = await supabase
    .from('jira_status_overrides')
    .upsert(data, { onConflict: 'board_project_id,jira_status_id' })
    .select()
    .single();
  if (error) throw error;
  return row as StatusOverride;
}

export async function deleteStatusOverride(id: string): Promise<void> {
  assertClient(supabase);
  const { error } = await supabase
    .from('jira_status_overrides')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// jira_tickets_cache
// ─────────────────────────────────────────────────────────────────────────────

export async function getTicketsForProjects(boardProjectIds: string[]): Promise<Ticket[]> {
  assertClient(supabase);
  if (boardProjectIds.length === 0) return [];
  const { data, error } = await supabase
    .from('jira_tickets_cache')
    .select('*')
    .in('board_project_id', boardProjectIds)
    .order('issue_key', { ascending: true });
  if (error) throw error;
  return data as Ticket[];
}

export async function upsertTickets(tickets: Omit<Ticket, 'id'>[]): Promise<void> {
  assertClient(supabase);
  if (tickets.length === 0) return;
  const { error } = await supabase
    .from('jira_tickets_cache')
    .upsert(tickets, { onConflict: 'board_project_id,issue_key' });
  if (error) throw error;
}

/**
 * Deletes stale tickets for a board project that are no longer in activeKeys.
 * If activeKeys is empty, all tickets for the project are deleted (full wipe).
 */
export async function deleteStaleTickets(
  boardProjectId: string,
  activeKeys: string[],
): Promise<void> {
  assertClient(supabase);

  if (activeKeys.length === 0) {
    // Full wipe — no active tickets remain for this project
    const { error } = await supabase
      .from('jira_tickets_cache')
      .delete()
      .eq('board_project_id', boardProjectId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('jira_tickets_cache')
    .delete()
    .eq('board_project_id', boardProjectId)
    .not('issue_key', 'in', `(${activeKeys.join(',')})`);
  if (error) throw error;
}
