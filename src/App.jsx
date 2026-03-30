import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, Target, DollarSign, Activity, FileSpreadsheet, BarChart3, Settings, X, Cloud, Zap, Filter, Database, GitMerge, Calendar, Lock, Unlock, FolderOpen, Plus, Trash2, ChevronDown, Copy, Wifi, WifiOff, RefreshCw, Flag, Calculator, HelpCircle } from 'lucide-react';
import { supabase } from './lib/supabase';

// ============================================
// RATE HELPERS
// ============================================
const getIssueRate = (issue, rates, defaultRateId) => {
  const rateId = issue.rateId || defaultRateId;
  return rates.find(r => r.id === rateId)?.rate || 0;
};

const formatCurrency = (amount, currency) => {
  return `${currency} ${amount.toLocaleString('de-CH', { maximumFractionDigits: 0 })}`;
};

const formatVal = (hours, rate, currency) => {
  if (!rate || rate === 0) return typeof hours === 'number' && hours % 1 !== 0 ? `${hours.toFixed(1)}h` : `${hours}h`;
  return formatCurrency(hours * rate, currency);
};

const formatValWithHours = (hours, rate, currency) => {
  if (!rate || rate === 0) return typeof hours === 'number' && hours % 1 !== 0 ? `${hours.toFixed(1)}h` : `${hours}h`;
  const h = typeof hours === 'number' && hours % 1 !== 0 ? hours.toFixed(1) : hours;
  return `${formatCurrency(hours * rate, currency)} (${h}h)`;
};

// ============================================
// PV CALCULATION HELPERS
// ============================================
const calcTimeBasedPV = (issues, asOfDate, rates, defaultRateId, hasRates) => {
  const now = new Date(asOfDate);
  let pvH = 0, pvVal = 0;
  issues.forEach(issue => {
    if (!issue.startDate || !issue.endDate) return;
    const start = new Date(issue.startDate);
    const end = new Date(issue.endDate);
    const duration = end - start;
    if (duration <= 0) return;
    const progress = Math.min(1, Math.max(0, (now - start) / duration));
    const estimate = issue.baselineEstimate || getEffectiveEstimate(issue);
    pvH += estimate * progress;
    const rate = hasRates ? getIssueRate(issue, rates, defaultRateId) : 1;
    pvVal += estimate * progress * rate;
  });
  return { pvH, pvVal };
};

const calcMilestonePV = (milestones, asOfDate) => {
  if (!milestones || milestones.length === 0) return 0;
  const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date));
  const now = new Date(asOfDate);

  if (now <= new Date(sorted[0].date)) return 0;
  if (now >= new Date(sorted[sorted.length - 1].date)) return sorted[sorted.length - 1].plannedCumulativePV;

  for (let i = 0; i < sorted.length - 1; i++) {
    const d1 = new Date(sorted[i].date);
    const d2 = new Date(sorted[i + 1].date);
    if (now >= d1 && now <= d2) {
      const frac = (now - d1) / (d2 - d1);
      return sorted[i].plannedCumulativePV + frac * (sorted[i + 1].plannedCumulativePV - sorted[i].plannedCumulativePV);
    }
  }
  return sorted[sorted.length - 1].plannedCumulativePV;
};

// ============================================
// PERT HELPER
// ============================================
const calcPERT = (o, m, p) => ({
  expected: (o + 4 * m + p) / 6,
  stdDev: (p - o) / 6,
});

// Effective estimate: Feature-Summe > PERT TE₉₅ > currentEstimate
// feats: optionales Array der geladenen Features (nur innerhalb der Komponente übergeben)
const getEffectiveEstimate = (epic, feats = []) => {
  if (feats.length > 0) {
    const epicFeatures = feats.filter(f => f.epicId === epic.id);
    if (epicFeatures.length > 0) {
      const total = epicFeatures.reduce((sum, f) => {
        const o = f.pertOptimistic, m = f.pertMostLikely, p = f.pertPessimistic;
        if (o != null && m != null && p != null && o > 0 && m > 0 && p > 0) {
          const te = (o + 4 * m + p) / 6;
          const sigma = (p - o) / 6;
          return sum + te + 2 * sigma;
        }
        return sum;
      }, 0);
      if (total > 0) return Math.round(total * 10) / 10;
    }
  }
  const o = epic.pertOptimistic;
  const m = epic.pertMostLikely;
  const p = epic.pertPessimistic;
  if (o != null && m != null && p != null && o > 0 && m > 0 && p > 0) {
    const te = (o + 4 * m + p) / 6;
    const sigma = (p - o) / 6;
    return Math.round((te + 2 * sigma) * 10) / 10; // TE₉₅, 1 Dezimalstelle
  }
  return epic.currentEstimate;
};

const getCompletionRate = (status) => {
  switch (status) {
    case 'Done': return 1;
    case 'In Progress': return 0.5;
    default: return 0;
  }
};

// ============================================
// SUPABASE DATA LAYER
// ============================================
const dbLoadProjects = async () => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('projects').select('*').order('created_at');
  if (error) throw error;
  return data;
};

const dbLoadEpics = async (projectId) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('epics').select('*').eq('project_id', projectId).order('start_date', { nullsFirst: false });
  if (error) throw error;
  return data;
};

const dbInsertProject = async (project) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('projects').insert(project).select().single();
  if (error) throw error;
  return data;
};

const dbUpdateProject = async (id, updates) => {
  if (!supabase) return;
  const { error } = await supabase.from('projects').update(updates).eq('id', id);
  if (error) console.error('Project update error:', error);
};

const dbDeleteProject = async (id) => {
  if (!supabase) return;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) console.error('Project delete error:', error);
};

const dbInsertEpic = async (epic) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('epics').insert(epic).select().single();
  if (error) throw error;
  return data;
};

const dbUpdateEpic = async (id, updates) => {
  if (!supabase) return;
  const { error } = await supabase.from('epics').update(updates).eq('id', id);
  if (error) console.error('Epic update error:', error);
};

const dbDeleteEpic = async (id) => {
  if (!supabase) return;
  const { error } = await supabase.from('epics').delete().eq('id', id);
  if (error) console.error('Epic delete error:', error);
};

const dbInsertEpics = async (epics) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('epics').insert(epics).select();
  if (error) throw error;
  return data;
};

const dbLoadFeatures = async (epicIds) => {
  if (!supabase || !epicIds || epicIds.length === 0) return [];
  const { data, error } = await supabase.from('features').select('*').in('epic_id', epicIds).order('sort_order');
  if (error) throw error;
  return data;
};

const dbInsertFeature = async (feature) => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('features').insert(feature).select().single();
  if (error) throw error;
  return data;
};

const dbUpdateFeature = async (id, updates) => {
  if (!supabase) return;
  const { error } = await supabase.from('features').update(updates).eq('id', id);
  if (error) console.error('Feature update error:', error);
};

const dbDeleteFeature = async (id) => {
  if (!supabase) return;
  const { error } = await supabase.from('features').delete().eq('id', id);
  if (error) console.error('Feature delete error:', error);
};

// ============================================
// SAMPLE DATA (date-based, no sprints)
// ============================================
const sampleProjectDefs = [
  {
    name: 'Web Portal Redesign',
    settings: { startDate: '2025-01-06', endDate: '2025-04-30', currency: 'CHF', defaultRateId: 'rate-1', pvMethod: 'time-based', reportingDate: new Date().toISOString().split('T')[0] },
    jira_config: { domain: '', email: '', apiToken: '', initiativeKey: '', linkTypeName: 'is part of', startDateField: 'customfield_10015', endDateField: 'duedate', statusMapping: {}, autoSync: false },
    rates: [
      { id: 'rate-1', name: 'Intern', rate: 150 },
      { id: 'rate-2', name: 'Extern (QA)', rate: 120 },
    ],
    milestones: [
      { id: 'ms-1', date: '2025-01-31', plannedCumulativePV: 56, notes: 'Core Features' },
      { id: 'ms-2', date: '2025-02-28', plannedCumulativePV: 96, notes: 'Integration & Testing' },
      { id: 'ms-3', date: '2025-03-31', plannedCumulativePV: 132, notes: 'Security & Performance' },
    ],
    epics: [
      { summary: 'User Authentication', startDate: '2025-01-06', endDate: '2025-01-31', status: 'Done', jiraStatus: 'Done', currentEstimate: 16, timeSpent: 14, baselineEstimate: 16, isBaselineLocked: true, pertOptimistic: 12, pertMostLikely: 16, pertPessimistic: 24, pertFte: 1, pertUplift: 10 },
      { summary: 'Dashboard Design', startDate: '2025-01-06', endDate: '2025-01-24', status: 'Done', jiraStatus: 'Done', currentEstimate: 8, timeSpent: 10, baselineEstimate: 8, isBaselineLocked: true, pertOptimistic: 6, pertMostLikely: 8, pertPessimistic: 16, pertFte: 1, pertUplift: 10 },
      { summary: 'API Integration', startDate: '2025-01-13', endDate: '2025-02-28', status: 'In Progress', jiraStatus: 'In Progress', currentEstimate: 24, timeSpent: 8, baselineEstimate: 20, isBaselineLocked: true, rateId: 'rate-2', pertOptimistic: 16, pertMostLikely: 24, pertPessimistic: 40, pertFte: 1, pertUplift: 15 },
      { summary: 'Unit Tests', startDate: '2025-01-20', endDate: '2025-02-14', status: 'Done', jiraStatus: 'Done', currentEstimate: 12, timeSpent: 11, baselineEstimate: 12, isBaselineLocked: true, pertOptimistic: 8, pertMostLikely: 12, pertPessimistic: 20, pertFte: 1, pertUplift: 10 },
      { summary: 'Dokumentation', startDate: '2025-02-01', endDate: '2025-02-21', status: 'Done', jiraStatus: 'Done', currentEstimate: 8, timeSpent: 7, baselineEstimate: 8, isBaselineLocked: true, pertOptimistic: 6, pertMostLikely: 8, pertPessimistic: 12, pertFte: 0.5, pertUplift: 5 },
      { summary: 'Code Review Setup', startDate: '2025-02-10', endDate: '2025-03-07', status: 'In Progress', jiraStatus: 'In Review', currentEstimate: 4, timeSpent: 1, baselineEstimate: 4, isBaselineLocked: true },
      { summary: 'CI/CD Pipeline', startDate: '2025-02-15', endDate: '2025-03-14', status: 'In Progress', jiraStatus: 'In Progress', currentEstimate: 16, timeSpent: 6, baselineEstimate: 16, isBaselineLocked: true },
      { summary: 'Performance Testing', startDate: '2025-03-01', endDate: '2025-03-28', status: 'To Do', jiraStatus: 'To Do', currentEstimate: 12, timeSpent: 0, baselineEstimate: 12, isBaselineLocked: true, rateId: 'rate-2' },
      { summary: 'Security Audit', startDate: '2025-03-15', endDate: '2025-04-11', status: 'To Do', jiraStatus: 'To Do', currentEstimate: 20, timeSpent: 0, baselineEstimate: 20, isBaselineLocked: false, rateId: 'rate-2' },
      { summary: 'Load Testing', startDate: '2025-04-01', endDate: '2025-04-30', status: 'To Do', jiraStatus: 'To Do', currentEstimate: 16, timeSpent: 0, baselineEstimate: 16, isBaselineLocked: false },
    ],
  },
  {
    name: 'Mobile App v2',
    settings: { startDate: '2025-02-01', endDate: '2025-06-30', currency: 'CHF', defaultRateId: 'rate-1', pvMethod: 'time-based', reportingDate: new Date().toISOString().split('T')[0] },
    jira_config: { domain: '', email: '', apiToken: '', initiativeKey: '', linkTypeName: 'is part of', startDateField: 'customfield_10015', endDateField: 'duedate', statusMapping: {}, autoSync: false },
    rates: [
      { id: 'rate-1', name: 'Intern', rate: 140 },
    ],
    milestones: [
      { id: 'ms-1', date: '2025-03-15', plannedCumulativePV: 60, notes: 'Core Features' },
      { id: 'ms-2', date: '2025-05-15', plannedCumulativePV: 100, notes: 'Security & Polish' },
    ],
    epics: [
      { summary: 'Push Notifications', startDate: '2025-02-01', endDate: '2025-03-15', status: 'In Progress', jiraStatus: 'In Progress', currentEstimate: 20, timeSpent: 8, baselineEstimate: 20, isBaselineLocked: true },
      { summary: 'Offline Mode', startDate: '2025-02-15', endDate: '2025-04-15', status: 'To Do', jiraStatus: 'To Do', currentEstimate: 32, timeSpent: 0, baselineEstimate: 32, isBaselineLocked: true },
      { summary: 'Dark Mode', startDate: '2025-02-01', endDate: '2025-02-28', status: 'Done', jiraStatus: 'Done', currentEstimate: 8, timeSpent: 6, baselineEstimate: 8, isBaselineLocked: true },
      { summary: 'Biometric Login', startDate: '2025-04-01', endDate: '2025-05-15', status: 'To Do', jiraStatus: 'To Do', currentEstimate: 16, timeSpent: 0, baselineEstimate: 16, isBaselineLocked: false },
      { summary: 'Performance Optimization', startDate: '2025-05-01', endDate: '2025-06-30', status: 'To Do', jiraStatus: 'To Do', currentEstimate: 24, timeSpent: 0, baselineEstimate: 24, isBaselineLocked: false },
    ],
  },
  {
    name: 'API Gateway Migration',
    settings: { startDate: '2025-01-15', endDate: '2025-05-15', currency: 'CHF', defaultRateId: 'rate-1', pvMethod: 'time-based', reportingDate: new Date().toISOString().split('T')[0] },
    jira_config: { domain: '', email: '', apiToken: '', initiativeKey: '', linkTypeName: 'is part of', startDateField: 'customfield_10015', endDateField: 'duedate', statusMapping: {}, autoSync: false },
    rates: [
      { id: 'rate-1', name: 'Intern', rate: 160 },
      { id: 'rate-2', name: 'Cloud Ops', rate: 180 },
    ],
    milestones: [
      { id: 'ms-1', date: '2025-02-15', plannedCumulativePV: 40, notes: 'Security Layer' },
      { id: 'ms-2', date: '2025-03-15', plannedCumulativePV: 72, notes: 'Observability' },
      { id: 'ms-3', date: '2025-04-30', plannedCumulativePV: 116, notes: 'Infrastructure' },
    ],
    epics: [
      { summary: 'Rate Limiting', startDate: '2025-01-15', endDate: '2025-02-15', status: 'Done', jiraStatus: 'Done', currentEstimate: 16, timeSpent: 18, baselineEstimate: 16, isBaselineLocked: true },
      { summary: 'OAuth 2.0 Integration', startDate: '2025-01-20', endDate: '2025-02-28', status: 'Done', jiraStatus: 'Done', currentEstimate: 24, timeSpent: 22, baselineEstimate: 24, isBaselineLocked: true },
      { summary: 'Request Logging', startDate: '2025-02-15', endDate: '2025-03-15', status: 'Done', jiraStatus: 'Done', currentEstimate: 12, timeSpent: 10, baselineEstimate: 12, isBaselineLocked: true },
      { summary: 'Circuit Breaker', startDate: '2025-02-20', endDate: '2025-03-20', status: 'Done', jiraStatus: 'Done', currentEstimate: 20, timeSpent: 24, baselineEstimate: 20, isBaselineLocked: true },
      { summary: 'Load Balancing', startDate: '2025-03-15', endDate: '2025-04-30', status: 'In Progress', jiraStatus: 'In Progress', currentEstimate: 28, timeSpent: 12, baselineEstimate: 28, isBaselineLocked: true },
      { summary: 'Monitoring Dashboard', startDate: '2025-04-01', endDate: '2025-05-15', status: 'In Progress', jiraStatus: 'In Progress', currentEstimate: 16, timeSpent: 4, baselineEstimate: 16, isBaselineLocked: true },
    ],
  },
];

const seedSampleData = async () => {
  const insertedProjects = [];
  for (const def of sampleProjectDefs) {
    const { epics, ...projData } = def;
    const proj = await dbInsertProject(projData);
    if (proj) {
      const epicsWithProjectId = epics.map(e => ({
        ...e,
        project_id: proj.id,
        jira_key: null,
        is_baseline_locked: e.isBaselineLocked,
        baseline_estimate: e.baselineEstimate,
        current_estimate: e.currentEstimate,
        time_spent: e.timeSpent,
        jira_status: e.jiraStatus,
        start_date: e.startDate,
        end_date: e.endDate,
        rate_id: e.rateId || null,
        pert_optimistic: e.pertOptimistic || null,
        pert_most_likely: e.pertMostLikely || null,
        pert_pessimistic: e.pertPessimistic || null,
        pert_fte: e.pertFte || 1,
        pert_uplift: e.pertUplift || 0,
        removed_from_jira: false,
      }));
      // Remove camelCase keys
      const dbEpics = epicsWithProjectId.map(e => {
        const { isBaselineLocked, baselineEstimate, currentEstimate, timeSpent, jiraStatus, startDate, endDate, rateId, pertOptimistic, pertMostLikely, pertPessimistic, pertFte, pertUplift, ...rest } = e;
        return rest;
      });
      await dbInsertEpics(dbEpics);
      insertedProjects.push(proj);
    }
  }
  return insertedProjects;
};

// Map DB row (snake_case) to app format (camelCase) for epics
const mapEpicFromDb = (row) => ({
  id: row.id,
  projectId: row.project_id,
  jiraKey: row.jira_key,
  summary: row.summary,
  status: row.status,
  jiraStatus: row.jira_status,
  startDate: row.start_date,
  endDate: row.end_date,
  currentEstimate: Number(row.current_estimate),
  timeSpent: Number(row.time_spent),
  baselineEstimate: Number(row.baseline_estimate),
  isBaselineLocked: row.is_baseline_locked,
  rateId: row.rate_id,
  pertOptimistic: row.pert_optimistic ? Number(row.pert_optimistic) : null,
  pertMostLikely: row.pert_most_likely ? Number(row.pert_most_likely) : null,
  pertPessimistic: row.pert_pessimistic ? Number(row.pert_pessimistic) : null,
  pertFte: row.pert_fte != null ? Number(row.pert_fte) : 1,
  pertUplift: row.pert_uplift != null ? Number(row.pert_uplift) : 0,
  baselineId: row.baseline_id || null,
  removedFromJira: row.removed_from_jira,
  moscow: row.moscow || null,
  phase: row.phase || null,
  priority: row.priority != null ? Number(row.priority) : null,
  remarks: row.remarks || '',
});

// Map app format back to DB format for updates
const mapEpicToDb = (updates) => {
  const map = {
    jiraKey: 'jira_key', summary: 'summary', status: 'status', jiraStatus: 'jira_status',
    startDate: 'start_date', endDate: 'end_date', currentEstimate: 'current_estimate',
    timeSpent: 'time_spent', baselineEstimate: 'baseline_estimate', isBaselineLocked: 'is_baseline_locked',
    rateId: 'rate_id', pertOptimistic: 'pert_optimistic', pertMostLikely: 'pert_most_likely',
    pertPessimistic: 'pert_pessimistic', pertFte: 'pert_fte', pertUplift: 'pert_uplift',
    baselineId: 'baseline_id', removedFromJira: 'removed_from_jira',
    moscow: 'moscow', phase: 'phase', priority: 'priority', remarks: 'remarks',
  };
  const result = {};
  for (const [key, val] of Object.entries(updates)) {
    result[map[key] || key] = val;
  }
  return result;
};

const mapFeatureFromDb = (row) => ({
  id: row.id,
  epicId: row.epic_id,
  name: row.name,
  roleId: row.role_id || null,
  pertOptimistic: row.pert_optimistic != null ? Number(row.pert_optimistic) : null,
  pertMostLikely: row.pert_most_likely != null ? Number(row.pert_most_likely) : null,
  pertPessimistic: row.pert_pessimistic != null ? Number(row.pert_pessimistic) : null,
  fte: row.fte != null ? Number(row.fte) : 1,
  sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
});

const mapFeatureToDb = (updates) => {
  const map = {
    epicId: 'epic_id', name: 'name', roleId: 'role_id',
    pertOptimistic: 'pert_optimistic', pertMostLikely: 'pert_most_likely', pertPessimistic: 'pert_pessimistic',
    fte: 'fte', sortOrder: 'sort_order',
  };
  const result = {};
  for (const [key, val] of Object.entries(updates)) {
    result[map[key] || key] = val;
  }
  return result;
};

// Map DB project row to app format
const mapProjectFromDb = (row) => ({
  id: row.id,
  name: row.name,
  settings: row.settings || {},
  jiraConfig: row.jira_config || {},
  rates: row.rates || [],
  milestones: row.milestones || [],
  baselines: row.baselines || [],
  lastJiraSync: row.last_jira_sync,
  createdAt: row.created_at,
});

// ============================================
// DATE HELPERS
// ============================================
const formatDate = (d) => d ? new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const generateTimelinePoints = (issues, milestones, settings) => {
  const dates = [];
  issues.forEach(i => {
    if (i.startDate) dates.push(new Date(i.startDate));
    if (i.endDate) dates.push(new Date(i.endDate));
  });
  if (milestones) milestones.forEach(m => { if (m.date) dates.push(new Date(m.date)); });
  if (settings.startDate) dates.push(new Date(settings.startDate));
  if (settings.endDate) dates.push(new Date(settings.endDate));

  if (dates.length === 0) return [];

  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);

  const interval = totalDays > 365 ? 30 : totalDays > 180 ? 14 : 7;
  const points = [];
  const current = new Date(minDate);
  while (current <= maxDate) {
    points.push(new Date(current));
    current.setDate(current.getDate() + interval);
  }
  if (points[points.length - 1] < maxDate) points.push(new Date(maxDate));
  return points;
};

// ============================================
// UI COMPONENTS
// ============================================
const StatusBadge = ({ status }) => {
  const styles = {
    'Done': 'bg-emerald-50 text-emerald-700 border-emerald-300',
    'In Progress': 'bg-amber-50 text-amber-700 border-amber-300',
    'To Do': 'bg-slate-100 text-slate-500 border-slate-300',
  };
  return <span className={`px-2 py-1 text-xs font-medium rounded border ${styles[status]}`}>{status}</span>;
};

const SourceBadge = ({ source }) => {
  const configs = {
    jira: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Jira', Icon: Zap },
    sheets: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Sheets', Icon: Cloud },
    hybrid: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Hybrid', Icon: GitMerge },
  };
  const { bg, text, label, Icon } = configs[source] || configs.hybrid;
  return <span className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${bg} ${text}`}><Icon className="w-3 h-3" />{label}</span>;
};

const metricTooltips = {
  'BAC (Baseline)': 'Budget at Completion: Gesamtbudget basierend auf ursprünglichen Schätzungen',
  'PV (Planned)': 'Planned Value: Geplanter Wert der Arbeit bis heute',
  'EV (Earned)': 'Earned Value: Wert der abgeschlossenen Arbeit (50/50)',
  'AC (Actual)': 'Actual Cost: Tatsächlich aufgewendete Zeit',
  'SPI': 'Schedule Performance Index: EV÷PV. ≥1 = im Plan, <1 = Verzug',
  'CPI': 'Cost Performance Index: EV÷AC. ≥1 = unter Budget, <1 = drüber',
  'EAC': 'Estimate at Completion: Prognostizierte Endkosten (BAC÷CPI)',
  'Fortschritt': 'Projektfortschritt: EV÷BAC in Prozent',
};

const MetricCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, source }) => {
  const isPositive = trend === 'up';
  const isNeutral = trend === 'neutral';
  const tooltipText = metricTooltips[title];

  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-600 text-sm font-medium cursor-help underline decoration-dashed decoration-slate-400 underline-offset-2" title={tooltipText}>{title}</span>
            {source === 'jira' && <SourceBadge source={source} />}
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && <p className="text-slate-400 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg flex-shrink-0 ${isPositive ? 'bg-emerald-50' : isNeutral ? 'bg-slate-100' : 'bg-rose-50'}`}>
          <Icon className={`w-5 h-5 ${isPositive ? 'text-emerald-600' : isNeutral ? 'text-slate-500' : 'text-rose-600'}`} />
        </div>
      </div>
      {trendValue && (
        <div className={`flex items-center mt-3 text-sm ${isPositive ? 'text-emerald-600' : isNeutral ? 'text-slate-500' : 'text-rose-600'}`}>
          {isPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
};

const gaugeTooltips = {
  'SPI': 'Schedule Performance Index: EV÷PV. ≥1 = im Plan, <1 = Verzug',
  'CPI': 'Cost Performance Index: EV÷AC. ≥1 = unter Budget, <1 = drüber',
  'TCPI': 'To Complete Performance Index: Benötigte Effizienz um Budget einzuhalten. >1 = schwierig',
};

const gaugeDescriptions = { SPI: 'Schedule Performance Index', CPI: 'Cost Performance Index', TCPI: 'To Complete Performance Index' };

const PerformanceGauge = ({ value, label }) => {
  const percentage = Math.min(Math.max((value / 1) * 100, 0), 150);
  const isGood = value >= 1;
  const isWarning = value >= 0.9 && value < 1;
  const color = isGood ? '#10b981' : isWarning ? '#f59e0b' : '#ef4444';
  const tooltipText = gaugeTooltips[label];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90">
          <circle cx="48" cy="48" r="40" stroke="#e2e8f0" strokeWidth="8" fill="none" />
          <circle cx="48" cy="48" r="40" stroke={color} strokeWidth="8" fill="none"
            strokeDasharray={`${(percentage / 150) * 251.2} 251.2`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-slate-900">{value.toFixed(2)}</span>
        </div>
      </div>
      <span className="text-slate-600 text-sm mt-2 cursor-help underline decoration-dashed decoration-slate-400 underline-offset-2" title={tooltipText}>{label}</span>
      <span className="text-xs text-slate-400 mt-0.5">{gaugeDescriptions[label]}</span>
    </div>
  );
};

// ============================================
// PROJECT SELECTOR COMPONENT
// ============================================
const ProjectSelector = ({ projects, currentProjectId, onSelectProject, onCreateProject, onDeleteProject, onDuplicateProject }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const currentProject = projects.find(p => p.id === currentProjectId);

  const handleCreate = () => {
    if (newProjectName.trim()) {
      onCreateProject(newProjectName.trim());
      setNewProjectName('');
      setShowNewProjectInput(false);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-3 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:border-slate-400 transition-all">
        <FolderOpen className="w-5 h-5 text-purple-600" />
        <div className="text-left">
          <p className="text-sm font-medium text-slate-900">{currentProject?.name || 'Projekt wählen'}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-slate-200"><p className="text-xs text-slate-500 px-2 py-1">Projekte</p></div>
          <div className="max-h-64 overflow-y-auto">
            {projects.map(project => (
              <div key={project.id} className={`flex items-center justify-between p-3 hover:bg-slate-100 cursor-pointer group ${project.id === currentProjectId ? 'bg-purple-50 border-l-2 border-purple-500' : ''}`}>
                <div className="flex-1" onClick={() => { onSelectProject(project.id); setIsOpen(false); }}>
                  <p className="text-sm font-medium text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-400">{project.settings?.startDate ? formatDate(project.settings.startDate) : ''} – {project.settings?.endDate ? formatDate(project.settings.endDate) : ''}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); onDuplicateProject(project.id); }} className="p-1 text-slate-500 hover:text-slate-700" title="Duplizieren"><Copy className="w-4 h-4" /></button>
                  {projects.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }} className="p-1 text-slate-500 hover:text-rose-600" title="Löschen"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-slate-200">
            {showNewProjectInput ? (
              <div className="flex items-center gap-2">
                <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder="Projektname..." className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 text-sm" autoFocus />
                <button onClick={handleCreate} className="p-2 bg-purple-600 hover:bg-purple-500 rounded"><Plus className="w-4 h-4" /></button>
                <button onClick={() => setShowNewProjectInput(false)} className="p-2 bg-slate-200 hover:bg-slate-200 rounded"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => setShowNewProjectInput(true)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"><Plus className="w-4 h-4" />Neues Projekt</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// PORTFOLIO OVERVIEW
// ============================================
const PortfolioOverview = ({ projects, projectEpicsMap, onSelectProject }) => {
  const portfolioMetrics = useMemo(() => {
    let totalBAC = 0, totalEV = 0, totalAC = 0;
    projects.forEach(project => {
      const epics = projectEpicsMap[project.id] || [];
      epics.forEach(epic => {
        const estimate = epic.baselineEstimate || getEffectiveEstimate(epic);
        totalBAC += estimate;
        totalEV += estimate * getCompletionRate(epic.status);
        totalAC += epic.timeSpent;
      });
    });
    return { totalBAC, totalEV, totalAC, overallCPI: totalAC > 0 ? totalEV / totalAC : 0, overallProgress: totalBAC > 0 ? totalEV / totalBAC : 0 };
  }, [projects, projectEpicsMap]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><FolderOpen className="w-5 h-5 text-purple-600" />Portfolio Übersicht</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 rounded-lg p-4"><p className="text-slate-500 text-sm">Projekte</p><p className="text-2xl font-bold text-slate-900">{projects.length}</p></div>
          <div className="bg-slate-50 rounded-lg p-4"><p className="text-slate-500 text-sm">Gesamt BAC</p><p className="text-2xl font-bold text-slate-900">{portfolioMetrics.totalBAC}h</p></div>
          <div className="bg-slate-50 rounded-lg p-4"><p className="text-slate-500 text-sm">Gesamt Fortschritt</p><p className="text-2xl font-bold text-emerald-600">{(portfolioMetrics.overallProgress * 100).toFixed(1)}%</p></div>
          <div className="bg-slate-50 rounded-lg p-4"><p className="text-slate-500 text-sm">Portfolio CPI</p><p className={`text-2xl font-bold ${portfolioMetrics.overallCPI >= 1 ? 'text-emerald-600' : 'text-rose-600'}`}>{portfolioMetrics.overallCPI.toFixed(2)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => {
          const epics = projectEpicsMap[project.id] || [];
          const rates = project.rates || [];
          const projCurrency = project.settings?.currency || 'CHF';
          const projDefaultRateId = project.settings?.defaultRateId || '';
          const projHasRates = rates.some(r => r.rate > 0);
          const bacH = epics.reduce((sum, i) => sum + (i.baselineEstimate || getEffectiveEstimate(i)), 0);
          const evH = epics.reduce((sum, i) => sum + (i.baselineEstimate || getEffectiveEstimate(i)) * getCompletionRate(i.status), 0);
          let bac = bacH, ev = evH, ac = epics.reduce((sum, i) => sum + i.timeSpent, 0);
          if (projHasRates) {
            bac = 0; ev = 0; ac = 0;
            epics.forEach(i => {
              const r = getIssueRate(i, rates, projDefaultRateId);
              bac += (i.baselineEstimate || getEffectiveEstimate(i)) * r;
              ev += (i.baselineEstimate || getEffectiveEstimate(i)) * getCompletionRate(i.status) * r;
              ac += i.timeSpent * r;
            });
          }
          const cpi = ac > 0 ? ev / ac : 0;
          const progress = bac > 0 ? ev / bac : 0;
          const statusColor = cpi >= 1 ? 'emerald' : cpi >= 0.9 ? 'amber' : 'rose';

          return (
            <div key={project.id} onClick={() => onSelectProject(project.id)} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-purple-400 cursor-pointer transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900 group-hover:text-purple-700 transition-colors">{project.name}</h4>
                  <p className="text-xs text-slate-500">{formatDate(project.settings?.startDate)} – {formatDate(project.settings?.endDate)} • {epics.length} Epics</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${statusColor === 'emerald' ? 'bg-emerald-50 text-emerald-700' : statusColor === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                  {cpi >= 1 ? '✓' : cpi >= 0.9 ? '⚠' : '✗'}
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Fortschritt</span><span>{(progress * 100).toFixed(0)}%</span></div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress * 100}%` }} /></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-lg font-bold text-slate-900">{projHasRates ? formatCurrency(bac, projCurrency) : `${bac}h`}</p><p className="text-xs text-slate-400">BAC</p></div>
                  <div><p className="text-lg font-bold text-emerald-600">{projHasRates ? formatCurrency(ev, projCurrency) : `${ev.toFixed(0)}h`}</p><p className="text-xs text-slate-400">EV</p></div>
                  <div><p className={`text-lg font-bold ${cpi >= 1 ? 'text-emerald-600' : 'text-rose-600'}`}>{cpi.toFixed(2)}</p><p className="text-xs text-slate-400">CPI</p></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// MAIN APP
// ============================================
export default function EVMDashboardMultiProject() {
  const [projects, setProjects] = useState([]);
  const [epics, setEpics] = useState([]);
  const [projectEpicsMap, setProjectEpicsMap] = useState({});
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!supabase);
  const [showRoles, setShowRoles] = useState(false);
  const [showBaselineDialog, setShowBaselineDialog] = useState(false);
  const [baselineNotes, setBaselineNotes] = useState('');
  const [editingEpicId, setEditingEpicId] = useState(null);
  const [jiraSyncing, setJiraSyncing] = useState(false);
  const [features, setFeatures] = useState([]);
  const [expandedEpicIds, setExpandedEpicIds] = useState(new Set());

  // Load projects
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const data = await dbLoadProjects();
        if (cancelled) return;
        if (data === null) {
          const cached = localStorage.getItem('evm_projects_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            setProjects(parsed.projects || []);
            setProjectEpicsMap(parsed.epicsMap || {});
            if (parsed.projects?.length > 0) setCurrentProjectId(parsed.currentId || parsed.projects[0].id);
          }
          setIsOffline(true);
          setLoading(false);
          return;
        }

        if (data.length === 0) {
          const seeded = await seedSampleData();
          if (cancelled) return;
          const mapped = seeded.map(mapProjectFromDb);
          setProjects(mapped);
          if (mapped.length > 0) setCurrentProjectId(mapped[0].id);
        } else {
          const mapped = data.map(mapProjectFromDb);
          setProjects(mapped);
          const savedId = localStorage.getItem('evm_current_project');
          setCurrentProjectId(savedId && mapped.find(p => p.id === savedId) ? savedId : mapped[0]?.id);
        }
        setIsOffline(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load from Supabase:', err?.message || err?.code || JSON.stringify(err));
        const cached = localStorage.getItem('evm_projects_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          setProjects(parsed.projects || []);
          setProjectEpicsMap(parsed.epicsMap || {});
          if (parsed.projects?.length > 0) setCurrentProjectId(parsed.currentId || parsed.projects[0].id);
        }
        setIsOffline(true);
      }
      setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Load epics + features when project changes
  useEffect(() => {
    if (!currentProjectId) return;
    localStorage.setItem('evm_current_project', currentProjectId);
    setFeatures([]);
    setExpandedEpicIds(new Set());

    const loadEpicsAndFeatures = async () => {
      try {
        const data = await dbLoadEpics(currentProjectId);
        if (data) {
          const mapped = data.map(mapEpicFromDb);
          setEpics(mapped);
          setProjectEpicsMap(prev => ({ ...prev, [currentProjectId]: mapped }));
          // Load features for all epics (graceful: table may not exist yet)
          try {
            const epicIds = mapped.map(e => e.id);
            const featData = await dbLoadFeatures(epicIds);
            if (featData) setFeatures(featData.map(mapFeatureFromDb));
          } catch { /* features table not yet created */ }
        }
      } catch (err) {
        console.error('Failed to load epics/features:', err);
      }
    };
    loadEpicsAndFeatures();
  }, [currentProjectId]);

  // Cache to localStorage
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('evm_projects_cache', JSON.stringify({ projects, epicsMap: projectEpicsMap, currentId: currentProjectId }));
    }
  }, [projects, projectEpicsMap, currentProjectId]);

  // Load all project epics for portfolio
  useEffect(() => {
    if (!showPortfolio) return;
    projects.forEach(async (p) => {
      if (projectEpicsMap[p.id]) return;
      try {
        const data = await dbLoadEpics(p.id);
        if (data) {
          const mapped = data.map(mapEpicFromDb);
          setProjectEpicsMap(prev => ({ ...prev, [p.id]: mapped }));
        }
      } catch {}
    });
  }, [showPortfolio, projects]);

  const currentProject = useMemo(() => projects.find(p => p.id === currentProjectId) || projects[0], [projects, currentProjectId]);
  const projectSettings = currentProject?.settings || { currency: 'CHF', defaultRateId: '', pvMethod: 'time-based', reportingDate: new Date().toISOString().split('T')[0] };
  const projectRates = currentProject?.rates || [];
  const milestones = currentProject?.milestones || [];
  const currency = projectSettings.currency || 'CHF';
  const defaultRateId = projectSettings.defaultRateId || '';
  const hasRates = projectRates.some(r => r.rate > 0);
  const reportingDate = projectSettings.reportingDate || new Date().toISOString().split('T')[0];
  const pvMethod = projectSettings.pvMethod || 'time-based';

  // ---- Project CRUD ----
  const createProject = useCallback(async (name) => {
    const projData = {
      name,
      settings: { startDate: new Date().toISOString().split('T')[0], endDate: '', currency: 'CHF', defaultRateId: 'rate-1', pvMethod: 'time-based', reportingDate: new Date().toISOString().split('T')[0] },
      jira_config: { domain: '', email: '', apiToken: '', initiativeKey: '', linkTypeName: 'is part of', statusMapping: {}, autoSync: false },
      rates: [{ id: 'rate-1', name: 'Standard', rate: 0 }],
      baselines: [],
      milestones: [],
    };
    try {
      const inserted = await dbInsertProject(projData);
      if (inserted) {
        const mapped = mapProjectFromDb(inserted);
        setProjects(prev => [...prev, mapped]);
        setCurrentProjectId(mapped.id);
        setEpics([]);
      }
    } catch (err) { console.error('Create project error:', err); }
  }, []);

  const deleteProject = useCallback(async (projectId) => {
    if (projects.length <= 1) return;
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (currentProjectId === projectId) {
      const next = projects.find(p => p.id !== projectId);
      setCurrentProjectId(next?.id);
    }
    await dbDeleteProject(projectId);
  }, [projects, currentProjectId]);

  const duplicateProject = useCallback(async (projectId) => {
    const source = projects.find(p => p.id === projectId);
    if (!source) return;
    try {
      const projData = {
        name: `${source.name} (Kopie)`,
        settings: { ...source.settings },
        jira_config: { ...source.jiraConfig },
        rates: [...source.rates],
        milestones: [...source.milestones],
      };
      const inserted = await dbInsertProject(projData);
      if (inserted) {
        const sourceEpics = projectEpicsMap[projectId] || epics;
        if (sourceEpics.length > 0) {
          const newEpics = sourceEpics.map(e => ({
            project_id: inserted.id,
            summary: e.summary, status: e.status, jira_status: e.jiraStatus,
            start_date: e.startDate, end_date: e.endDate,
            current_estimate: e.currentEstimate, time_spent: e.timeSpent,
            baseline_estimate: e.baselineEstimate, is_baseline_locked: e.isBaselineLocked,
            rate_id: e.rateId || null,
          }));
          await dbInsertEpics(newEpics);
        }
        const mapped = mapProjectFromDb(inserted);
        setProjects(prev => [...prev, mapped]);
        setCurrentProjectId(mapped.id);
      }
    } catch (err) { console.error('Duplicate project error:', err); }
  }, [projects, projectEpicsMap, epics]);

  const updateCurrentProject = useCallback(async (updates) => {
    setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, ...updates } : p));
    // Build DB update
    const dbUpdates = {};
    if (updates.settings) dbUpdates.settings = updates.settings;
    if (updates.rates) dbUpdates.rates = updates.rates;
    if (updates.milestones) dbUpdates.milestones = updates.milestones;
    if (updates.baselines) dbUpdates.baselines = updates.baselines;
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.jiraConfig) dbUpdates.jira_config = updates.jiraConfig;
    if (updates.lastJiraSync) dbUpdates.last_jira_sync = updates.lastJiraSync;
    if (Object.keys(dbUpdates).length > 0) await dbUpdateProject(currentProjectId, dbUpdates);
  }, [currentProjectId]);

  const updateProjectSettings = useCallback((settingsUpdates) => {
    const newSettings = { ...projectSettings, ...settingsUpdates };
    updateCurrentProject({ settings: newSettings });
  }, [projectSettings, updateCurrentProject]);

  // ---- Epic CRUD ----
  const updateEpic = useCallback(async (epicId, updates) => {
    setEpics(prev => prev.map(e => e.id === epicId ? { ...e, ...updates } : e));
    setProjectEpicsMap(prev => ({
      ...prev,
      [currentProjectId]: (prev[currentProjectId] || []).map(e => e.id === epicId ? { ...e, ...updates } : e),
    }));
    await dbUpdateEpic(epicId, mapEpicToDb(updates));
  }, [currentProjectId]);

  const addEpic = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const tempId = `temp-${Date.now()}`;
    const newEpic = {
      id: tempId, projectId: currentProjectId, summary: '', startDate: today, endDate: today,
      status: 'To Do', currentEstimate: 0, timeSpent: 0, baselineEstimate: 0, isBaselineLocked: false,
      rateId: null, jiraKey: null, jiraStatus: null, removedFromJira: false,
      pertOptimistic: null, pertMostLikely: null, pertPessimistic: null, pertFte: 1, pertUplift: 0, baselineId: null,
      moscow: null, phase: null, priority: null, remarks: '',
    };
    setEpics(prev => [...prev, newEpic]);
    setProjectEpicsMap(prev => ({ ...prev, [currentProjectId]: [...(prev[currentProjectId] || []), newEpic] }));
    setEditingEpicId(tempId);
    try {
      const dbRow = await dbInsertEpic({
        project_id: currentProjectId, summary: '', start_date: today, end_date: today,
        status: 'To Do', current_estimate: 0, time_spent: 0, baseline_estimate: 0, is_baseline_locked: false,
      });
      const mapped = mapEpicFromDb(dbRow);
      setEpics(prev => prev.map(e => e.id === tempId ? mapped : e));
      setProjectEpicsMap(prev => ({ ...prev, [currentProjectId]: (prev[currentProjectId] || []).map(e => e.id === tempId ? mapped : e) }));
      setEditingEpicId(prev => prev === tempId ? mapped.id : prev);
    } catch (err) {
      setEpics(prev => prev.filter(e => e.id !== tempId));
      setProjectEpicsMap(prev => ({ ...prev, [currentProjectId]: (prev[currentProjectId] || []).filter(e => e.id !== tempId) }));
      setEditingEpicId(null);
      console.error('Add epic error:', err);
    }
  }, [currentProjectId]);

  const deleteEpic = useCallback(async (epicId) => {
    const epic = epics.find(e => e.id === epicId);
    if (!epic || epic.isBaselineLocked) return;
    setEpics(prev => prev.filter(e => e.id !== epicId));
    setProjectEpicsMap(prev => ({ ...prev, [currentProjectId]: (prev[currentProjectId] || []).filter(e => e.id !== epicId) }));
    setFeatures(prev => prev.filter(f => f.epicId !== epicId));
    await dbDeleteEpic(epicId);
  }, [epics, currentProjectId]);

  const jiraSync = useCallback(async () => {
    const config = currentProject?.jiraConfig;
    if (!config?.domain || !config?.email || !config?.apiToken || !config?.initiativeKey) return;
    setJiraSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('jira-proxy', {
        body: {
          domain: config.domain, email: config.email, apiToken: config.apiToken,
          jql: `issue in linkedIssues("${config.initiativeKey}", "${config.linkTypeName || 'is part of'}")`,
          fields: `summary,status,${config.startDateField || 'customfield_10015'},${config.endDateField || 'duedate'},timeoriginalestimate,timespent${config.moscowField ? ',' + config.moscowField : ''}`,
        },
      });
      if (error) throw error;
      const jiraIssues = data?.issues || [];
      const jiraKeys = new Set(jiraIssues.map(i => i.key));
      const statusMap = config.statusMapping || {};

      for (const issue of jiraIssues) {
        const existing = epics.find(e => e.jiraKey === issue.key);
        const fields = issue.fields;
        const mappedStatus = statusMap[fields.status?.name] || 'To Do';
        const updates = {
          summary: fields.summary, jiraStatus: fields.status?.name, status: mappedStatus,
          startDate: fields[config.startDateField || 'customfield_10015'] || null,
          endDate: fields[config.endDateField || 'duedate'] || null,
          currentEstimate: Math.round(((fields.timeoriginalestimate || 0) / 3600) * 10) / 10,
          timeSpent: Math.round(((fields.timespent || 0) / 3600) * 10) / 10,
          removedFromJira: false,
        };
        // MoSCoW aus Jira-Feld übernehmen (falls konfiguriert)
        if (config.moscowField) {
          const raw = fields[config.moscowField];
          const val = (typeof raw === 'object' ? raw?.name || raw?.value : raw) || '';
          const normalized = val.toString().toUpperCase().replace(/[^A-Z]/g, '');
          const moscowMap = { MUST: 'MUST', MUSTHAVE: 'MUST', SHOULD: 'SHOULD', SHOULDHAVE: 'SHOULD', COULD: 'COULD', COULDHAVE: 'COULD', WONT: 'WONT', WONTHAVE: 'WONT' };
          if (moscowMap[normalized]) updates.moscow = moscowMap[normalized];
        }
        if (existing) {
          await updateEpic(existing.id, updates);
        } else {
          const dbRow = await dbInsertEpic({
            project_id: currentProjectId, jira_key: issue.key, ...mapEpicToDb(updates),
            baseline_estimate: 0, is_baseline_locked: false,
          });
          const mapped = mapEpicFromDb(dbRow);
          setEpics(prev => [...prev, mapped]);
          setProjectEpicsMap(prev => ({ ...prev, [currentProjectId]: [...(prev[currentProjectId] || []), mapped] }));
        }
      }

      for (const epic of epics) {
        if (epic.jiraKey && !jiraKeys.has(epic.jiraKey) && !epic.removedFromJira) {
          await updateEpic(epic.id, { removedFromJira: true });
        }
      }
      await updateCurrentProject({ lastJiraSync: new Date().toISOString() });
    } catch (err) {
      console.error('Jira sync error:', err);
    } finally {
      setJiraSyncing(false);
    }
  }, [currentProject, epics, currentProjectId, updateEpic, updateCurrentProject]);

  const toggleBaselineLock = (epicId) => {
    const epic = epics.find(e => e.id === epicId);
    if (!epic) return;
    updateEpic(epicId, { isBaselineLocked: !epic.isBaselineLocked, baselineEstimate: epic.baselineEstimate || getEffectiveEstimate(epic, features) });
  };

  const lockAllBaselines = () => {
    epics.forEach(e => {
      if (!e.isBaselineLocked) {
        updateEpic(e.id, { isBaselineLocked: true, baselineEstimate: e.baselineEstimate || getEffectiveEstimate(e, features) });
      }
    });
  };

  // ---- Baseline Management ----
  const baselines = currentProject?.baselines || [];
  const activeBaseline = baselines.find(b => b.isActive) || null;

  const setBaseline = useCallback(async (notes = '') => {
    const blId = `bl-${Date.now()}`;
    const now = new Date().toISOString().split('T')[0];

    // Calculate BAC for snapshot
    const bacH = epics.reduce((sum, e) => sum + (e.baselineEstimate || getEffectiveEstimate(e, features)), 0);
    let bacVal = 0;
    if (hasRates) {
      epics.forEach(e => {
        bacVal += (e.baselineEstimate || getEffectiveEstimate(e, features)) * getIssueRate(e, projectRates, defaultRateId);
      });
    }

    const newBaseline = {
      id: blId, date: now, bacH, bacVal,
      epicCount: epics.length,
      epicIds: epics.map(e => e.id),
      notes, isActive: true,
    };

    const updatedBaselines = [
      ...(currentProject?.baselines || []).map(b => ({ ...b, isActive: false })),
      newBaseline,
    ];

    // Lock all epics and stamp baseline_id
    for (const e of epics) {
      await updateEpic(e.id, {
        isBaselineLocked: true,
        baselineEstimate: e.baselineEstimate || getEffectiveEstimate(e, features),
        baselineId: blId,
      });
    }
    await updateCurrentProject({ baselines: updatedBaselines });
    setShowBaselineDialog(false);
    setBaselineNotes('');
  }, [epics, hasRates, projectRates, defaultRateId, currentProject, updateEpic, updateCurrentProject]);

  const scopeChangeMetrics = useMemo(() => {
    if (!activeBaseline) return null;
    const newEpics = epics.filter(e => !activeBaseline.epicIds.includes(e.id));
    if (newEpics.length === 0) return null;

    const currentBacH = epics.reduce((sum, e) => sum + (e.baselineEstimate || getEffectiveEstimate(e, features)), 0);
    let currentBacVal = 0;
    if (hasRates) {
      epics.forEach(e => {
        currentBacVal += (e.baselineEstimate || getEffectiveEstimate(e, features)) * getIssueRate(e, projectRates, defaultRateId);
      });
    }

    return {
      originalBacH: activeBaseline.bacH,
      originalBacVal: activeBaseline.bacVal,
      currentBacH, currentBacVal,
      deltaBacH: currentBacH - activeBaseline.bacH,
      deltaBacVal: currentBacVal - activeBaseline.bacVal,
      newEpicCount: newEpics.length,
      newEpics,
    };
  }, [epics, features, activeBaseline, hasRates, projectRates, defaultRateId]);

  const updateIssueRate = useCallback((epicId, rateId) => {
    updateEpic(epicId, { rateId: rateId || undefined });
  }, [updateEpic]);

  // ---- Rate CRUD ----
  const addRate = useCallback((name, rate) => {
    const newId = `rate-${Date.now()}`;
    const newRates = [...projectRates, { id: newId, name, rate: parseFloat(rate) || 0 }];
    updateCurrentProject({ rates: newRates });
    if (newRates.length === 1) updateProjectSettings({ defaultRateId: newId });
  }, [projectRates, updateCurrentProject, updateProjectSettings]);

  const updateRate = useCallback((rateId, updates) => {
    updateCurrentProject({ rates: projectRates.map(r => r.id === rateId ? { ...r, ...updates } : r) });
  }, [projectRates, updateCurrentProject]);

  const deleteRate = useCallback((rateId) => {
    if (rateId === defaultRateId) return;
    updateCurrentProject({ rates: projectRates.filter(r => r.id !== rateId) });
    epics.forEach(e => { if (e.rateId === rateId) updateEpic(e.id, { rateId: undefined }); });
  }, [projectRates, defaultRateId, epics, updateCurrentProject, updateEpic]);

  const setDefaultRate = useCallback((rateId) => { updateProjectSettings({ defaultRateId: rateId }); }, [updateProjectSettings]);

  // ---- Feature CRUD ----
  const addFeature = useCallback(async (epicId) => {
    const tempId = `feat-${Date.now()}`;
    const sortOrder = features.filter(f => f.epicId === epicId).length;
    const newFeature = {
      id: tempId, epicId, name: '', roleId: null,
      pertOptimistic: null, pertMostLikely: null, pertPessimistic: null, fte: 1, sortOrder,
    };
    setFeatures(prev => [...prev, newFeature]);
    try {
      const dbRow = await dbInsertFeature({ epic_id: epicId, name: '', fte: 1, sort_order: sortOrder });
      if (dbRow) {
        const mapped = mapFeatureFromDb(dbRow);
        setFeatures(prev => prev.map(f => f.id === tempId ? mapped : f));
      }
    } catch (err) {
      setFeatures(prev => prev.filter(f => f.id !== tempId));
      console.error('Add feature error:', err);
    }
  }, [features]);

  const updateFeature = useCallback(async (featureId, updates) => {
    setFeatures(prev => prev.map(f => f.id === featureId ? { ...f, ...updates } : f));
    await dbUpdateFeature(featureId, mapFeatureToDb(updates));
  }, []);

  const deleteFeature = useCallback(async (featureId) => {
    setFeatures(prev => prev.filter(f => f.id !== featureId));
    await dbDeleteFeature(featureId);
  }, []);

  const toggleEpicExpanded = useCallback((epicId) => {
    setExpandedEpicIds(prev => {
      const next = new Set(prev);
      if (next.has(epicId)) next.delete(epicId); else next.add(epicId);
      return next;
    });
  }, []);

  // ---- Milestone CRUD ----
  const addMilestone = useCallback(() => {
    const newMs = { id: `ms-${Date.now()}`, date: '', plannedCumulativePV: 0, notes: '' };
    updateCurrentProject({ milestones: [...milestones, newMs] });
  }, [milestones, updateCurrentProject]);

  const updateMilestone = useCallback((msId, updates) => {
    updateCurrentProject({ milestones: milestones.map(m => m.id === msId ? { ...m, ...updates } : m) });
  }, [milestones, updateCurrentProject]);

  const deleteMilestone = useCallback((msId) => {
    updateCurrentProject({ milestones: milestones.filter(m => m.id !== msId) });
  }, [milestones, updateCurrentProject]);

  // ---- EVM Calculations ----
  const evmMetrics = useMemo(() => {
    const bacH = epics.reduce((sum, i) => sum + (i.baselineEstimate || getEffectiveEstimate(i, features)), 0);
    const evH = epics.reduce((sum, i) => sum + (i.baselineEstimate || getEffectiveEstimate(i, features)) * getCompletionRate(i.status), 0);
    const acH = epics.reduce((sum, i) => sum + i.timeSpent, 0);

    // PV: wenn Baseline aktiv, nur Baseline-Epics für PV (neue Epics waren nicht geplant)
    const pvEpics = activeBaseline ? epics.filter(e => activeBaseline.epicIds.includes(e.id)) : epics;
    let pvH;
    if (pvMethod === 'milestones') {
      pvH = calcMilestonePV(milestones, reportingDate);
    } else {
      pvH = calcTimeBasedPV(pvEpics, reportingDate, projectRates, defaultRateId, false).pvH;
    }

    let bac = bacH, ev = evH, ac = acH, pv = pvH;
    let avgRate = 0;
    if (hasRates) {
      bac = 0; ev = 0; ac = 0;
      epics.forEach(i => {
        const rate = getIssueRate(i, projectRates, defaultRateId);
        const estimate = i.baselineEstimate || getEffectiveEstimate(i, features);
        bac += estimate * rate;
        ev += estimate * getCompletionRate(i.status) * rate;
        ac += i.timeSpent * rate;
      });
      avgRate = bacH > 0 ? bac / bacH : 0;
      if (pvMethod === 'milestones') {
        pv = pvH * avgRate;
      } else {
        pv = calcTimeBasedPV(pvEpics, reportingDate, projectRates, defaultRateId, true).pvVal;
      }
    }

    // Original BAC aus Baseline-Snapshot
    const originalBac = activeBaseline ? (hasRates ? activeBaseline.bacVal : activeBaseline.bacH) : null;

    const sv = ev - pv;
    const cv = ev - ac;
    const spi = pv > 0 ? ev / pv : 0;
    const cpi = ac > 0 ? ev / ac : 0;
    const eac = cpi > 0 ? bac / cpi : bac;
    const etc = eac - ac;
    const vac = bac - eac;
    const tcpi = (bac - ac) > 0 ? (bac - ev) / (bac - ac) : 0;
    const progress = bac > 0 ? ev / bac : 0;
    return { bac, ev, ac, pv, sv, cv, spi, cpi, eac, etc, vac, tcpi, progress, bacH, evH, acH, pvH, avgRate, originalBac };
  }, [epics, features, hasRates, projectRates, defaultRateId, pvMethod, milestones, reportingDate, activeBaseline]);

  // ---- MoSCoW Health (ANF-3) ----
  const moscowHealth = useMemo(() => {
    const categories = ['MUST', 'SHOULD', 'COULD', 'WONT'];
    const thresholds = { MUST: 60, SHOULD: 25, COULD: 20, WONT: 35 };
    let totalHours = 0, unassignedCount = 0, unassignedHours = 0;
    const hoursByCategory = { MUST: 0, SHOULD: 0, COULD: 0, WONT: 0 };

    epics.forEach(epic => {
      const h = getEffectiveEstimate(epic, features);
      totalHours += h;
      if (epic.moscow && categories.includes(epic.moscow)) {
        hoursByCategory[epic.moscow] += h;
      } else { unassignedCount++; unassignedHours += h; }
    });

    const mustPct = totalHours > 0 ? (hoursByCategory.MUST / totalHours) * 100 : 0;
    const mustOk = mustPct <= 60;

    return { categories, hoursByCategory, totalHours, unassignedCount, unassignedHours, mustPct, mustOk, thresholds };
  }, [epics, features]);

  // ---- Timeline Projection ----
  const timelineProjection = useMemo(() => {
    const plannedEnd = projectSettings.endDate ? new Date(projectSettings.endDate + 'T00:00:00') : null;
    const projectStart = projectSettings.startDate ? new Date(projectSettings.startDate + 'T00:00:00') : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Method A: SPI-based (classic EVM)
    const plannedDays = (plannedEnd && projectStart) ? (plannedEnd - projectStart) / 86400000 : null;
    const spiEnd = (plannedDays && evmMetrics.spi > 0.01 && projectStart)
      ? new Date(projectStart.getTime() + (plannedDays / evmMetrics.spi) * 86400000) : null;

    // Method B: PERT/FTE-based (bottom-up, 5-day work week)
    const hpw = projectSettings.hoursPerWeek || 42;
    const remainingH = Math.max(evmMetrics.bacH - evmMetrics.evH, 0);
    const activeFte = epics.filter(e => e.status !== 'Done').reduce((s, e) => s + (e.pertFte || 1), 0) || 1;
    const remainingWeeks = remainingH / (hpw * activeFte);
    const fteEnd = new Date(today.getTime() + remainingWeeks * 7 * 86400000);

    // Delays in days
    const spiDelay = (spiEnd && plannedEnd) ? Math.round((spiEnd - plannedEnd) / 86400000) : null;
    const fteDelay = plannedEnd ? Math.round((fteEnd - plannedEnd) / 86400000) : null;

    // Velocity for S-curve projection
    const elapsed = projectStart ? (today - projectStart) / 86400000 : 0;
    const bac = hasRates ? evmMetrics.bac : evmMetrics.bacH;
    const ev = hasRates ? evmMetrics.ev : evmMetrics.evH;
    const evPerDay = elapsed > 0 ? ev / elapsed : 0;

    return { plannedEnd, projectStart, today, spiEnd, spiDelay, fteEnd, fteDelay, remainingH, activeFte, remainingWeeks, evPerDay, bac, ev };
  }, [projectSettings, evmMetrics, epics, hasRates]);

  // ---- Chart Data ----
  const sCurveData = useMemo(() => {
    const points = generateTimelinePoints(epics, milestones, projectSettings);
    if (points.length === 0) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Extend timeline if projections go beyond current range
    const maxProjection = Math.max(
      timelineProjection.spiEnd?.getTime() || 0,
      timelineProjection.fteEnd?.getTime() || 0,
      timelineProjection.plannedEnd?.getTime() || 0
    );
    const lastPoint = points[points.length - 1];
    if (maxProjection > lastPoint.getTime()) {
      let d = new Date(lastPoint);
      while (d.getTime() < maxProjection) {
        d = new Date(d.getTime() + 7 * 86400000);
        points.push(new Date(d));
      }
    }

    // Current EV for projection baseline
    const currentEv = timelineProjection.ev;
    const evPerDay = timelineProjection.evPerDay;
    const bac = timelineProjection.bac;

    return points.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const pvResult = calcTimeBasedPV(epics, dateStr, projectRates, defaultRateId, hasRates);
      const pv = hasRates ? pvResult.pvVal : pvResult.pvH;

      let msPv = null;
      if (milestones.length > 0) {
        const raw = calcMilestonePV(milestones, dateStr);
        msPv = hasRates ? raw * (evmMetrics.avgRate || 1) : raw;
      }

      // EV and AC only up to today (no future projection)
      let evAtDate = null;
      let acAtDate = null;
      if (date <= today) {
        let evH = 0, acH = 0;
        for (const epic of epics) {
          const estimate = epic.baselineEstimate || getEffectiveEstimate(epic, features);
          const start = epic.startDate ? new Date(epic.startDate) : null;
          const end = epic.endDate ? new Date(epic.endDate) : null;
          const rate = (() => { const r = projectRates.find(r => r.id === (epic.rateId || defaultRateId)); return r ? r.rate : 0; })();

          // EV: estimate status at this date based on 50/50
          if (epic.status === 'Done' && end && date >= end) {
            evH += estimate; // 100%
          } else if (start && date >= start) {
            if (epic.status === 'Done' || epic.status === 'In Progress') {
              evH += estimate * 0.5; // 50%
            }
          }

          // AC: distribute timeSpent linearly over epic duration
          if (epic.timeSpent > 0 && start) {
            const acEnd = epic.status === 'Done' && end ? end : today;
            const totalDays = Math.max((acEnd - start) / 86400000, 1);
            const elapsed = Math.max(Math.min((date - start) / 86400000, totalDays), 0);
            acH += epic.timeSpent * (elapsed / totalDays);
          }
        }
        evAtDate = hasRates ? evH * (evmMetrics.avgRate || 1) : evH;
        acAtDate = hasRates ? acH * (evmMetrics.avgRate || 1) : acH;
      }

      // EV projection (from today forward, dashed line)
      let evProjection = null;
      if (date >= today && evPerDay > 0) {
        const daysFromToday = (date - today) / 86400000;
        evProjection = Math.min(currentEv + evPerDay * daysFromToday, bac);
      }

      return {
        date: date.getTime(),
        dateLabel: date.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' }),
        pvTime: pv,
        pvMilestone: msPv,
        ev: evAtDate,
        ac: acAtDate,
        evProjection,
        bac: evmMetrics.bac,
        bacOriginal: evmMetrics.originalBac,
      };
    });
  }, [epics, features, milestones, projectSettings, projectRates, defaultRateId, hasRates, evmMetrics.bac, evmMetrics.avgRate, evmMetrics.originalBac, timelineProjection]);

  const filteredEpics = useMemo(() => {
    if (statusFilter === 'all') return epics;
    return epics.filter(i => i.status === statusFilter);
  }, [epics, statusFilter]);

  const statusCounts = useMemo(() => ({
    done: epics.filter(i => i.status === 'Done').length,
    inProgress: epics.filter(i => i.status === 'In Progress').length,
    toDo: epics.filter(i => i.status === 'To Do').length,
    total: epics.length,
  }), [epics]);

  // ---- Gantt Data ----
  const ganttData = useMemo(() => {
    const withDates = epics.filter(e => e.startDate && e.endDate);
    if (!withDates.length) return { data: [], totalDays: 0, todayOffset: 0, timelineStart: null };

    const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
    const sorted = [...withDates].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const timelineStart = sorted[0].startDate;
    const timelineEnd = sorted.reduce((max, e) => e.endDate > max ? e.endDate : max, sorted[0].endDate);
    const totalDays = daysBetween(timelineStart, timelineEnd);
    const todayOffset = daysBetween(timelineStart, new Date().toISOString().slice(0, 10));

    const data = sorted.map(e => ({
      id: e.id,
      name: e.summary.length > 35 ? e.summary.slice(0, 32) + '...' : e.summary,
      fullName: e.summary,
      moscow: e.moscow,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      offset: daysBetween(timelineStart, e.startDate),
      duration: Math.max(1, daysBetween(e.startDate, e.endDate)),
    }));

    return { data, totalDays, todayOffset, timelineStart };
  }, [epics]);

  // ---- PERT Calculations ----
  const pertRoles = projectSettings.pertRoles || { dev: 60, ux: 10, arch: 5, qa: 15, pm: 10 };
  const hoursPerWeek = projectSettings.hoursPerWeek || 42;

  const pertData = useMemo(() => {
    const rows = epics.map(epic => {
      const epicFeatures = features.filter(f => f.epicId === epic.id);

      if (epicFeatures.length > 0) {
        // Feature-based calculation
        const featureRows = epicFeatures.map(f => {
          const o = f.pertOptimistic, m = f.pertMostLikely, p = f.pertPessimistic;
          const hasFPert = o != null && m != null && p != null && o > 0 && m > 0 && p > 0;
          if (!hasFPert) return { feature: f, hasPert: false };
          const fte = f.fte || 1;
          const { expected: te, stdDev: sigma } = calcPERT(o, m, p);
          const te95 = te + 2 * sigma;
          const dauerKW = te / hoursPerWeek / fte;
          const dauer95KW = te95 / hoursPerWeek / fte;
          const rate = hasRates ? getIssueRate({ rateId: f.roleId }, projectRates, defaultRateId) : 0;
          const kostenTE = te * rate;
          const kosten95 = te95 * rate;
          const cv = te > 0 ? sigma / te : 0;
          const risikoklasse = cv < 0.15 ? 'Tief' : cv <= 0.25 ? 'Mittel' : 'Hoch';
          return { feature: f, hasPert: true, te, sigma, te95, dauerKW, dauer95KW, rate, kostenTE, kosten95, risikoklasse, cv };
        });

        const featComputed = featureRows.filter(r => r.hasPert);
        const totalTe = featComputed.reduce((s, r) => s + r.te, 0);
        const totalSigma = Math.sqrt(featComputed.reduce((s, r) => s + r.sigma * r.sigma, 0));
        const totalTe95 = featComputed.reduce((s, r) => s + r.te95, 0);
        const totalKostenTE = featComputed.reduce((s, r) => s + r.kostenTE, 0);
        const totalKosten95 = featComputed.reduce((s, r) => s + r.kosten95, 0);
        const totalDauerKW = featComputed.reduce((s, r) => s + r.dauerKW, 0);
        const totalDauer95KW = featComputed.reduce((s, r) => s + r.dauer95KW, 0);
        const uplift = epic.pertUplift || 0;
        const budgetUplift = totalKosten95 * (1 + uplift / 100);
        const cv = totalTe > 0 ? totalSigma / totalTe : 0;
        const risikoklasse = cv < 0.15 ? 'Tief' : cv <= 0.25 ? 'Mittel' : 'Hoch';

        return {
          epic, hasFeatures: true, featureRows, hasPert: featComputed.length > 0,
          te: totalTe, sigma: totalSigma, te95: totalTe95,
          dauerKW: totalDauerKW, dauer95KW: totalDauer95KW,
          rate: 0, kostenTE: totalKostenTE, kosten95: totalKosten95, budgetUplift, risikoklasse, cv,
          devH: 0, uxH: 0, archH: 0, qaH: 0, pmH: 0,
        };
      }

      // Epic-level PERT (keine Features)
      const o = epic.pertOptimistic;
      const m = epic.pertMostLikely;
      const p = epic.pertPessimistic;
      const hasPert = o != null && m != null && p != null && o > 0 && m > 0 && p > 0;
      if (!hasPert) return { epic, hasFeatures: false, hasPert: false };

      const fte = epic.pertFte || 1;
      const uplift = epic.pertUplift || 0;
      const { expected: te, stdDev: sigma } = calcPERT(o, m, p);
      const te95 = te + 2 * sigma;
      const dauerKW = te / hoursPerWeek / fte;
      const dauer95KW = te95 / hoursPerWeek / fte;
      const rate = hasRates ? getIssueRate(epic, projectRates, defaultRateId) : 0;
      const kostenTE = te * rate;
      const kosten95 = te95 * rate;
      const budgetUplift = kosten95 * (1 + uplift / 100);
      const cv = te > 0 ? sigma / te : 0;
      const risikoklasse = cv < 0.15 ? 'Tief' : cv <= 0.25 ? 'Mittel' : 'Hoch';

      return {
        epic, hasFeatures: false, hasPert: true, te, sigma, te95, dauerKW, dauer95KW,
        rate, kostenTE, kosten95, budgetUplift, risikoklasse, cv,
        devH: te * pertRoles.dev / 100, uxH: te * pertRoles.ux / 100,
        archH: te * pertRoles.arch / 100, qaH: te * pertRoles.qa / 100,
        pmH: te * pertRoles.pm / 100,
      };
    });

    const computed = rows.filter(r => r.hasPert);
    const totals = {
      te: computed.reduce((s, r) => s + r.te, 0),
      sigma: Math.sqrt(computed.reduce((s, r) => s + r.sigma * r.sigma, 0)),
      te95: computed.reduce((s, r) => s + r.te95, 0),
      dauerKW: computed.reduce((s, r) => s + r.dauerKW, 0),
      dauer95KW: computed.reduce((s, r) => s + r.dauer95KW, 0),
      kostenTE: computed.reduce((s, r) => s + r.kostenTE, 0),
      kosten95: computed.reduce((s, r) => s + r.kosten95, 0),
      budgetUplift: computed.reduce((s, r) => s + r.budgetUplift, 0),
      devH: computed.reduce((s, r) => s + r.devH, 0),
      uxH: computed.reduce((s, r) => s + r.uxH, 0),
      archH: computed.reduce((s, r) => s + r.archH, 0),
      qaH: computed.reduce((s, r) => s + r.qaH, 0),
      pmH: computed.reduce((s, r) => s + r.pmH, 0),
    };

    return { rows, totals, computed };
  }, [epics, features, hoursPerWeek, hasRates, projectRates, defaultRateId, pertRoles]);

  // ---- Gantt Helpers ----
  const moscowBarColors = { MUST: '#dc2626', SHOULD: '#d97706', COULD: '#2563eb', WONT: '#94a3b8' };

  const renderGanttBar = (props) => {
    const { x, y, width, height, payload } = props;
    const fill = moscowBarColors[payload.moscow] || '#cbd5e1';
    return (
      <g>
        <rect x={x} y={y} width={Math.max(width, 2)} height={height} fill={fill} rx={3} />
        {width > 50 && (
          <text x={x + 6} y={y + height / 2 + 4} fill="white" fontSize={11} fontWeight="bold">
            {payload.moscow || '—'}
          </text>
        )}
      </g>
    );
  };

  const GanttTooltip = ({ active, payload }) => {
    if (!active || !payload?.[1]) return null;
    const d = payload[1].payload;
    const moscowLabel = { MUST: 'MUST', SHOULD: 'SHOULD', COULD: 'COULD', WONT: "WON'T" };
    return (
      <div className="bg-white shadow-lg border rounded-lg p-3 text-sm max-w-xs">
        <p className="font-semibold text-slate-900">{d.fullName}</p>
        <p className="text-slate-500">{d.startDate} → {d.endDate} ({d.duration} Tage)</p>
        <p>MoSCoW: <span className="font-medium">{moscowLabel[d.moscow] || '—'}</span></p>
        <p>Status: {d.status}</p>
      </div>
    );
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'epics', label: 'Epics', icon: FileSpreadsheet },
    { id: 'pert', label: 'PERT', icon: Calculator },
    ...(pvMethod === 'milestones' ? [{ id: 'milestones', label: 'Meilensteine', icon: Flag }] : []),
    { id: 'metrics', label: 'EVM Kennzahlen', icon: Target },
    { id: 'rates', label: 'Rollen & Sätze', icon: DollarSign },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
    { id: 'help', label: 'EVM Glossar', icon: HelpCircle },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Daten werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900">
      {isOffline && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-center text-sm text-amber-700 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" /> Offline-Modus (read-only) — Verbindung zu Supabase nicht verfügbar
        </div>
      )}

      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <GitMerge className="w-5 h-5 text-white" />
              </div>
              <button onClick={() => setShowPortfolio(!showPortfolio)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${showPortfolio ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}><BarChart3 className="w-4 h-4" />Portfolio</button>
              <ProjectSelector
                projects={projects} currentProjectId={currentProjectId}
                onSelectProject={(id) => { setCurrentProjectId(id); setShowPortfolio(false); }}
                onCreateProject={createProject} onDeleteProject={deleteProject} onDuplicateProject={duplicateProject}
              />
            </div>
            <div className="flex items-center gap-3">
              {!isOffline && <Wifi className="w-4 h-4 text-emerald-500" title="Supabase verbunden" />}
              {!showPortfolio && (
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  evmMetrics.spi >= 1 && evmMetrics.cpi >= 1 ? 'bg-emerald-50 text-emerald-700'
                  : evmMetrics.spi >= 0.9 && evmMetrics.cpi >= 0.9 ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
                }`}>
                  {evmMetrics.spi >= 1 && evmMetrics.cpi >= 1 ? '✓ On Track' : evmMetrics.spi >= 0.9 && evmMetrics.cpi >= 0.9 ? '⚠ At Risk' : '✗ Behind'}
                </span>
              )}
            </div>
          </div>

          {!showPortfolio && (
            <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                    activeTab === tab.id ? 'bg-white text-slate-900 border-t border-l border-r border-slate-200' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}>
                  <tab.icon className="w-4 h-4" />{tab.label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {showPortfolio ? (
          <PortfolioOverview projects={projects} projectEpicsMap={projectEpicsMap} onSelectProject={(id) => { setCurrentProjectId(id); setShowPortfolio(false); }} />
        ) : (
          <>
            {/* ====== DASHBOARD ====== */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {scopeChangeMetrics && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800">Scope-Änderung erkannt</p>
                      <p className="text-sm text-amber-700 mt-1">
                        {scopeChangeMetrics.newEpicCount} neue Epic{scopeChangeMetrics.newEpicCount > 1 ? 's' : ''} seit Baseline vom {formatDate(activeBaseline.date)}
                      </p>
                      <p className="text-sm text-amber-700">
                        BAC: {hasRates ? formatCurrency(scopeChangeMetrics.originalBacVal, currency) : `${scopeChangeMetrics.originalBacH}h`} → {hasRates ? formatCurrency(scopeChangeMetrics.currentBacVal, currency) : `${scopeChangeMetrics.currentBacH}h`} ({hasRates ? `+${formatCurrency(scopeChangeMetrics.deltaBacVal, currency)}` : `+${scopeChangeMetrics.deltaBacH}h`})
                      </p>
                    </div>
                    <button onClick={() => setShowBaselineDialog(true)} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg whitespace-nowrap" disabled={isOffline}>
                      Neu-Baseline setzen
                    </button>
                  </div>
                )}

                {/* Governance Alert (ANF-1) */}
                {(evmMetrics.spi < 0.9 || evmMetrics.cpi < 0.9) && evmMetrics.pv > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-rose-800">Exception Report fällig</p>
                      <div className="text-sm text-rose-700 mt-1 space-y-0.5">
                        {evmMetrics.spi < 0.9 && <p>SPI unter Schwellwert ({evmMetrics.spi.toFixed(2)} &lt; 0.90)</p>}
                        {evmMetrics.cpi < 0.9 && <p>CPI unter Schwellwert ({evmMetrics.cpi.toFixed(2)} &lt; 0.90)</p>}
                      </div>
                      <p className="text-xs text-rose-500 mt-2">Gemäss Governance-Rhythmus: Sofortiger Exception Report an die GL erforderlich.</p>
                    </div>
                  </div>
                )}
                {(evmMetrics.spi >= 0.9 && evmMetrics.cpi >= 0.9) && (evmMetrics.spi < 1.0 || evmMetrics.cpi < 1.0) && evmMetrics.pv > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-700">
                      Erwähnung im nächsten Highlight Report empfohlen
                      {evmMetrics.spi < 1.0 && ` – SPI ${evmMetrics.spi.toFixed(2)}`}
                      {evmMetrics.cpi < 1.0 && ` – CPI ${evmMetrics.cpi.toFixed(2)}`}
                    </p>
                  </div>
                )}

                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">{currentProject?.name}</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {projectSettings.startDate ? formatDate(projectSettings.startDate) : '–'} – {projectSettings.endDate ? formatDate(projectSettings.endDate) : '–'} • {epics.length} Epics
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${evmMetrics.cpi >= 1 && evmMetrics.spi >= 1 ? 'bg-emerald-50' : evmMetrics.cpi >= 0.9 && evmMetrics.spi >= 0.9 ? 'bg-amber-50' : 'bg-rose-50'}`}>
                      <CheckCircle className={`w-6 h-6 ${evmMetrics.cpi >= 1 && evmMetrics.spi >= 1 ? 'text-emerald-600' : evmMetrics.cpi >= 0.9 && evmMetrics.spi >= 0.9 ? 'text-amber-600' : 'text-rose-600'}`} />
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-500">Fortschritt</span>
                      <span className="text-sm font-medium text-slate-700">{(evmMetrics.progress * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(evmMetrics.progress * 100).toFixed(1)}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-100">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{hasRates ? formatCurrency(evmMetrics.bac, currency) : `${evmMetrics.bac}h`}</p>
                      <p className="text-xs text-slate-400 mt-0.5">BAC</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-600">{hasRates ? formatCurrency(evmMetrics.ev, currency) : `${evmMetrics.ev.toFixed(1)}h`}</p>
                      <p className="text-xs text-slate-400 mt-0.5">EV</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{evmMetrics.cpi.toFixed(2)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">CPI</p>
                    </div>
                  </div>
                </div>

                {/* ====== ZEITPROGNOSE CARD ====== */}
                {projectSettings.startDate && projectSettings.endDate ? (
                  <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />Zeitprognose
                    </h3>
                    {evmMetrics.progress === 0 ? (
                      <p className="text-sm text-slate-400">Noch keine Fortschrittsdaten vorhanden.</p>
                    ) : evmMetrics.progress >= 1 ? (
                      <p className="text-sm text-emerald-600 font-medium">Projekt abgeschlossen.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-5">
                          {/* Geplantes Ende */}
                          <div className="text-center p-4 rounded-lg bg-slate-50">
                            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Geplantes Ende</p>
                            <p className="text-xl font-bold text-slate-800">{formatDate(projectSettings.endDate)}</p>
                            <p className="text-xs text-slate-400 mt-1">Projekt-Initiative</p>
                          </div>
                          {/* SPI-Prognose */}
                          <div className={`text-center p-4 rounded-lg ${timelineProjection.spiDelay == null ? 'bg-slate-50' : timelineProjection.spiDelay <= 0 ? 'bg-emerald-50' : timelineProjection.spiDelay <= 14 ? 'bg-amber-50' : 'bg-rose-50'}`} title="Sind wir im Zeitplan?">
                            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">SPI-Prognose</p>
                            <p className="text-xl font-bold text-slate-800">
                              {timelineProjection.spiEnd ? formatDate(timelineProjection.spiEnd.toISOString().split('T')[0]) : 'n/a'}
                            </p>
                            {timelineProjection.spiDelay != null && (
                              <p className={`text-xs mt-1 font-medium ${timelineProjection.spiDelay <= 0 ? 'text-emerald-600' : timelineProjection.spiDelay <= 14 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {timelineProjection.spiDelay <= 0 ? `${Math.abs(timelineProjection.spiDelay)}d voraus` : `${timelineProjection.spiDelay}d Verzug`}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">SPI: {evmMetrics.spi.toFixed(2)}</p>
                          </div>
                          {/* FTE-Prognose */}
                          <div className={`text-center p-4 rounded-lg ${timelineProjection.fteDelay == null ? 'bg-slate-50' : timelineProjection.fteDelay <= 0 ? 'bg-emerald-50' : timelineProjection.fteDelay <= 14 ? 'bg-amber-50' : 'bg-rose-50'}`}>
                            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">FTE-Prognose</p>
                            <p className="text-xl font-bold text-slate-800">
                              {formatDate(timelineProjection.fteEnd.toISOString().split('T')[0])}
                            </p>
                            {timelineProjection.fteDelay != null && (
                              <p className={`text-xs mt-1 font-medium ${timelineProjection.fteDelay <= 0 ? 'text-emerald-600' : timelineProjection.fteDelay <= 14 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {timelineProjection.fteDelay <= 0 ? `${Math.abs(timelineProjection.fteDelay)}d voraus` : `${timelineProjection.fteDelay}d Verzug`}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">{timelineProjection.activeFte} FTE aktiv</p>
                          </div>
                          {/* CPI-Prognose */}
                          <div className={`text-center p-4 rounded-lg ${evmMetrics.cpi === 0 ? 'bg-slate-50' : evmMetrics.cpi >= 1 ? 'bg-emerald-50' : evmMetrics.cpi >= 0.9 ? 'bg-amber-50' : 'bg-rose-50'}`} title="Sind wir im Budget?">
                            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">CPI-Prognose</p>
                            <p className="text-xl font-bold text-slate-800">
                              {evmMetrics.ac > 0 ? (hasRates ? formatCurrency(evmMetrics.eac, currency) : `${evmMetrics.eac.toFixed(0)}h`) : 'n/a'}
                            </p>
                            {evmMetrics.ac > 0 && (
                              <p className={`text-xs mt-1 font-medium ${evmMetrics.vac >= 0 ? 'text-emerald-600' : evmMetrics.cpi >= 0.9 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {evmMetrics.vac >= 0 ? 'Unter Budget' : 'Über Budget'}
                                {' '}({hasRates ? formatCurrency(Math.abs(evmMetrics.vac), currency) : `${Math.abs(evmMetrics.vac).toFixed(0)}h`})
                              </p>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">CPI: {evmMetrics.cpi.toFixed(2)}</p>
                          </div>
                        </div>
                        {/* Mini Timeline */}
                        {(() => {
                          const dates = [timelineProjection.plannedEnd, timelineProjection.spiEnd, timelineProjection.fteEnd].filter(Boolean).map(d => d.getTime());
                          const start = timelineProjection.projectStart?.getTime() || Math.min(...dates);
                          const end = Math.max(...dates);
                          const range = end - start || 1;
                          const pos = d => `${Math.max(0, Math.min(100, ((d.getTime() - start) / range) * 100))}%`;
                          const todayPos = pos(timelineProjection.today);
                          return (
                            <div className="relative h-8 bg-slate-100 rounded-full overflow-visible mx-2">
                              {/* Progress fill */}
                              <div className="absolute inset-y-0 left-0 bg-blue-100 rounded-full" style={{ width: todayPos }} />
                              {/* Today marker */}
                              <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-6 bg-slate-400" style={{ left: todayPos }} title="Heute">
                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">Heute</span>
                              </div>
                              {/* Planned end */}
                              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-400 border-2 border-white shadow" style={{ left: pos(timelineProjection.plannedEnd) }} title={`Geplant: ${formatDate(projectSettings.endDate)}`} />
                              {/* SPI projection */}
                              {timelineProjection.spiEnd && (
                                <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow ${timelineProjection.spiDelay <= 0 ? 'bg-emerald-500' : timelineProjection.spiDelay <= 14 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ left: pos(timelineProjection.spiEnd) }} title="SPI-Prognose" />
                              )}
                              {/* FTE projection */}
                              <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow ${timelineProjection.fteDelay <= 0 ? 'bg-emerald-500' : timelineProjection.fteDelay <= 14 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ left: pos(timelineProjection.fteEnd) }} title="FTE-Prognose" />
                            </div>
                          );
                        })()}
                        {/* Context info */}
                        <div className="flex gap-6 mt-4 text-xs text-slate-400">
                          <span>Restaufwand: {timelineProjection.remainingH.toFixed(0)}h</span>
                          <span>Restdauer: {timelineProjection.remainingWeeks.toFixed(1)} Wochen</span>
                          <span>Aktive FTE: {timelineProjection.activeFte}</span>
                          <span className="ml-auto flex items-center gap-3">
                            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" />Geplant</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />SPI</span>
                            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />FTE</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                    <p className="text-sm text-slate-400 flex items-center gap-2"><Calendar className="w-4 h-4" />Zeitprognose: Bitte Start- und Enddatum in den Einstellungen setzen.</p>
                  </div>
                )}

                {/* Epic Timeline / Gantt */}
                {ganttData.data.length > 0 && (
                  <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" /> Epic Timeline
                    </h3>
                    <div style={{ maxHeight: 600, overflowY: ganttData.data.length > 15 ? 'auto' : 'visible' }}>
                      <div style={{ height: Math.max(300, ganttData.data.length * 40) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart layout="vertical" data={ganttData.data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, ganttData.totalDays]} tickFormatter={(v) => { const d = new Date(ganttData.timelineStart); d.setDate(d.getDate() + v); return d.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' }); }} />
                            <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 12 }} />
                            <Tooltip content={<GanttTooltip />} />
                            <ReferenceLine x={ganttData.todayOffset} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Heute', fill: '#64748b', fontSize: 11, position: 'top' }} />
                            <Bar dataKey="offset" stackId="gantt" fill="transparent" />
                            <Bar dataKey="duration" stackId="gantt" shape={renderGanttBar} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-3 text-[10px] text-slate-400">
                      {[['MUST','bg-red-600/70'],['SHOULD','bg-amber-600/70'],['COULD','bg-blue-600/70'],["WON'T",'bg-slate-400/70']].map(([l,c]) => (
                        <span key={l} className="flex items-center gap-1">
                          <span className={`w-2.5 h-2.5 rounded-sm ${c}`}></span> {l}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kostenprognose (ANF-2) */}
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    Kostenprognose
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'BAC (Budget)', value: hasRates ? formatCurrency(evmMetrics.bac, currency) : `${evmMetrics.bacH.toFixed(1)}h`, sub: 'Gesamtbudget', color: 'text-slate-700' },
                      { label: 'EAC (Prognose)', value: hasRates ? formatCurrency(evmMetrics.eac, currency) : `${evmMetrics.eac.toFixed(1)}h`, sub: 'Prognostizierte Gesamtkosten', color: evmMetrics.vac >= 0 ? 'text-emerald-700' : 'text-rose-700' },
                      { label: 'VAC (Differenz)', value: `${evmMetrics.vac >= 0 ? '+' : ''}${hasRates ? formatCurrency(evmMetrics.vac, currency) : `${evmMetrics.vac.toFixed(1)}h`}`, sub: evmMetrics.vac >= 0 ? 'Unter Budget' : 'Über Budget', color: evmMetrics.vac >= 0 ? 'text-emerald-700' : 'text-rose-700' },
                      { label: 'ETC (Restkosten)', value: hasRates ? formatCurrency(evmMetrics.etc, currency) : `${evmMetrics.etc.toFixed(1)}h`, sub: 'Noch benötigt', color: 'text-slate-700' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500">{item.label}</p>
                        <p className={`text-lg font-bold ${item.color} mt-1`}>{item.value}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                    <h4 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" />Aktueller Status</h4>
                    <div className="space-y-4">
                      {[
                        { label: 'Schedule', actual: evmMetrics.evH, planned: evmMetrics.pvH, unit: 'h', good: evmMetrics.sv >= 0, status: evmMetrics.sv >= 0 ? 'Voraus' : 'Im Verzug' },
                        { label: 'Cost', actual: hasRates ? evmMetrics.ev : evmMetrics.evH, planned: hasRates ? evmMetrics.ac : evmMetrics.acH, unit: hasRates ? currency : 'h', good: evmMetrics.cv >= 0, status: evmMetrics.cv >= 0 ? 'Unter Budget' : 'Über Budget' },
                        { label: 'Prognose', actual: hasRates ? evmMetrics.eac : Math.round(evmMetrics.eac * 10) / 10, planned: hasRates ? evmMetrics.bac : evmMetrics.bacH, unit: hasRates ? currency : 'h', good: evmMetrics.vac >= 0, status: evmMetrics.vac >= 0 ? 'Unter Budget' : 'Über Budget' },
                      ].map(item => {
                        const ratio = item.planned > 0 ? Math.min(item.actual / item.planned, 1.5) : 0;
                        const barPercent = Math.min(ratio * 100, 100);
                        const overflowPercent = ratio > 1 ? Math.min((ratio - 1) * 100, 50) : 0;
                        return (
                          <div key={item.label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-slate-700">{item.label}</span>
                              <span className={`text-xs font-medium ${item.good ? 'text-emerald-600' : 'text-rose-600'}`}>{item.status}</span>
                            </div>
                            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden relative">
                              <div className={`h-full rounded-full transition-all ${item.good ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${barPercent}%` }} />
                              {overflowPercent > 0 && <div className="absolute top-0 right-0 h-full bg-rose-300 rounded-r-full" style={{ width: `${overflowPercent}%` }} />}
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-xs text-slate-400">{item.label === 'Schedule' ? `EV: ${item.actual.toFixed(1)}h` : `Ist: ${hasRates ? formatCurrency(item.actual, currency) : item.actual + 'h'}`}</span>
                              <span className="text-xs text-slate-400">{item.label === 'Schedule' ? `PV: ${item.planned.toFixed(1)}h` : `Soll: ${hasRates ? formatCurrency(item.planned, currency) : item.planned + 'h'}`}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-blue-600" />Epic Status</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'Done', count: statusCounts.done, color: 'bg-emerald-500' },
                        { label: 'In Progress', count: statusCounts.inProgress, color: 'bg-blue-500' },
                        { label: 'To Do', count: statusCounts.toDo, color: 'bg-slate-400' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className="text-slate-500">{item.label}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full ${item.color} rounded-full`} style={{ width: `${statusCounts.total > 0 ? (item.count / statusCounts.total) * 100 : 0}%` }} /></div>
                            <span className="text-slate-600 font-medium w-6 text-right">{item.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* MoSCoW + Stage Gate Row (ANF-3 + ANF-4) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* MoSCoW Health Indicator (ANF-3) */}
                  {moscowHealth.totalHours > 0 && (
                    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-purple-600" />
                        MoSCoW Scope-Split
                      </h3>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl font-bold text-slate-900">{Math.round(moscowHealth.mustPct)}%</span>
                        <span className="text-sm text-slate-500">MUST-Anteil (max. 60%)</span>
                        <span className={`ml-auto px-2 py-0.5 text-xs font-bold rounded ${moscowHealth.mustOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {moscowHealth.mustOk ? '✓ OK' : '✗ Verletzt'}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden relative">
                        <div className={`h-full rounded-full transition-all ${moscowHealth.mustOk ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(moscowHealth.mustPct, 100)}%` }} />
                        <div className="absolute top-0 h-full border-r-2 border-slate-400" style={{ left: '60%' }} title="60%-Schwelle" />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                        <span>0%</span>
                        <span>60% Limit</span>
                        <span>100%</span>
                      </div>
                      {moscowHealth.unassignedCount > 0 && (
                        <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {moscowHealth.unassignedCount} Epic{moscowHealth.unassignedCount > 1 ? 's' : ''} ohne MoSCoW-Zuordnung
                        </p>
                      )}
                    </div>
                  )}

                  {/* Stage Gate Status (ANF-4) */}
                  {projectSettings.stageGateCriterion && (
                    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Flag className="w-4 h-4 text-indigo-600" />
                        Stage Gate
                      </h3>
                      <p className="text-sm text-slate-700 mb-3">{projectSettings.stageGateCriterion}</p>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 text-sm font-medium rounded-lg ${
                          projectSettings.stageGateStatus === 'achieved' ? 'bg-emerald-100 text-emerald-700' :
                          projectSettings.stageGateStatus === 'missed' ? 'bg-rose-100 text-rose-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {projectSettings.stageGateStatus === 'achieved' ? '✓ Erreicht' :
                           projectSettings.stageGateStatus === 'missed' ? '✗ Nicht erreicht' :
                           '○ Offen'}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">
                          Zieldatum: {projectSettings.stageGateDate ? formatDate(projectSettings.stageGateDate) : (projectSettings.endDate ? formatDate(projectSettings.endDate) : '–')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ====== EPICS TAB ====== */}
            {activeTab === 'epics' && (
              <div className="space-y-6">
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button onClick={addEpic} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg" disabled={isOffline}>
                      <Plus className="w-4 h-4" />Neues Epic
                    </button>
                    {currentProject?.jiraConfig?.domain && (
                      <button onClick={jiraSync} disabled={isOffline || jiraSyncing} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${jiraSyncing ? 'animate-spin' : ''}`} />Jira Sync
                      </button>
                    )}
                    <button onClick={() => setShowBaselineDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg" disabled={isOffline}>
                      <Lock className="w-4 h-4" />Baseline setzen
                    </button>
                    {activeBaseline && (
                      <span className="text-sm text-slate-500">
                        Aktive Baseline: {formatDate(activeBaseline.date)} ({activeBaseline.epicCount} Epics)
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-500" />
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900">
                        <option value="all">Alle Status</option>
                        <option value="Done">Done</option>
                        <option value="In Progress">In Progress</option>
                        <option value="To Do">To Do</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Epic</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">MoSCoW</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Start</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Ende</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
                        {hasRates && <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Rate</th>}
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Schätzung</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Baseline</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Spent</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">EV</th>
                        {hasRates && <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Kosten</th>}
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Lock</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredEpics.map((epic) => {
                        const estimate = epic.baselineEstimate || getEffectiveEstimate(epic, features);
                        const evH = estimate * getCompletionRate(epic.status);
                        const rate = hasRates ? getIssueRate(epic, projectRates, defaultRateId) : 0;
                        const costTotal = hasRates ? estimate * rate : 0;
                        const defaultRate = projectRates.find(r => r.id === defaultRateId);
                        return (
                          <tr key={epic.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {editingEpicId === epic.id ? (
                                  <input type="text" defaultValue={epic.summary} autoFocus
                                    onBlur={(e) => { updateEpic(epic.id, { summary: e.target.value }); setEditingEpicId(null); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingEpicId(null); }}
                                    className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                ) : (
                                  <p className="text-sm font-medium text-slate-700 cursor-pointer hover:text-blue-600" onClick={() => setEditingEpicId(epic.id)}>
                                    {epic.summary || <span className="text-slate-400 italic">Kein Titel</span>}
                                  </p>
                                )}
                                {activeBaseline && !activeBaseline.epicIds.includes(epic.id) && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium shrink-0">NEU</span>
                                )}
                                {epic.removedFromJira && (
                                  <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-medium shrink-0">ENTFERNT</span>
                                )}
                              </div>
                              {epic.jiraKey && <p className="text-xs text-indigo-500 font-mono">{epic.jiraKey}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <select value={epic.moscow || ''} onChange={(e) => updateEpic(epic.id, { moscow: e.target.value || null })} disabled={isOffline}
                                className={`px-2 py-1 text-xs border rounded font-medium ${epic.moscow === 'MUST' ? 'bg-red-100 border-red-300 text-red-700' : epic.moscow === 'SHOULD' ? 'bg-amber-100 border-amber-300 text-amber-700' : epic.moscow === 'COULD' ? 'bg-blue-100 border-blue-300 text-blue-700' : epic.moscow === 'WONT' ? 'bg-slate-200 border-slate-300 text-slate-500' : 'bg-white border-slate-300 text-slate-400'}`}>
                                <option value="">—</option>
                                <option value="MUST">MUST</option>
                                <option value="SHOULD">SHOULD</option>
                                <option value="COULD">COULD</option>
                                <option value="WONT">WON'T</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input type="date" value={epic.startDate || ''} onChange={(e) => updateEpic(epic.id, { startDate: e.target.value })} disabled={isOffline}
                                className="px-1 py-0.5 text-sm border border-slate-200 rounded bg-transparent text-slate-600 w-[120px]" />
                            </td>
                            <td className="px-4 py-3">
                              <input type="date" value={epic.endDate || ''} onChange={(e) => updateEpic(epic.id, { endDate: e.target.value })} disabled={isOffline}
                                className="px-1 py-0.5 text-sm border border-slate-200 rounded bg-transparent text-slate-600 w-[120px]" />
                            </td>
                            <td className="px-4 py-3">
                              <select value={epic.status} onChange={(e) => updateEpic(epic.id, { status: e.target.value })} disabled={isOffline}
                                className={`px-2 py-1 text-xs border rounded font-medium ${epic.status === 'Done' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : epic.status === 'In Progress' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-100 border-slate-300 text-slate-600'}`}>
                                <option value="To Do">To Do</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Done">Done</option>
                              </select>
                            </td>
                            {hasRates && (
                              <td className="px-4 py-3">
                                {features.some(f => f.epicId === epic.id) ? (
                                  <span className="text-xs text-slate-400 italic">via Features</span>
                                ) : (
                                  <select value={epic.rateId || ''} onChange={(e) => updateIssueRate(epic.id, e.target.value)} disabled={isOffline}
                                    className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-xs">
                                    <option value="">Default ({defaultRate?.name})</option>
                                    {projectRates.map(r => <option key={r.id} value={r.id}>{r.name} ({r.rate} {currency}/h)</option>)}
                                  </select>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <input type="number" value={epic.currentEstimate} onChange={(e) => updateEpic(epic.id, { currentEstimate: parseFloat(e.target.value) || 0 })} disabled={isOffline}
                                className="w-16 px-1 py-0.5 text-sm text-right border border-slate-200 rounded bg-transparent" min="0" step="0.5" />
                            </td>
                            <td className="px-4 py-3 text-sm text-right"><span className={epic.isBaselineLocked ? 'text-purple-600' : 'text-slate-500'}>{epic.baselineEstimate}h</span></td>
                            <td className="px-4 py-3">
                              <input type="number" value={epic.timeSpent} onChange={(e) => updateEpic(epic.id, { timeSpent: parseFloat(e.target.value) || 0 })} disabled={isOffline}
                                className="w-16 px-1 py-0.5 text-sm text-right border border-slate-200 rounded bg-transparent text-blue-600" min="0" step="0.5" />
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-emerald-600">{evH.toFixed(1)}h</td>
                            {hasRates && <td className="px-4 py-3 text-sm text-right text-slate-600">{formatCurrency(costTotal, currency)}</td>}
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => toggleBaselineLock(epic.id)} disabled={isOffline} className={`p-1 rounded ${epic.isBaselineLocked ? 'text-purple-600 hover:text-purple-700' : 'text-slate-400 hover:text-slate-600'}`}>
                                {epic.isBaselineLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => deleteEpic(epic.id)} disabled={isOffline || epic.isBaselineLocked}
                                className={`p-1 rounded ${epic.isBaselineLocked ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-rose-600'}`}
                                title={epic.isBaselineLocked ? 'Baseline-gesperrte Epics können nicht gelöscht werden' : 'Epic löschen'}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={hasRates ? 6 : 5} className="px-4 py-3 text-sm font-medium text-slate-600">Total ({filteredEpics.length} Epics)</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-600">{filteredEpics.reduce((s, i) => s + i.currentEstimate, 0)}h</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-purple-600">{filteredEpics.reduce((s, i) => s + (i.baselineEstimate || getEffectiveEstimate(i, features)), 0)}h</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">{filteredEpics.reduce((s, i) => s + i.timeSpent, 0)}h</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-emerald-600">{filteredEpics.reduce((s, i) => s + (i.baselineEstimate || getEffectiveEstimate(i, features)) * getCompletionRate(i.status), 0).toFixed(1)}h</td>
                        {hasRates && <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">{formatCurrency(filteredEpics.reduce((s, i) => s + (i.baselineEstimate || getEffectiveEstimate(i, features)) * getIssueRate(i, projectRates, defaultRateId), 0), currency)}</td>}
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* MoSCoW Kapazitäts-Check */}
                {(() => {
                  const moscowLabels = { MUST: 'MUST', SHOULD: 'SHOULD', COULD: 'COULD', WONT: "WON'T" };
                  const moscowColors = {
                    MUST: 'bg-red-100 text-red-700',
                    SHOULD: 'bg-amber-100 text-amber-700',
                    COULD: 'bg-blue-100 text-blue-700',
                    WONT: 'bg-slate-200 text-slate-500',
                  };
                  const moscowTargets = { MUST: '≤ 60%', SHOULD: '~20%', COULD: '~15%', WONT: '~5%' };
                  const { categories: moscowCategories, hoursByCategory, totalHours, unassignedCount, unassignedHours, thresholds: moscowThresholds } = moscowHealth;

                  return (
                    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-purple-600" />
                        MoSCoW Kapazitäts-Check
                        <span className="text-xs font-normal text-slate-400" title="Must-Haves sollten max. 60% der Gesamtkapazität betragen, damit Scope geflext werden kann.">ℹ️</span>
                      </h3>
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Kategorie</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Stunden</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">% Total</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Ziel %</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-slate-600">OK?</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {moscowCategories.map(cat => {
                            const hours = hoursByCategory[cat];
                            const pct = totalHours > 0 ? (hours / totalHours) * 100 : 0;
                            const isOk = pct <= moscowThresholds[cat];
                            return (
                              <tr key={cat} className="hover:bg-slate-50">
                                <td className="px-4 py-2">
                                  <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded ${moscowColors[cat]}`}>{moscowLabels[cat]}</span>
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-medium text-slate-700">{Math.round(hours).toLocaleString('de-CH')}</td>
                                <td className="px-4 py-2 text-sm text-right text-slate-600">{totalHours > 0 ? `${Math.round(pct)}%` : '—'}</td>
                                <td className="px-4 py-2 text-sm text-right text-slate-500">{moscowTargets[cat]}</td>
                                <td className="px-4 py-2 text-center">
                                  {totalHours > 0 ? (isOk ? <CheckCircle className="w-4 h-4 text-emerald-500 inline" /> : <AlertTriangle className="w-4 h-4 text-amber-500 inline" />) : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50">
                          <tr>
                            <td className="px-4 py-2 text-xs font-bold text-slate-700">TOTAL</td>
                            <td className="px-4 py-2 text-sm text-right font-bold text-slate-800">{Math.round(totalHours).toLocaleString('de-CH')}</td>
                            <td colSpan={3}></td>
                          </tr>
                        </tfoot>
                      </table>
                      {unassignedCount > 0 && (
                        <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {unassignedCount} Epic{unassignedCount > 1 ? 's' : ''} ohne MoSCoW-Zuordnung ({Math.round(unassignedHours)} Stunden)
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-400">Hinweis: Stunden aus PERT-Schätzung (TE₉₅). Must-Haves max. 60% = Voraussetzung für Fix-or-Flex.</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ====== MILESTONES TAB ====== */}
            {activeTab === 'milestones' && pvMethod === 'milestones' && (
              <div className="space-y-6">
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2"><Flag className="w-5 h-5 text-purple-600" />Meilensteine</h3>
                      <p className="text-sm text-slate-500 mt-1">{currentProject?.name}</p>
                    </div>
                  </div>

                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Datum</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Kumulativer PV (h)</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Notizen</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {[...milestones].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(ms => (
                        <tr key={ms.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <input type="date" value={ms.date} onChange={(e) => updateMilestone(ms.id, { date: e.target.value })} disabled={isOffline}
                              className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-sm" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input type="number" value={ms.plannedCumulativePV} onChange={(e) => updateMilestone(ms.id, { plannedCumulativePV: parseFloat(e.target.value) || 0 })} disabled={isOffline}
                              className="w-24 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right" />
                          </td>
                          <td className="px-4 py-3">
                            <input type="text" value={ms.notes} onChange={(e) => updateMilestone(ms.id, { notes: e.target.value })} disabled={isOffline}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-sm" placeholder="Notizen..." />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => deleteMilestone(ms.id)} disabled={isOffline} className="p-1 text-slate-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <button onClick={addMilestone} disabled={isOffline}
                    className="mt-4 flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">
                    <Plus className="w-4 h-4" />Meilenstein hinzufügen
                  </button>
                </div>
              </div>
            )}

            {/* ====== PERT TAB ====== */}
            {activeTab === 'pert' && (
              <div className="space-y-6">
                {/* Section 1: PERT Estimation Table */}
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-purple-600" />PERT-Schätzung
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">{currentProject?.name}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-medium text-slate-600 sticky left-0 z-10 bg-slate-100">Epic / Feature</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">O (h)</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">M (h)</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">P (h)</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">FTE</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600" title="Uplift für Epics, Rolle für Features">Uplift / Rolle</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">TE</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">σ</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">Dauer KW</th>
                          <th className="px-3 py-2.5 text-right font-medium text-slate-600">Dauer 95%</th>
                          {hasRates && <th className="px-3 py-2.5 text-right font-medium text-slate-600">Kosten TE</th>}
                          {hasRates && <th className="px-3 py-2.5 text-right font-medium text-slate-600">Kosten 95%</th>}
                          {hasRates && <th className="px-3 py-2.5 text-right font-medium text-slate-600">Budget+Uplift</th>}
                          <th className="px-3 py-2.5 text-center font-medium text-slate-600">Risiko</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {pertData.rows.map(row => {
                          const isExpanded = expandedEpicIds.has(row.epic.id);
                          const risikoStyle = (rk) => rk === 'Tief'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : rk === 'Mittel' ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-rose-50 text-rose-700 border-rose-300';
                          const totalCols = hasRates ? 15 : 12;

                          return (
                            <React.Fragment key={row.epic.id}>
                              {/* ── Epic row ── */}
                              <tr className={row.hasFeatures ? 'bg-indigo-50/40 hover:bg-indigo-50' : 'hover:bg-slate-50'}>
                                <td className={`px-3 py-2.5 sticky left-0 z-10 ${row.hasFeatures ? 'bg-indigo-50' : 'bg-white'}`}>
                                  <div className="flex items-center gap-1.5">
                                    {row.hasFeatures ? (
                                      <button onClick={() => toggleEpicExpanded(row.epic.id)} className="text-slate-400 hover:text-indigo-600 flex-shrink-0">
                                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                      </button>
                                    ) : <div className="w-4 flex-shrink-0" />}
                                    <span className="font-medium text-slate-900 whitespace-nowrap">{row.epic.summary || <span className="text-slate-400 italic">—</span>}</span>
                                    {row.hasFeatures && <span className="text-xs text-slate-400 ml-1">({row.featureRows.length})</span>}
                                    <button onClick={() => { addFeature(row.epic.id); if (!expandedEpicIds.has(row.epic.id)) toggleEpicExpanded(row.epic.id); }} disabled={isOffline}
                                      title="Feature hinzufügen" className="ml-1 p-0.5 text-slate-300 hover:text-indigo-500 rounded flex-shrink-0">
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                {/* O */}
                                <td className="px-3 py-2.5">
                                  {row.hasFeatures
                                    ? <span className="text-slate-400 text-xs">—</span>
                                    : <input type="number" min={0} step={1} value={row.epic.pertOptimistic ?? ''} disabled={isOffline}
                                        onChange={e => updateEpic(row.epic.id, { pertOptimistic: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />}
                                </td>
                                {/* M */}
                                <td className="px-3 py-2.5">
                                  {row.hasFeatures
                                    ? <span className="text-slate-400 text-xs">—</span>
                                    : <input type="number" min={0} step={1} value={row.epic.pertMostLikely ?? ''} disabled={isOffline}
                                        onChange={e => updateEpic(row.epic.id, { pertMostLikely: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />}
                                </td>
                                {/* P */}
                                <td className="px-3 py-2.5">
                                  {row.hasFeatures
                                    ? <span className="text-slate-400 text-xs">—</span>
                                    : <input type="number" min={0} step={1} value={row.epic.pertPessimistic ?? ''} disabled={isOffline}
                                        onChange={e => updateEpic(row.epic.id, { pertPessimistic: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />}
                                </td>
                                {/* FTE */}
                                <td className="px-3 py-2.5">
                                  {row.hasFeatures
                                    ? <span className="text-slate-400 text-xs">—</span>
                                    : <input type="number" min={0.1} step={0.1} value={row.epic.pertFte ?? 1} disabled={isOffline}
                                        onChange={e => updateEpic(row.epic.id, { pertFte: parseFloat(e.target.value) || 1 })}
                                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />}
                                </td>
                                {/* Uplift% */}
                                <td className="px-3 py-2.5">
                                  <input type="number" min={0} step={5} value={row.epic.pertUplift ?? 0} disabled={isOffline}
                                    onChange={e => updateEpic(row.epic.id, { pertUplift: parseFloat(e.target.value) || 0 })}
                                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{row.hasPert ? row.te.toFixed(1) : '—'}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{row.hasPert ? row.sigma.toFixed(2) : '—'}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{row.hasPert ? row.dauerKW.toFixed(2) : '—'}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{row.hasPert ? row.dauer95KW.toFixed(2) : '—'}</td>
                                {hasRates && <td className="px-3 py-2.5 text-right text-slate-700">{row.hasPert ? `${currency} ${Math.round(row.kostenTE).toLocaleString('de-CH')}` : '—'}</td>}
                                {hasRates && <td className="px-3 py-2.5 text-right text-slate-700">{row.hasPert ? `${currency} ${Math.round(row.kosten95).toLocaleString('de-CH')}` : '—'}</td>}
                                {hasRates && <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{row.hasPert ? `${currency} ${Math.round(row.budgetUplift).toLocaleString('de-CH')}` : '—'}</td>}
                                <td className="px-3 py-2.5 text-center">
                                  {row.hasPert && <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${risikoStyle(row.risikoklasse)}`}>{row.risikoklasse}</span>}
                                </td>
                              </tr>

                              {/* ── Feature rows (when expanded) ── */}
                              {row.hasFeatures && isExpanded && (
                                <>
                                  {row.featureRows.map(fRow => (
                                    <tr key={fRow.feature.id} className="bg-slate-50 border-l-2 border-indigo-200">
                                      <td className="px-3 py-2 pl-10 sticky left-0 z-10 bg-slate-50">
                                        <div className="flex items-center gap-1">
                                          <input type="text" value={fRow.feature.name} placeholder="Feature-Name..." disabled={isOffline}
                                            onChange={e => updateFeature(fRow.feature.id, { name: e.target.value })}
                                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-800 text-sm" />
                                          <button onClick={() => deleteFeature(fRow.feature.id)} disabled={isOffline}
                                            className="p-1 text-slate-300 hover:text-rose-600 rounded flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" min={0} step={1} value={fRow.feature.pertOptimistic ?? ''} disabled={isOffline}
                                          onChange={e => updateFeature(fRow.feature.id, { pertOptimistic: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" min={0} step={1} value={fRow.feature.pertMostLikely ?? ''} disabled={isOffline}
                                          onChange={e => updateFeature(fRow.feature.id, { pertMostLikely: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" min={0} step={1} value={fRow.feature.pertPessimistic ?? ''} disabled={isOffline}
                                          onChange={e => updateFeature(fRow.feature.id, { pertPessimistic: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" min={0.1} step={0.1} value={fRow.feature.fte ?? 1} disabled={isOffline}
                                          onChange={e => updateFeature(fRow.feature.id, { fte: parseFloat(e.target.value) || 1 })}
                                          className="w-16 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" />
                                      </td>
                                      {/* Rolle dropdown */}
                                      <td className="px-3 py-2">
                                        <select value={fRow.feature.roleId || ''} disabled={isOffline}
                                          onChange={e => updateFeature(fRow.feature.id, { roleId: e.target.value || null })}
                                          className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-xs">
                                          <option value="">Default</option>
                                          {projectRates.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-700">{fRow.hasPert ? fRow.te.toFixed(1) : '—'}</td>
                                      <td className="px-3 py-2 text-right text-slate-700">{fRow.hasPert ? fRow.sigma.toFixed(2) : '—'}</td>
                                      <td className="px-3 py-2 text-right text-slate-700">{fRow.hasPert ? fRow.dauerKW.toFixed(2) : '—'}</td>
                                      <td className="px-3 py-2 text-right text-slate-700">{fRow.hasPert ? fRow.dauer95KW.toFixed(2) : '—'}</td>
                                      {hasRates && <td className="px-3 py-2 text-right text-slate-700">{fRow.hasPert ? `${currency} ${Math.round(fRow.kostenTE).toLocaleString('de-CH')}` : '—'}</td>}
                                      {hasRates && <td className="px-3 py-2 text-right text-slate-700">{fRow.hasPert ? `${currency} ${Math.round(fRow.kosten95).toLocaleString('de-CH')}` : '—'}</td>}
                                      {hasRates && <td className="px-3 py-2 text-right text-slate-500">—</td>}
                                      <td className="px-3 py-2 text-center">
                                        {fRow.hasPert && <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${risikoStyle(fRow.risikoklasse)}`}>{fRow.risikoklasse}</span>}
                                      </td>
                                    </tr>
                                  ))}
                                  {/* Add feature row */}
                                  <tr className="bg-slate-50 border-l-2 border-indigo-200">
                                    <td className="px-3 py-1.5 pl-10" colSpan={totalCols}>
                                      <button onClick={() => addFeature(row.epic.id)} disabled={isOffline}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50">
                                        <Plus className="w-3.5 h-3.5" />Feature hinzufügen
                                      </button>
                                    </td>
                                  </tr>
                                </>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      {pertData.computed.length > 0 && (
                        <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                          <tr className="font-semibold text-slate-900">
                            <td className="px-3 py-2.5 sticky left-0 z-10 bg-slate-50">Gesamt</td>
                            <td className="px-3 py-2.5" colSpan={5}></td>
                            <td className="px-3 py-2.5 text-right">{pertData.totals.te.toFixed(1)}</td>
                            <td className="px-3 py-2.5 text-right">{pertData.totals.sigma.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right">{pertData.totals.dauerKW.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right">{pertData.totals.dauer95KW.toFixed(2)}</td>
                            {hasRates && <td className="px-3 py-2.5 text-right">{currency} {Math.round(pertData.totals.kostenTE).toLocaleString('de-CH')}</td>}
                            {hasRates && <td className="px-3 py-2.5 text-right">{currency} {Math.round(pertData.totals.kosten95).toLocaleString('de-CH')}</td>}
                            {hasRates && <td className="px-3 py-2.5 text-right font-bold">{currency} {Math.round(pertData.totals.budgetUplift).toLocaleString('de-CH')}</td>}
                            <td className="px-3 py-2.5"></td>
                            <td className="px-3 py-2.5"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Section 2: Rollenverteilung (collapsible) */}
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl">
                  <button onClick={() => setShowRoles(!showRoles)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left">
                    <h3 className="text-lg font-semibold">Rollenverteilung</h3>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showRoles ? 'rotate-180' : ''}`} />
                  </button>
                  {showRoles && (
                    <div className="px-6 pb-6 space-y-4">
                      <div className="grid grid-cols-5 gap-4">
                        {['dev', 'ux', 'arch', 'qa', 'pm'].map(role => (
                          <div key={role}>
                            <label className="block text-sm font-medium text-slate-600 mb-1">{role.toUpperCase()} %</label>
                            <input type="number" min={0} max={100} step={1} disabled={isOffline}
                              value={pertRoles[role] ?? 0}
                              onChange={e => {
                                const updated = { ...pertRoles, [role]: parseFloat(e.target.value) || 0 };
                                updateProjectSettings({ pertRoles: updated });
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                          </div>
                        ))}
                      </div>
                      {(() => {
                        const sum = Object.values(pertRoles).reduce((s, v) => s + (v || 0), 0);
                        return <p className={`text-sm font-medium ${sum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>Summe: {sum}%</p>;
                      })()}
                      <div className="flex items-center gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-600 mb-1">Stunden/Woche</label>
                          <input type="number" min={1} max={60} step={1} disabled={isOffline}
                            value={hoursPerWeek}
                            onChange={e => updateProjectSettings({ hoursPerWeek: parseFloat(e.target.value) || 42 })}
                            className="w-24 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3: Stundenverteilung nach Rolle */}
                {pertData.computed.length > 0 && (
                  <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4">Stundenverteilung nach Rolle</h3>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600">Epic</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">Dev H</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">UX H</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">Arch H</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">QA H</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">PM H</th>
                          <th className="px-4 py-2.5 text-right font-medium text-slate-600">Total H</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {pertData.computed.map(row => (
                          <tr key={row.epic.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-900">{row.epic.summary}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{row.devH.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{row.uxH.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{row.archH.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{row.qaH.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-700">{row.pmH.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{row.te.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                        <tr className="font-semibold text-slate-900">
                          <td className="px-4 py-2.5">Gesamt</td>
                          <td className="px-4 py-2.5 text-right">{pertData.totals.devH.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right">{pertData.totals.uxH.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right">{pertData.totals.archH.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right">{pertData.totals.qaH.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right">{pertData.totals.pmH.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right font-bold">{pertData.totals.te.toFixed(1)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ====== EVM KENNZAHLEN TAB ====== */}
            {activeTab === 'metrics' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard title={activeBaseline ? 'BAC (Aktuell)' : 'BAC (Baseline)'} value={hasRates ? formatCurrency(evmMetrics.bac, currency) : `${evmMetrics.bac}h`} subtitle={activeBaseline ? `Original: ${hasRates ? formatCurrency(evmMetrics.originalBac, currency) : `${evmMetrics.originalBac}h`}` : hasRates ? `${evmMetrics.bacH}h` : 'Budget at Completion'} icon={Database} trend="neutral" source="sheets" />
                  <MetricCard title="PV (Planned)" value={hasRates ? formatCurrency(evmMetrics.pv, currency) : `${evmMetrics.pv.toFixed(1)}h`} subtitle={hasRates ? `${evmMetrics.pvH.toFixed(1)}h • ${pvMethod === 'milestones' ? 'Meilensteine' : 'Zeitbasiert'}` : `${pvMethod === 'milestones' ? 'Meilensteine' : 'Zeitbasiert'}`} icon={Target} trend="neutral" source="sheets" />
                  <MetricCard title="EV (Earned)" value={hasRates ? formatCurrency(evmMetrics.ev, currency) : `${evmMetrics.ev.toFixed(1)}h`} subtitle={hasRates ? `${evmMetrics.evH.toFixed(1)}h • 50/50` : '50/50-Methode'} icon={CheckCircle} trend={evmMetrics.ev >= evmMetrics.pv ? 'up' : 'down'} source="hybrid" />
                  <MetricCard title="AC (Actual)" value={hasRates ? formatCurrency(evmMetrics.ac, currency) : `${evmMetrics.ac}h`} subtitle={hasRates ? `${evmMetrics.acH}h` : 'Time Spent'} icon={Clock} trend={evmMetrics.ac <= evmMetrics.ev ? 'up' : 'down'} source="jira" />
                  <MetricCard title="SPI" value={evmMetrics.spi.toFixed(2)} subtitle="Schedule Performance" icon={Activity} trend={evmMetrics.spi >= 1 ? 'up' : evmMetrics.spi >= 0.9 ? 'neutral' : 'down'} trendValue={evmMetrics.spi >= 1 ? 'Voraus' : 'Verzug'} />
                  <MetricCard title="CPI" value={evmMetrics.cpi.toFixed(2)} subtitle="Cost Performance" icon={DollarSign} trend={evmMetrics.cpi >= 1 ? 'up' : evmMetrics.cpi >= 0.9 ? 'neutral' : 'down'} trendValue={evmMetrics.cpi >= 1 ? 'Unter Budget' : 'Über Budget'} />
                  <MetricCard title="Fortschritt" value={`${(evmMetrics.progress * 100).toFixed(1)}%`} subtitle={`${statusCounts.done}/${statusCounts.total} Done`} icon={Target} trend={evmMetrics.progress >= 0.5 ? 'up' : 'down'} />
                  <MetricCard title="TCPI" value={evmMetrics.tcpi.toFixed(2)} subtitle="To Complete Performance" icon={Target} trend={evmMetrics.tcpi <= 1 ? 'up' : 'down'} trendValue={evmMetrics.tcpi <= 1 ? 'Erreichbar' : 'Kritisch'} />
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">S-Kurve</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={sCurveData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dateLabel" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={12} tickFormatter={v => hasRates ? formatCurrency(v, currency) : `${Math.round(v)}h`} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel} formatter={(v, name) => [hasRates ? formatCurrency(v, currency) : `${v?.toFixed(1)}h`, name]} />
                      <Legend />
                      <ReferenceLine y={evmMetrics.bac} stroke="#8b5cf6" strokeDasharray="5 5" label={{ value: `BAC: ${hasRates ? formatCurrency(evmMetrics.bac, currency) : evmMetrics.bac + 'h'}`, fill: '#8b5cf6', fontSize: 12 }} />
                      {evmMetrics.originalBac && evmMetrics.originalBac !== evmMetrics.bac && (
                        <ReferenceLine y={evmMetrics.originalBac} stroke="#f59e0b" strokeDasharray="8 4" label={{ value: `Baseline: ${hasRates ? formatCurrency(evmMetrics.originalBac, currency) : evmMetrics.originalBac + 'h'}`, fill: '#f59e0b', fontSize: 11 }} />
                      )}
                      {/* Today vertical line */}
                      {sCurveData.length > 0 && (() => {
                        const todayMs = timelineProjection.today.getTime();
                        const closest = sCurveData.reduce((c, p) => Math.abs(p.date - todayMs) < Math.abs(c.date - todayMs) ? p : c);
                        return <ReferenceLine x={closest.dateLabel} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Heute', fill: '#94a3b8', fontSize: 11, position: 'top' }} />;
                      })()}
                      {/* Planned end vertical line */}
                      {timelineProjection.plannedEnd && sCurveData.length > 0 && (() => {
                        const endMs = timelineProjection.plannedEnd.getTime();
                        const closest = sCurveData.reduce((c, p) => Math.abs(p.date - endMs) < Math.abs(c.date - endMs) ? p : c);
                        return <ReferenceLine x={closest.dateLabel} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Geplant', fill: '#f59e0b', fontSize: 11, position: 'top' }} />;
                      })()}
                      <Area type="monotone" dataKey="pvTime" name="PV (Zeitbasiert)" fill="#3b82f620" stroke="#3b82f6" strokeWidth={2} />
                      {milestones.length > 0 && <Line type="monotone" dataKey="pvMilestone" name="PV (Meilensteine)" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} />}
                      <Line type="monotone" dataKey="ev" name="EV (Earned)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
                      <Line type="monotone" dataKey="evProjection" name="EV (Prognose)" stroke="#10b981" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
                      <Line type="monotone" dataKey="ac" name="AC (Actual)" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[
                    { title: 'Varianzen', icon: Activity, items: [
                      { label: 'SV', value: hasRates ? formatCurrency(evmMetrics.sv, currency) : `${evmMetrics.sv.toFixed(1)}h`, desc: 'Schedule Variance', good: evmMetrics.sv >= 0, trend: evmMetrics.sv >= 0 ? 'Voraus' : 'Verzug' },
                      { label: 'CV', value: hasRates ? formatCurrency(evmMetrics.cv, currency) : `${evmMetrics.cv.toFixed(1)}h`, desc: 'Cost Variance', good: evmMetrics.cv >= 0, trend: evmMetrics.cv >= 0 ? 'Unter Budget' : 'Über Budget' },
                    ]},
                    { title: 'Prognosen', icon: TrendingUp, items: [
                      { label: 'EAC', value: hasRates ? formatCurrency(evmMetrics.eac, currency) : `${evmMetrics.eac.toFixed(1)}h`, desc: 'Estimate at Completion', good: evmMetrics.eac <= evmMetrics.bac, trend: `VAC: ${hasRates ? formatCurrency(evmMetrics.vac, currency) : evmMetrics.vac.toFixed(1) + 'h'}` },
                      { label: 'ETC', value: hasRates ? formatCurrency(evmMetrics.etc, currency) : `${evmMetrics.etc.toFixed(1)}h`, desc: 'Estimate to Complete' },
                      { label: 'VAC', value: hasRates ? formatCurrency(evmMetrics.vac, currency) : `${evmMetrics.vac.toFixed(1)}h`, desc: 'Variance at Completion', good: evmMetrics.vac >= 0, trend: evmMetrics.vac >= 0 ? 'Unter Budget' : 'Über Budget' },
                    ]},
                  ].map(section => (
                    <div key={section.title} className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="p-2 rounded-lg bg-slate-100"><section.icon className="w-5 h-5 text-slate-500" /></span>{section.title}</h3>
                      <div className="space-y-3">
                        {section.items.map(item => (
                          <div key={item.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div>
                              <p className="font-medium text-slate-900">{item.label}</p>
                              {item.desc && <p className="text-xs text-slate-500">{item.desc}</p>}
                            </div>
                            <div className="text-right">
                              <span className="text-xl font-bold text-slate-900">{item.value}</span>
                              {item.trend && <p className={`text-xs mt-0.5 ${item.good ? 'text-emerald-600' : 'text-rose-600'}`}>{item.good ? '↗' : '↘'} {item.trend}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="p-2 rounded-lg bg-slate-100"><Target className="w-5 h-5 text-slate-500" /></span>Performance Indizes</h3>
                  <div className="flex justify-around items-center">
                    <PerformanceGauge value={evmMetrics.spi} label="SPI" />
                    <PerformanceGauge value={evmMetrics.cpi} label="CPI" />
                    <PerformanceGauge value={evmMetrics.tcpi} label="TCPI" />
                  </div>
                </div>
              </div>
            )}

            {/* ====== KOSTENSÄTZE TAB ====== */}
            {activeTab === 'rates' && (
              <div className="space-y-6">
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-600" />Rollen & Sätze</h3>
                      <p className="text-sm text-slate-500 mt-1">{currentProject?.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-slate-500">Währung</label>
                      <input type="text" value={currency} onChange={(e) => updateProjectSettings({ currency: e.target.value })} disabled={isOffline}
                        className="w-20 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                    </div>
                  </div>

                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Rolle</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Rate/{currency}/h</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Default</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Epics</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {projectRates.map(rate => {
                        const assignedCount = epics.filter(i => i.rateId === rate.id).length;
                        const defaultCount = rate.id === defaultRateId ? epics.filter(i => !i.rateId).length : 0;
                        return (
                          <tr key={rate.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3"><input type="text" value={rate.name} onChange={(e) => updateRate(rate.id, { name: e.target.value })} disabled={isOffline} className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-sm w-full" /></td>
                            <td className="px-4 py-3 text-right"><input type="number" value={rate.rate} onChange={(e) => updateRate(rate.id, { rate: parseFloat(e.target.value) || 0 })} disabled={isOffline} className="w-24 px-2 py-1 bg-white border border-slate-300 rounded text-slate-900 text-right text-sm" /></td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => setDefaultRate(rate.id)} disabled={isOffline} className={`w-5 h-5 rounded-full border-2 ${rate.id === defaultRateId ? 'border-purple-600 bg-purple-600' : 'border-slate-300 hover:border-purple-400'}`}>
                                {rate.id === defaultRateId && <span className="block w-2 h-2 bg-white rounded-full mx-auto"></span>}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-slate-500">{assignedCount + defaultCount}</td>
                            <td className="px-4 py-3 text-center">{rate.id !== defaultRateId && <button onClick={() => deleteRate(rate.id)} disabled={isOffline} className="p-1 text-slate-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button onClick={() => addRate('Neue Rate', 0)} disabled={isOffline} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"><Plus className="w-4 h-4" />Neue Rate hinzufügen</button>
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <h4 className="font-semibold mb-3">Zusammenfassung</h4>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>{epics.filter(i => !i.rateId).length} Epics nutzen Default-Rate ({projectRates.find(r => r.id === defaultRateId)?.name || '—'}: {projectRates.find(r => r.id === defaultRateId)?.rate || 0} {currency}/h)</p>
                    <p>{epics.filter(i => i.rateId).length} Epics haben eine individuelle Rate</p>
                    {hasRates && <p className="font-medium text-slate-900 mt-2">Gewichteter Durchschnitt: {evmMetrics.avgRate.toFixed(0)} {currency}/h</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ====== EINSTELLUNGEN TAB ====== */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-6"><Settings className="w-5 h-5 text-slate-600" />Einstellungen</h3>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium text-slate-900 mb-3">Projekt</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">Projektname</label>
                          <input type="text" value={currentProject?.name || ''} onChange={(e) => updateCurrentProject({ name: e.target.value })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">Startdatum</label>
                          <input type="date" value={projectSettings.startDate || ''} onChange={(e) => updateProjectSettings({ startDate: e.target.value })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">Enddatum</label>
                          <input type="date" value={projectSettings.endDate || ''} onChange={(e) => updateProjectSettings({ endDate: e.target.value })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-slate-900 mb-3">Planned Value Methode</h4>
                      <div className="flex gap-4">
                        {[
                          { value: 'time-based', label: 'Zeitbasiert (automatisch)', desc: 'PV wird linear über die Epic-Dauer (Start- bis Enddatum) verteilt. Einfacher, aber weniger genau.' },
                          { value: 'milestones', label: 'Manuell (PM setzt PV% pro Epic)', desc: 'Der PM definiert pro Stichtag, wie weit jedes Epic planmässig fertig sein sollte. Empfohlen bei ungleichmässigem Fortschritt.' },
                        ].map(opt => (
                          <button key={opt.value} onClick={() => updateProjectSettings({ pvMethod: opt.value })} disabled={isOffline}
                            className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${pvMethod === opt.value ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}>
                            <p className="font-medium text-slate-900">{opt.label}</p>
                            <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-slate-900 mb-3">Stichtag (Reporting Date)</h4>
                      <input type="date" value={reportingDate} onChange={(e) => updateProjectSettings({ reportingDate: e.target.value })} disabled={isOffline}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                      <p className="text-xs text-slate-500 mt-1">Datum für PV-Berechnung. Default: heute.</p>
                    </div>

                    {/* Stage Gate (ANF-4) */}
                    <div>
                      <h4 className="font-medium text-slate-900 mb-3">Stage Gate</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <label className="text-sm text-slate-500 block mb-1">Stage Gate Kriterium</label>
                          <input type="text" value={projectSettings.stageGateCriterion || ''} placeholder="z.B. Akzeptanzrate KS-Team > 70%"
                            onChange={(e) => updateProjectSettings({ stageGateCriterion: e.target.value })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                          <p className="text-xs text-slate-500 mt-1">Messbares Kriterium für den Stage Gate Entscheid.</p>
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">Status</label>
                          <select value={projectSettings.stageGateStatus || 'open'}
                            onChange={(e) => updateProjectSettings({ stageGateStatus: e.target.value })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900">
                            <option value="open">Offen</option>
                            <option value="achieved">Erreicht</option>
                            <option value="missed">Nicht erreicht</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-sm text-slate-500 block mb-1">Stage Gate Datum (optional, sonst Projekt-Enddatum)</label>
                        <input type="date" value={projectSettings.stageGateDate || ''} onChange={(e) => updateProjectSettings({ stageGateDate: e.target.value })} disabled={isOffline}
                          className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-slate-900 mb-3">Verbindung</h4>
                      <div className="flex items-center gap-3">
                        {isOffline ? (
                          <span className="flex items-center gap-2 text-amber-600"><WifiOff className="w-4 h-4" /> Offline</span>
                        ) : (
                          <span className="flex items-center gap-2 text-emerald-600"><Wifi className="w-4 h-4" /> Supabase verbunden</span>
                        )}
                      </div>
                    </div>

                    {baselines.length > 0 && (
                      <div className="border-t border-slate-200 pt-4">
                        <h4 className="font-medium text-slate-900 mb-3">Baseline-Historie</h4>
                        <div className="space-y-3">
                          {[...baselines].reverse().map(bl => (
                            <div key={bl.id} className={`p-3 rounded-lg border ${bl.isActive ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-700">{formatDate(bl.date)}</span>
                                {bl.isActive && <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">Aktiv</span>}
                              </div>
                              <p className="text-sm text-slate-500 mt-1">
                                {bl.epicCount} Epics / BAC: {bl.bacH}h{bl.bacVal > 0 ? ` / ${formatCurrency(bl.bacVal, currency)}` : ''}
                              </p>
                              {bl.notes && <p className="text-sm text-slate-400 mt-1 italic">"{bl.notes}"</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-medium text-slate-900 mb-3">Jira Integration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">Jira Domain</label>
                          <input type="text" placeholder="firma.atlassian.net" value={currentProject?.jiraConfig?.domain || ''}
                            onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, domain: e.target.value } })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">E-Mail</label>
                          <input type="email" placeholder="user@firma.ch" value={currentProject?.jiraConfig?.email || ''}
                            onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, email: e.target.value } })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">API Token</label>
                          <input type="password" placeholder="••••••••" value={currentProject?.jiraConfig?.apiToken || ''}
                            onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, apiToken: e.target.value } })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 block mb-1">Initiative Key</label>
                          <input type="text" placeholder="PROJ-123" value={currentProject?.jiraConfig?.initiativeKey || ''}
                            onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, initiativeKey: e.target.value } })} disabled={isOffline}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
                        </div>
                      </div>

                      <details className="mb-4">
                        <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">Erweiterte Felder</summary>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                          <div>
                            <label className="text-sm text-slate-500 block mb-1">Link Type Name</label>
                            <input type="text" value={currentProject?.jiraConfig?.linkTypeName || 'is part of'}
                              onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, linkTypeName: e.target.value } })} disabled={isOffline}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                          </div>
                          <div>
                            <label className="text-sm text-slate-500 block mb-1">Start Date Field</label>
                            <input type="text" value={currentProject?.jiraConfig?.startDateField || 'customfield_10015'}
                              onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, startDateField: e.target.value } })} disabled={isOffline}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                          </div>
                          <div>
                            <label className="text-sm text-slate-500 block mb-1">End Date Field</label>
                            <input type="text" value={currentProject?.jiraConfig?.endDateField || 'duedate'}
                              onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, endDateField: e.target.value } })} disabled={isOffline}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                          </div>
                          <div>
                            <label className="text-sm text-slate-500 block mb-1">MoSCoW-Feld (optional)</label>
                            <input type="text" value={currentProject?.jiraConfig?.moscowField || ''} placeholder="z.B. customfield_10100 oder priority"
                              onChange={(e) => updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, moscowField: e.target.value } })} disabled={isOffline}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm" />
                          </div>
                        </div>
                      </details>

                      <div className="mb-4">
                        <label className="text-sm text-slate-500 block mb-2">Status Mapping (Jira → App)</label>
                        <div className="space-y-2">
                          {Object.entries(currentProject?.jiraConfig?.statusMapping || {}).map(([jiraStatus, appStatus]) => (
                            <div key={jiraStatus} className="flex items-center gap-2">
                              <input type="text" value={jiraStatus} readOnly className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700" />
                              <span className="text-slate-400">→</span>
                              <select value={appStatus} onChange={(e) => {
                                const newMapping = { ...currentProject?.jiraConfig?.statusMapping, [jiraStatus]: e.target.value };
                                updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, statusMapping: newMapping } });
                              }} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white">
                                <option value="To Do">To Do</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Done">Done</option>
                              </select>
                              <button onClick={() => {
                                const newMapping = { ...currentProject?.jiraConfig?.statusMapping };
                                delete newMapping[jiraStatus];
                                updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, statusMapping: newMapping } });
                              }} className="text-slate-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
                            </div>
                          ))}
                          <button onClick={() => {
                            const name = prompt('Jira Status Name (z.B. "In Review", "Blocked"):');
                            if (name) {
                              const newMapping = { ...currentProject?.jiraConfig?.statusMapping, [name]: 'To Do' };
                              updateCurrentProject({ jiraConfig: { ...currentProject?.jiraConfig, statusMapping: newMapping } });
                            }
                          }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                            <Plus className="w-3 h-3" />Mapping hinzufügen
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <button onClick={jiraSync} disabled={isOffline || jiraSyncing || !currentProject?.jiraConfig?.domain}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50">
                          <RefreshCw className={`w-4 h-4 ${jiraSyncing ? 'animate-spin' : ''}`} />
                          {jiraSyncing ? 'Synchronisiere...' : 'Jira Sync'}
                        </button>
                        {currentProject?.lastJiraSync && (
                          <span className="text-sm text-slate-500">Letzter Sync: {new Date(currentProject.lastJiraSync).toLocaleString('de-CH')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ====== EVM GLOSSAR ====== */}
            {activeTab === 'help' && (
              <div className="space-y-6">
                <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-2"><HelpCircle className="w-5 h-5 text-blue-600" />EVM Glossar</h3>
                  <p className="text-sm text-slate-500 mb-6">Alle wichtigen Earned Value Management Begriffe auf einen Blick.</p>

                  {[
                    { title: 'Grundwerte', items: [
                      { term: 'BAC', full: 'Budget at Completion', desc: 'Das Gesamtbudget des Projekts — die Summe aller geplanten Aufwände (in Stunden oder Kosten). Dient als Referenzwert für alle weiteren EVM-Berechnungen.' },
                      { term: 'PV', full: 'Planned Value', desc: 'Der geplante Wert der Arbeit, die bis zu einem bestimmten Zeitpunkt erledigt sein sollte. Wird zeitbasiert (linear) oder über Meilensteine berechnet.' },
                      { term: 'EV', full: 'Earned Value', desc: 'Der Wert der tatsächlich geleisteten Arbeit, gemessen am Fertigstellungsgrad. Berechnung via 50/50-Methode: To Do = 0%, In Progress = 50%, Done = 100%.' },
                      { term: 'AC', full: 'Actual Cost', desc: 'Die tatsächlich angefallenen Kosten bzw. der tatsächliche Zeitaufwand (Time Spent) bis zum aktuellen Zeitpunkt.' },
                    ]},
                    { title: 'Varianzen', items: [
                      { term: 'SV', full: 'Schedule Variance', desc: 'Terminabweichung: EV − PV. Positiv = Vorsprung, negativ = Verzug. Zeigt, ob mehr oder weniger Arbeit erledigt wurde als geplant.' },
                      { term: 'CV', full: 'Cost Variance', desc: 'Kostenabweichung: EV − AC. Positiv = unter Budget, negativ = über Budget. Zeigt, ob die geleistete Arbeit mehr oder weniger gekostet hat als sie wert ist.' },
                      { term: 'VAC', full: 'Variance at Completion', desc: 'Prognostizierte Abweichung am Projektende: BAC − EAC. Positiv = voraussichtlich unter Budget, negativ = über Budget.' },
                    ]},
                    { title: 'Performance-Indizes', items: [
                      { term: 'SPI', full: 'Schedule Performance Index', desc: 'Termineffizienz: EV / PV. Wert > 1 = schneller als geplant, < 1 = langsamer. Ein SPI von 0.8 bedeutet: nur 80% der geplanten Arbeit wurde geschafft. Die SPI-Prognose auf dem Dashboard berechnet das projizierte Enddatum als: Startdatum + (geplante Dauer ÷ SPI).' },
                      { term: 'CPI', full: 'Cost Performance Index', desc: 'Kosteneffizienz: EV / AC. Wert > 1 = günstiger als geplant, < 1 = teurer. Ein CPI von 1.2 bedeutet: für jeden investierten Franken wurde 1.20 CHF an Wert erzielt. Die CPI-Prognose auf dem Dashboard zeigt die prognostizierten Gesamtkosten (EAC = BAC ÷ CPI) mit farbcodierter Budgetabweichung.' },
                      { term: 'TCPI', full: 'To Complete Performance Index', desc: 'Erforderliche Effizienz für den Rest: (BAC − EV) / (BAC − AC). Zeigt, wie effizient das restliche Budget eingesetzt werden muss, um im Plan zu bleiben. Wert > 1 = schwieriger.' },
                    ]},
                    { title: 'Prognosen', items: [
                      { term: 'EAC', full: 'Estimate at Completion', desc: 'Prognostizierte Gesamtkosten: BAC / CPI. Schätzt auf Basis der bisherigen Kosteneffizienz, was das Projekt am Ende tatsächlich kosten wird.' },
                      { term: 'ETC', full: 'Estimate to Complete', desc: 'Verbleibender Aufwand: EAC − AC. Zeigt, wie viel Budget oder Zeit noch benötigt wird, um das Projekt abzuschliessen.' },
                      { term: 'Zeitprognose', full: 'Projiziertes Enddatum & Budget', desc: 'Vier Karten: Geplantes Ende zeigt das Zieldatum. SPI-Prognose berechnet das Enddatum als geplante Dauer ÷ SPI. CPI-Prognose zeigt die prognostizierten Gesamtkosten (EAC) mit Budgetabweichung. FTE-Prognose nutzt den Restaufwand (BAC−EV) geteilt durch Kapazität (Stunden/Woche × aktive FTEs bei 5-Tage-Woche).' },
                    ]},
                    { title: 'S-Kurve', items: [
                      { term: 'S-Kurve', full: 'Kumulative Projektion', desc: 'Grafische Darstellung von PV, EV und AC über die Zeit. Der typische S-förmige Verlauf entsteht durch langsamen Start, steilen Anstieg in der Mitte und Abflachung am Ende.' },
                      { term: 'PV-Linie', full: 'Planned Value Kurve', desc: 'Zeigt den geplanten kumulativen Wert über die gesamte Projektdauer. Kann zeitbasiert (linear) oder meilensteinbasiert berechnet werden.' },
                      { term: 'EV-Linie', full: 'Earned Value Kurve', desc: 'Zeigt den kumulativ erarbeiteten Wert bis heute. Basiert auf dem 50/50-Status der Epics an jedem Zeitpunkt.' },
                      { term: 'AC-Linie', full: 'Actual Cost Kurve', desc: 'Zeigt die kumulativen tatsächlichen Kosten bis heute. Der Zeitaufwand (Time Spent) wird linear über die Epic-Dauer verteilt.' },
                      { term: 'EV-Prognose', full: 'Earned Value Projektion', desc: 'Gestrichelte grüne Linie ab heute. Projiziert den EV-Verlauf in die Zukunft basierend auf der bisherigen Velocity (EV pro Kalendertag seit Projektstart). Zeigt, wann BAC bei gleichbleibendem Tempo erreicht wird.' },
                      { term: 'Heute-Linie', full: 'Vertikale Referenz', desc: 'Grau gestrichelte vertikale Linie, die den aktuellen Tag markiert. Alles links davon ist historisch, alles rechts ist Prognose.' },
                      { term: 'Geplant-Linie', full: 'Geplantes Projektende', desc: 'Orange gestrichelte vertikale Linie am geplanten Enddatum (aus Projekteinstellungen). Dient als visueller Vergleich mit der EV-Prognose.' },
                    ]},
                    { title: 'PERT-Schätzung', items: [
                      { term: 'PERT', full: 'Program Evaluation and Review Technique', desc: 'Schätzmethode mit drei Werten: optimistisch (O), wahrscheinlich (M) und pessimistisch (P). Daraus wird ein gewichteter Erwartungswert berechnet.' },
                      { term: 'TE', full: 'PERT Expected Value', desc: 'Erwartungswert: (O + 4×M + P) / 6. Gewichtet den wahrscheinlichsten Wert am stärksten.' },
                      { term: 'SD', full: 'Standardabweichung', desc: 'Streuung der Schätzung: (P − O) / 6. Je grösser die Differenz zwischen optimistisch und pessimistisch, desto unsicherer die Schätzung.' },
                      { term: 'TE₉₅', full: '95%-Konfidenzwert', desc: 'Schätzung mit 95% Sicherheit: TE + 1.645 × SD. Wird als Aufwandsbasis für EVM-Berechnungen verwendet, wenn PERT-Werte vorhanden sind.' },
                      { term: 'FTE', full: 'Full Time Equivalent', desc: 'Anzahl Vollzeitstellen, die am Epic arbeiten. Wird zur Berechnung der Dauer aus dem Aufwand verwendet: Dauer = Aufwand / FTE.' },
                      { term: 'Uplift', full: 'Risikozuschlag', desc: 'Prozentualer Aufschlag auf die PERT-Schätzung für Risiken, Meetings oder Overhead. Wird auf den TE₉₅-Wert addiert.' },
                    ]},
                    { title: 'Features & Rollen', items: [
                      { term: 'Feature', full: 'Arbeitspaket innerhalb eines Epics', desc: 'Optionale Unterteilung eines Epics in einzelne Arbeitspakete. Jedes Feature bekommt eigene PERT-Werte (O/M/P) und eine Rolle (= Kostensatz). Der Epic zeigt dann das Total aller Feature-Aufwände.' },
                      { term: 'Rolle', full: 'Kostensatz / Ressourcentyp', desc: 'Jede Rolle (z.B. Dev, QA, Design) hat einen Stundensatz. Features werden einer Rolle zugeordnet, um rollenbasierte Kostenberechnungen zu ermöglichen. Rollen werden im Tab "Rollen & Sätze" verwaltet.' },
                      { term: 'Feature-TE₉₅', full: 'Aufwand auf Feature-Ebene', desc: 'Wenn ein Epic Features hat, wird die PERT-Schätzung pro Feature berechnet (TE₉₅ = TE + 2×σ). Die Summer aller Feature-TE₉₅ ergibt den effektiven Gesamtaufwand des Epics.' },
                    ]},
                    { title: 'Governance & Ampelsystem', items: [
                      { term: 'Ampel', full: 'SPI/CPI Schwellwerte', desc: 'Dreistufiges Ampelsystem für SPI und CPI: Grün (≥ 1.0) = On Track, Standard-Highlight-Report genügt. Gelb (0.9–1.0) = At Risk, Erwähnung im nächsten Highlight Report empfohlen. Rot (< 0.9) = Behind, sofortiger Exception Report an die GL erforderlich.' },
                      { term: 'Exception Report', full: 'Eskalationsbericht an GL', desc: 'Wird ausgelöst wenn SPI < 0.9 oder CPI < 0.9. Das Dashboard zeigt ein rotes Alert-Banner mit den verletzten Werten. Gemäss Governance-Rhythmus muss der PM sofort einen Exception Report an die Geschäftsleitung erstellen.' },
                      { term: 'Highlight Report', full: 'Regelmässiger Statusbericht', desc: 'Standardmässiger Projektstatusbericht im Governance-Rhythmus. Bei gelber Ampel (SPI/CPI zwischen 0.9 und 1.0) sollte die Abweichung im nächsten Highlight Report erwähnt werden.' },
                    ]},
                    { title: 'MoSCoW & Scope', items: [
                      { term: 'MoSCoW', full: 'Priorisierungsmethode', desc: 'Priorisierung aller Epics in vier Kategorien: MUST (unverzichtbar), SHOULD (wichtig), COULD (wünschenswert), WON\'T (nicht in diesem Release). Basis für das Fix-or-Flex-Prinzip.' },
                      { term: '60%-Regel', full: 'Must-Have Kapazitätslimit', desc: 'Must-Haves dürfen maximal 60% der Gesamtkapazität beanspruchen. Die restlichen 40% sind Flexibilität für SHOULD/COULD-Epics und Risikopuffer. Wird auf dem Dashboard und im Epics-Tab als MoSCoW Kapazitäts-Check angezeigt.' },
                      { term: 'Fix or Flex', full: 'Scope-Management-Prinzip', desc: 'MUST-Epics sind fix (nicht verhandelbar), SHOULD/COULD sind flex (können verschoben werden). Voraussetzung: die 60%-Regel wird eingehalten. Bei Verzögerungen werden zuerst COULD, dann SHOULD-Epics herausgenommen.' },
                    ]},
                    { title: 'Stage Gate', items: [
                      { term: 'Stage Gate', full: 'Phasen-Entscheidungspunkt', desc: 'Messbarer Meilenstein am Ende einer Projektphase. Drei Fragen werden geprüft: MVP geliefert? Business Case validiert? Was wurde gelernt? Das Kriterium wird in den Einstellungen definiert und auf dem Dashboard angezeigt.' },
                      { term: 'Kriterium', full: 'Stage Gate Messkriterium', desc: 'Ein konkretes, messbares Kriterium für den Stage Gate Entscheid, z.B. "Akzeptanzrate KS-Team > 70%" oder "MVP Feature-Completeness 100%". Wird in den Projekteinstellungen als Freitext hinterlegt.' },
                      { term: 'Status', full: 'Stage Gate Bewertung', desc: 'Drei mögliche Zustände: Offen (noch nicht geprüft), Erreicht (Kriterium erfüllt, Phase kann abgeschlossen werden), Nicht erreicht (Kriterium verfehlt, Massnahmen nötig).' },
                    ]},
                    { title: 'Kostenprognose', items: [
                      { term: 'BAC', full: 'Budget at Completion (Prognose)', desc: 'Im Prognose-Block auf dem Dashboard: das Gesamtbudget als Referenzwert. Identisch mit dem BAC-Grundwert, hier im Kontext der Budgetprognose dargestellt.' },
                      { term: 'EAC', full: 'Estimate at Completion (Prognose)', desc: 'Prognostizierte Gesamtkosten auf Basis des bisherigen CPI: BAC / CPI. Wird grün angezeigt wenn unter Budget (EAC < BAC), rot wenn über Budget.' },
                      { term: 'VAC', full: 'Variance at Completion (Prognose)', desc: 'Prognostizierte Budgetabweichung am Ende: BAC − EAC. Positiver Wert = unter Budget (grün), negativer Wert = über Budget (rot). Zeigt die CHF-Konsequenz der aktuellen Performance.' },
                      { term: 'ETC', full: 'Estimate to Complete (Prognose)', desc: 'Verbleibender Aufwand: EAC − AC. Beantwortet die Frage "Was brauchen wir noch?" in CHF oder Stunden.' },
                    ]},
                    { title: 'Baseline & Scope', items: [
                      { term: 'Baseline', full: 'Referenz-Snapshot', desc: 'Ein gespeicherter Zustand aller Epics zu einem bestimmten Zeitpunkt. Dient als Vergleichsbasis — neue Epics nach der Baseline werden als Scope-Änderung erkannt.' },
                      { term: 'Baseline Lock', full: 'Baseline-Sperre pro Epic', desc: 'Das Schloss-Symbol 🔒 auf jedem Epic steuert, ob dessen Baseline-Schätzung beim nächsten "Baseline setzen" überschrieben wird. Gesperrt (🔒): der baselineEstimate bleibt unverändert, auch wenn currentEstimate sich ändert. Entsperrt (🔓): beim nächsten Baseline-Snapshot wird der aktuelle Aufwand als neue Basis übernommen. Gesperrte Epics können nicht gelöscht werden. Typischer Einsatz: Ursprünglicher Scope wird gesperrt, neue Epics bleiben entsperrt — so ist im EVM immer klar, was ursprünglich geplant war und was nachträglich dazugekommen ist.' },
                      { term: 'Scope Change', full: 'Umfangsänderung', desc: 'Wenn nach einer Baseline neue Epics hinzukommen, ändert sich der Projektumfang. Das Dashboard zeigt die BAC-Differenz und bietet an, eine neue Baseline zu setzen.' },
                    ]},
                  ].map(section => (
                    <div key={section.title} className="mb-8 last:mb-0">
                      <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">{section.title}</h4>
                      <div className="space-y-3">
                        {section.items.map(item => (
                          <div key={item.term} className="flex gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                            <div className="flex-shrink-0 w-16">
                              <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-sm font-mono font-semibold rounded">{item.term}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700">{item.full}</p>
                              <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 text-center text-slate-400 text-sm">
          © Pascal Müller • EVM Dashboard
        </div>
      </footer>

      {showBaselineDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowBaselineDialog(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Baseline setzen</h3>
              <button onClick={() => setShowBaselineDialog(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Alle {epics.length} Epics werden gesperrt und als Baseline-Snapshot gespeichert. Neue Epics werden danach als Scope-Änderung erkannt.
            </p>
            {activeBaseline && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
                Bestehende Baseline vom {formatDate(activeBaseline.date)} wird deaktiviert.
              </div>
            )}
            <div className="mb-4">
              <label className="text-sm text-slate-600 block mb-1">Notiz (optional)</label>
              <input type="text" value={baselineNotes} onChange={e => setBaselineNotes(e.target.value)} placeholder="z.B. Initiale Baseline, Sprint 3 Re-Baseline..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBaselineDialog(false)} className="px-4 py-2 text-slate-600 hover:text-slate-900">Abbrechen</button>
              <button onClick={() => setBaseline(baselineNotes)} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center gap-2">
                <Lock className="w-4 h-4" />Baseline setzen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
