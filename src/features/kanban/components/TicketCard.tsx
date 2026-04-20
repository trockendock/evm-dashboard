import { AlertCircle, Box } from 'lucide-react';
import type { Ticket } from '../types';

interface TicketCardProps {
  ticket: Ticket;
  instanceHost: string;
}

export function TicketCard({ ticket, instanceHost }: TicketCardProps) {
  const epicColor = ticket.epic_color ?? '#6366f1';

  const isDuePast =
    ticket.due_date != null && new Date(ticket.due_date) < new Date();

  function handleClick() {
    window.open(`https://${instanceHost}/browse/${ticket.issue_key}`, '_blank');
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
      className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
    >
      {/* Top row: type icon + issue key + optional epic badge */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ticket.issue_type_icon_url ? (
          <img
            src={ticket.issue_type_icon_url}
            alt={ticket.issue_type ?? 'type'}
            width={16}
            height={16}
            className="flex-shrink-0"
          />
        ) : (
          <Box className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}

        <span className="text-xs font-mono text-slate-500">{ticket.issue_key}</span>

        {ticket.epic_key && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full truncate max-w-24 font-medium"
            style={{
              backgroundColor: epicColor + '20',
              color: epicColor,
            }}
            title={ticket.epic_name ?? ticket.epic_key}
          >
            {ticket.epic_name ?? ticket.epic_key}
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-800 font-medium mt-1.5 line-clamp-2">
        {ticket.summary ?? '(kein Titel)'}
      </p>

      {/* Bottom row: priority + status / due date + assignee */}
      <div className="flex justify-between items-center mt-2 gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {ticket.priority_icon_url ? (
            <img
              src={ticket.priority_icon_url}
              alt={ticket.priority ?? 'priority'}
              width={12}
              height={12}
              className="flex-shrink-0"
            />
          ) : (
            <AlertCircle className="w-3 h-3 text-slate-400 flex-shrink-0" />
          )}

          {ticket.status_name && (
            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate">
              {ticket.status_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {ticket.due_date && (
            <span
              className={`text-xs ${isDuePast ? 'text-red-600 font-medium' : 'text-slate-500'}`}
            >
              {new Date(ticket.due_date).toLocaleDateString('de-CH')}
            </span>
          )}

          {ticket.assignee_avatar_url ? (
            <img
              src={ticket.assignee_avatar_url}
              alt={ticket.assignee_name ?? 'assignee'}
              className="w-5 h-5 rounded-full"
            />
          ) : (
            <span className="w-5 h-5 rounded-full bg-slate-200 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
