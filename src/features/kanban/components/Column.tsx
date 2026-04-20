import type { StatusCategory, Ticket } from '../types';
import { TicketCard } from './TicketCard';

interface ColumnProps {
  category: StatusCategory;
  tickets: Ticket[];
  instanceHost: string;
}

const LABELS: Record<StatusCategory, string> = {
  todo: 'Zu erledigen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
};

const BG: Record<StatusCategory, string> = {
  todo: 'bg-slate-50',
  in_progress: 'bg-amber-50',
  done: 'bg-green-50',
};

const BADGE_COLOR: Record<StatusCategory, string> = {
  todo: 'bg-slate-200 text-slate-600',
  in_progress: 'bg-amber-200 text-amber-700',
  done: 'bg-green-200 text-green-700',
};

export function Column({ category, tickets, instanceHost }: ColumnProps) {
  return (
    <div className={`min-w-72 w-72 rounded-xl flex flex-col ${BG[category]}`}>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 rounded-t-xl border-b border-black/5 bg-inherit">
        <span className="text-xs font-semibold text-slate-700 flex-1">
          {LABELS[category]}
        </span>
        <span
          className={`inline-flex items-center justify-center text-xs font-medium rounded-full w-5 h-5 ${BADGE_COLOR[category]}`}
        >
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div className="overflow-y-auto max-h-[calc(100vh-280px)] flex flex-col gap-2 p-2">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} instanceHost={instanceHost} />
        ))}
        {tickets.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">Keine Tickets</p>
        )}
      </div>
    </div>
  );
}
