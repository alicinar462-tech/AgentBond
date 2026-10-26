/**
 * TaskCard — a single task row in the task list.
 */
import { Clock } from 'lucide-react'
import { type Task } from '@/lib/types'
import { formatUsdc, formatDeadline, STATE_LABELS, STATE_COLORS, isDeadlinePassed } from '@/lib/format'

interface TaskCardProps {
  task:       Task
  isSelected: boolean
  role:       'employer' | 'provider' | 'none'
  onClick:    () => void
}

export function TaskCard({ task, isSelected, role, onClick }: TaskCardProps) {
  const colors      = STATE_COLORS[task.state]
  const deadlineDue = isDeadlinePassed(task.deadline)

  return (
    <button
      onClick={onClick}
      className={[
        'w-full rounded-xl border p-4 text-left transition-all duration-150',
        'hover:shadow-md hover:-translate-y-px active:translate-y-0 active:shadow-sm',
        isSelected
          ? 'border-slate-800 bg-slate-900 shadow-md'
          : 'border-slate-200 bg-white shadow-sm hover:border-slate-300',
      ].join(' ')}
    >
      {/* Top row: task ID + role badge + state badge */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className={[
          'font-mono text-xs font-medium',
          isSelected ? 'text-slate-400' : 'text-slate-400',
        ].join(' ')}>
          #{task.id.toString()}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {role !== 'none' && (
            <span className={[
              'rounded-full px-2 py-0.5 text-xs font-medium',
              isSelected ? 'bg-white/15 text-slate-200' : 'bg-slate-100 text-slate-600',
            ].join(' ')}>
              {role === 'employer' ? 'Employer' : 'Provider'}
            </span>
          )}
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: colors.bg, color: colors.text }}
          >
            {STATE_LABELS[task.state]}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className={[
        'mb-3 line-clamp-2 text-sm font-medium leading-snug',
        isSelected ? 'text-slate-100' : 'text-slate-800',
      ].join(' ')}>
        {task.description || <span className="italic text-slate-400">(no description)</span>}
      </p>

      {/* Amount + deadline */}
      <div className="flex items-center justify-between gap-2">
        <span className={[
          'font-display text-lg font-bold tabular-nums tracking-tight',
          isSelected ? 'text-white' : 'text-slate-900',
        ].join(' ')}>
          {formatUsdc(task.amount)}
          <span className={[
            'ml-1 text-xs font-normal',
            isSelected ? 'text-slate-400' : 'text-slate-400',
          ].join(' ')}>USDC</span>
        </span>
        <span className={[
          'flex items-center gap-1 text-xs',
          deadlineDue ? 'text-rose-600' : isSelected ? 'text-slate-400' : 'text-slate-500',
        ].join(' ')}>
          <Clock className="h-3 w-3 shrink-0" />
          {formatDeadline(task.deadline)}
        </span>
      </div>
    </button>
  )
}
