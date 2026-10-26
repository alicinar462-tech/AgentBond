/**
 * AgentBond — application shell.
 *
 * Layout:
 *   Sticky header (Header.tsx)
 *   Page intro: heading + "Work Escrow" explanation + New Task CTA
 *   Two-column workspace (desktop): task list left, task detail right
 *   Single-column (mobile): list or detail, with back navigation
 *
 * When VITE_CONTRACT_ADDRESS is unset, a deployment notice replaces the workspace.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Plus, ArrowLeft, HardHat, ShieldCheck, Coins, Loader2, AlertTriangle, WifiOff } from 'lucide-react'
import { Header } from './components/Header'
import { TaskList } from './components/TaskList'
import { TaskDetail } from './components/TaskDetail'
import { CreateTaskSheet } from './components/CreateTaskSheet'
import { useEscrowTasks } from './hooks/useEscrowTasks'
import { useContractVerification } from './hooks/useContractVerification'
import { isContractDeployed, CONTRACT_ADDRESS, TARGET_CHAIN_ID } from './lib/escrow-contract'
import { truncateAddress } from './lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ExternalLink } from 'lucide-react'

// ── Deployment notice ────────────────────────────────────────────────────────

function DeploymentNotice() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <HardHat className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900">
          Contract not deployed
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          The AgentBondEscrow contract has not been deployed to {import.meta.env.VITE_CHAIN_LABEL ?? 'Arc Testnet'}. Set{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">VITE_CONTRACT_ADDRESS</code>{' '}
          in <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">.env</code>{' '}
          to enable all features.
        </p>
        <ol className="mt-5 space-y-2 text-sm text-slate-600">
          {[
            `Deploy AgentBondEscrow.sol to ${import.meta.env.VITE_CHAIN_LABEL ?? 'Arc Testnet'}`,
            'Pass 0x3600000000000000000000000000000000000000 as the constructor argument (USDC address)',
            'Add VITE_CONTRACT_ADDRESS=0x… to .env',
            'Restart the dev server',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 font-mono text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// ── Contract verification status banner ─────────────────────────────────────

function VerificationBanner({ status, message }: { status: string; message: string }) {
  if (status === 'verified') return null
  if (status === 'idle') return null   // DeploymentNotice handles the idle/missing case

  const configs = {
    checking: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
      bar:  'bg-blue-50 border-blue-200 text-blue-800',
    },
    'not-deployed': {
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      bar:  'bg-amber-50 border-amber-200 text-amber-800',
    },
    'rpc-error': {
      icon: <WifiOff className="h-4 w-4 text-rose-500" />,
      bar:  'bg-rose-50 border-rose-200 text-rose-800',
    },
  } as const

  const cfg = configs[status as keyof typeof configs]
  if (!cfg) return null

  return (
    <div className={`mb-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm ${cfg.bar}`}>
      {cfg.icon}
      <span>{message}</span>
    </div>
  )
}

// ── How It Works strip ───────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { icon: <Plus className="h-4 w-4" />, label: 'Create & Fund', desc: 'Employer creates a task and deposits USDC into escrow.' },
    { icon: <ShieldCheck className="h-4 w-4" />, label: 'Submit Work', desc: 'Provider completes the work and submits before the deadline.' },
    { icon: <Coins className="h-4 w-4" />, label: 'Approve & Pay', desc: 'Employer approves the submission to release USDC to the provider.' },
  ]
  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      {steps.map((s) => (
        <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            {s.icon}
          </div>
          <p className="text-sm font-semibold text-slate-800">{s.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.desc}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [selectedId,        setSelectedId]        = useState<bigint | null>(null)
  const [sheetOpen,         setSheetOpen]         = useState(false)
  const [mobileShowDetail,  setMobileShowDetail]  = useState(false)

  const { isConnected } = useAccount()

  // Runtime bytecode verification: checks that CONTRACT_ADDRESS has deployed
  // code on TARGET_CHAIN_ID before enabling any write actions.
  const { contractVerified, status: verifyStatus, statusMessage: verifyMessage } = useContractVerification()

  const { tasks, isLoading, isError, refetch: refetchRaw, totalKnown, showing } = useEscrowTasks(contractVerified)
  const refetch = () => { void refetchRaw() }

  const selectedTask = selectedId !== null
    ? (tasks.find(t => t.id === selectedId) ?? null)
    : null

  function handleSelect(id: bigint) {
    setSelectedId(id)
    setMobileShowDetail(true)
  }

  function handleBack() {
    setMobileShowDetail(false)
    setSelectedId(null)
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {/* Page intro */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Work Escrow
            </h1>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-slate-500">
              Create tasks, fund them with USDC, and release payment when work is approved.
              Built on Arc — where USDC is the native gas token.
            </p>
            {isContractDeployed && CONTRACT_ADDRESS && (
              <a
                href={buildAddressExplorerUrl(TARGET_CHAIN_ID, CONTRACT_ADDRESS)}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs text-slate-400 hover:text-slate-600"
              >
                Contract: {truncateAddress(CONTRACT_ADDRESS)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {isContractDeployed && (
            <button
              disabled={!isConnected}
              onClick={() => setSheetOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              title={!isConnected ? 'Connect your wallet to create a task' : undefined}
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          )}
        </div>

        {/* Deployment gate */}
        {!isContractDeployed ? (
          <DeploymentNotice />
        ) : (
          <>
            {/* Runtime verification status banner (checking / not-deployed / rpc-error) */}
            <VerificationBanner status={verifyStatus} message={verifyMessage} />

            {/* How it works — show only when no tasks loaded yet */}
            {contractVerified && !isLoading && tasks.length === 0 && <HowItWorks />}

            {/* Desktop: two-column */}
            <div className="hidden md:grid md:grid-cols-[380px_1fr] md:gap-5">
              <TaskList
                tasks={tasks}
                isLoading={isLoading || verifyStatus === 'checking'}
                isError={isError}
                refetch={refetch}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
                totalKnown={totalKnown}
                showing={showing}
              />
              <div>
                {selectedTask ? (
                  <TaskDetail task={selectedTask} contractVerified={contractVerified} />
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
                    <p className="text-sm text-slate-400">Select a task to view details</p>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile: list or detail */}
            <div className="md:hidden">
              {!mobileShowDetail ? (
                <TaskList
                  tasks={tasks}
                  isLoading={isLoading || verifyStatus === 'checking'}
                  isError={isError}
                  refetch={refetch}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  totalKnown={totalKnown}
                  showing={showing}
                />
              ) : (
                <div>
                  <button
                    onClick={handleBack}
                    className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to tasks
                  </button>
                  {selectedTask && <TaskDetail task={selectedTask} contractVerified={contractVerified} />}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <CreateTaskSheet open={sheetOpen} onClose={() => setSheetOpen(false)} contractVerified={contractVerified} />
    </div>
  )
}
