/**
 * TaskList — renders the left-panel task list, including loading/empty/error states.
 */
import { Loader2, RefreshCw, ClipboardList } from 'lucide-react'
import { useAccount } from 'wagmi'
import { TaskCard } from './TaskCard'
import { type Task, type WalletRole } from '@/lib/types'

interface TaskListProps {
  tasks:       Task[]
  isLoading:   boolean
  isError:     boolean
  refetch:     () => unknown
  selectedId:  bigint | null
  onSelect:    (id: bigint) => void
  totalKnown:  number
  showing:     number
}

function getRole(task: Task, address: string | undefined): WalletRole {
  if (!address) return 'none'
  const lc = address.toLowerCase()
  if (task.employer.toLowerCase() === lc) return 'employer'
  if (task.provider.toLowerCase() === lc) return 'provider'
  return 'none'
}

export function TaskList({
  tasks, isLoading, isError, refetch, selectedId, onSelect, totalKnown, showing,
}: TaskListProps) {
  const { address } = useAccount()

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">

      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight text-slate-900">
            Tasks
          </h2>
          {totalKnown > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">
              {showing} of {totalKnown}{totalKnown > showing ? ` — ${totalKnown - showing} older hidden` : ''}
            </p>
          )}
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 active:scale-95"
          aria-label="Refresh task list"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading tasks…</span>
          </div>
        )}

        {isError && !isLoading && (
          <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
            Failed to load tasks. Check your network connection.
          </div>
        )}

        {!isLoading && !isError && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
              <ClipboardList className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">No tasks yet</p>
              <p className="mt-0.5 text-xs text-slate-400">Create the first task using the button above.</p>
            </div>
          </div>
        )}

        {!isLoading && !isError && tasks.length > 0 && (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id.toString()}
                task={task}
                isSelected={selectedId === task.id}
                role={getRole(task, address)}
                onClick={() => onSelect(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
