/**
 * TaskDetail — right-panel task detail with context-aware action area.
 *
 * Action rules (mirrors the contract exactly):
 *   employer + Created                          → Fund Task (approve → fund two-step)
 *   provider + Funded + before deadline         → Submit Work
 *   employer + Submitted                        → Approve Work
 *   employer + (Funded|Submitted) + past deadline → Request Refund
 *   Completed | Refunded                        → Terminal banner, no action
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Loader2, Clock, ExternalLink, CheckCircle2, AlertTriangle, DollarSign } from 'lucide-react'
import { useReadContract } from 'wagmi'
import { TaskState, type Task } from '@/lib/types'
import {
  formatUsdc, formatDeadline, isDeadlinePassed, isReviewWindowExpired,
  STATE_LABELS, STATE_COLORS, truncateAddress,
} from '@/lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CONTRACT_ADDRESS, TARGET_CHAIN_ID } from '@/lib/escrow-contract'
import { ESCROW_ABI } from '@/lib/escrow-abi'
import { TxStatus } from './TxStatus'
import { useFundTask, useSubmitWork, useApproveWork, useRequestRefund, useClaimPayment } from '@/hooks/useEscrowWrite'

interface TaskDetailProps { task: Task; contractVerified: boolean }

// ── Shared action button ────────────────────────────────────────────────────

interface ActionBtnProps {
  label: string
  onClick: () => void
  isPending: boolean
  isConfirming: boolean
  disabled?: boolean
  variant?: 'primary' | 'danger'
}

function ActionBtn({ label, onClick, isPending, isConfirming, disabled, variant = 'primary' }: ActionBtnProps) {
  const busy = isPending || isConfirming
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={[
        'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'danger'
          ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
          : 'bg-slate-900 hover:bg-slate-800 active:bg-slate-950',
      ].join(' ')}
    >
      {isPending && <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet…</>}
      {isConfirming && <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</>}
      {!busy && label}
    </button>
  )
}

// ── Info callout ────────────────────────────────────────────────────────────

function Callout({ variant, children }: { variant: 'info' | 'success' | 'danger' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info:    'bg-blue-50 text-blue-800 ring-blue-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    danger:  'bg-rose-50 text-rose-700 ring-rose-200',
    warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  }[variant]
  return (
    <div className={`rounded-lg px-3.5 py-3 text-xs ring-1 ${styles}`}>
      {children}
    </div>
  )
}

// ── Fund panel (approve + fund two-step) ───────────────────────────────────

function FundPanel({ task, contractVerified }: { task: Task; contractVerified: boolean }) {
  const {
    needsApproval, approve, fund,
    approveHash, fundHash,
    isApprovePending, isApproveConfirming, isApproveSuccess,
    isFundPending, isFundConfirming, isFundSuccess,
    approveError, fundError,
  } = useFundTask(contractVerified, task.id, task.amount)

  const showFundButton = !needsApproval || isApproveSuccess
  const isAnyBusy = isApprovePending || isApproveConfirming || isFundPending || isFundConfirming

  return (
    <div className="space-y-3 pt-4">
      {needsApproval && !isApproveSuccess && (
        <>
          <Callout variant="info">
            <strong>Step 1 of 2:</strong> Approve the escrow contract to spend{' '}
            <strong>{formatUsdc(task.amount)} USDC</strong> from your wallet.
          </Callout>
          <ActionBtn
            label={`Allow ${formatUsdc(task.amount)} USDC`}
            onClick={approve}
            isPending={isApprovePending}
            isConfirming={isApproveConfirming}
            disabled={isAnyBusy}
          />
          <TxStatus hash={approveHash} isConfirming={isApproveConfirming} isSuccess={isApproveSuccess} errorMessage={approveError} label="Approval" />
        </>
      )}

      {showFundButton && !isFundSuccess && (
        <>
          {isApproveSuccess && (
            <Callout variant="success">
              <strong>Step 2 of 2:</strong> Deposit{' '}
              <strong>{formatUsdc(task.amount)} USDC</strong> into escrow to activate the task.
            </Callout>
          )}
          <ActionBtn
            label={`Fund Task — ${formatUsdc(task.amount)} USDC`}
            onClick={fund}
            isPending={isFundPending}
            isConfirming={isFundConfirming}
            disabled={isAnyBusy}
          />
          <TxStatus hash={fundHash} isConfirming={isFundConfirming} isSuccess={isFundSuccess} errorMessage={fundError} label="Funding" />
        </>
      )}
    </div>
  )
}

// ── Simple single-action panel ─────────────────────────────────────────────

interface SimpleActionPanelProps {
  label:        string
  onAction:     (taskId: bigint) => void
  hash:         `0x${string}` | undefined
  isPending:    boolean
  isConfirming: boolean
  isSuccess:    boolean
  errorMessage: string | null
  txLabel?:     string
  task:         Task
  variant?:     'primary' | 'danger'
  callout?:     React.ReactNode
}

function SimpleActionPanel({ label, onAction, hash, isPending, isConfirming, isSuccess, errorMessage, txLabel, task, variant, callout }: SimpleActionPanelProps) {
  return (
    <div className="space-y-3 pt-4">
      {callout}
      {!isSuccess && (
        <ActionBtn
          label={label}
          onClick={() => onAction(task.id)}
          isPending={isPending}
          isConfirming={isConfirming}
          variant={variant}
        />
      )}
      <TxStatus hash={hash} isConfirming={isConfirming} isSuccess={isSuccess} errorMessage={errorMessage} label={txLabel} />
    </div>
  )
}

// ── Main TaskDetail ─────────────────────────────────────────────────────────

export function TaskDetail({ task, contractVerified }: TaskDetailProps) {
  const { address } = useAccount()
  const [showFullDesc, setShowFullDesc] = useState(false)

  const lc = address?.toLowerCase()
  const isEmployer = !!lc && task.employer.toLowerCase() === lc
  const isProvider = !!lc && task.provider.toLowerCase() === lc

  const deadlinePassed = isDeadlinePassed(task.deadline)
  const colors = STATE_COLORS[task.state]

  const submitWork   = useSubmitWork(contractVerified)
  const approveWork  = useApproveWork(contractVerified)
  const refund       = useRequestRefund(contractVerified)
  const claimPayment = useClaimPayment(contractVerified)

  // Read reviewWindow from the contract (on-chain; never hardcoded).
  const { data: reviewWindowData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'reviewWindow',
    chainId: TARGET_CHAIN_ID,
    query: { enabled: contractVerified, staleTime: Infinity },
  })
  const reviewWindow = typeof reviewWindowData === 'bigint' ? reviewWindowData : 0n

  /**
   * Optimistic UI hint: true when the review window appears to have elapsed.
   * The contract is the source of truth — a wrong estimate causes a clear revert.
   */
  const reviewWindowExpired = isReviewWindowExpired(task.submissionTime, reviewWindow)

  const showFund    = isEmployer && task.state === TaskState.Created
  const showSubmit  = isProvider && task.state === TaskState.Funded && !deadlinePassed
  const showApprove = isEmployer && task.state === TaskState.Submitted
  // Funded: deadline must have passed; Submitted: must be within review window
  const showRefund  = isEmployer
    && (
      (task.state === TaskState.Funded && deadlinePassed)
      || (task.state === TaskState.Submitted && !reviewWindowExpired)
    )
  // Provider can claim after review window expires
  const showClaim   = isProvider && task.state === TaskState.Submitted && reviewWindowExpired

  const description = task.description || '(no description provided)'
  const truncated   = description.length > 140

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">

      {/* ── Card header ── */}
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-400">Task #{task.id.toString()}</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: colors.bg, color: colors.text }}
              >
                {STATE_LABELS[task.state]}
              </span>
              {isEmployer && <span className="text-xs font-medium text-slate-500">You are employer</span>}
              {isProvider && <span className="text-xs font-medium text-slate-500">You are provider</span>}
            </div>
          </div>
          {/* Amount hero */}
          <div className="text-right">
            <div className="font-display text-3xl font-bold tabular-nums tracking-tight text-slate-900">
              {formatUsdc(task.amount)}
            </div>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-slate-400">
              <DollarSign className="h-3 w-3" />
              USDC
            </div>
          </div>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="px-5 py-4 space-y-4">

        {/* Description */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400">Description</p>
          <p className="text-sm leading-relaxed text-slate-700">
            {truncated && !showFullDesc ? `${description.slice(0, 140)}…` : description}
          </p>
          {truncated && (
            <button
              onClick={() => setShowFullDesc(v => !v)}
              className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              {showFullDesc ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-3">
          {(['Employer', 'Provider'] as const).map((roleLabel) => {
            const addr = roleLabel === 'Employer' ? task.employer : task.provider
            return (
              <div key={roleLabel} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{roleLabel}</p>
                <a
                  href={buildAddressExplorerUrl(TARGET_CHAIN_ID, addr)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  {truncateAddress(addr)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )
          })}
        </div>

        {/* Deadline */}
        <div className={[
          'flex items-center gap-3 rounded-lg p-3 ring-1',
          deadlinePassed
            ? 'bg-rose-50 ring-rose-200'
            : 'bg-slate-50 ring-slate-200',
        ].join(' ')}>
          <Clock className={['h-4 w-4 shrink-0', deadlinePassed ? 'text-rose-500' : 'text-slate-400'].join(' ')} />
          <div>
            <p className={['text-xs font-semibold uppercase tracking-widest', deadlinePassed ? 'text-rose-600' : 'text-slate-400'].join(' ')}>
              Deadline{deadlinePassed ? ' — Passed' : ''}
            </p>
            <p className={['text-sm tabular-nums', deadlinePassed ? 'text-rose-700 font-semibold' : 'text-slate-700'].join(' ')}>
              {formatDeadline(task.deadline)}
            </p>
          </div>
        </div>

        {/* ── Action area ── */}

        {showFund && <FundPanel task={task} contractVerified={contractVerified} />}

        {showSubmit && (
          <SimpleActionPanel
            label="Submit Work"
            onAction={submitWork.execute}
            hash={submitWork.hash}
            isPending={submitWork.isPending}
            isConfirming={submitWork.isConfirming}
            isSuccess={submitWork.isSuccess}
            errorMessage={submitWork.errorMessage}
            txLabel="Submission"
            task={task}
          />
        )}

        {showApprove && (
          <SimpleActionPanel
            label={`Approve Work — Release ${formatUsdc(task.amount)} USDC`}
            onAction={approveWork.execute}
            hash={approveWork.hash}
            isPending={approveWork.isPending}
            isConfirming={approveWork.isConfirming}
            isSuccess={approveWork.isSuccess}
            errorMessage={approveWork.errorMessage}
            txLabel="Work approval"
            task={task}
            callout={
              <Callout variant="success">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Approving releases <strong>{formatUsdc(task.amount)} USDC</strong> to the provider immediately.</span>
              </Callout>
            }
          />
        )}

        {showRefund && (
          <SimpleActionPanel
            label={`Request Refund — ${formatUsdc(task.amount)} USDC`}
            onAction={refund.execute}
            hash={refund.hash}
            isPending={refund.isPending}
            isConfirming={refund.isConfirming}
            isSuccess={refund.isSuccess}
            errorMessage={refund.errorMessage}
            txLabel="Refund"
            task={task}
            variant="danger"
            callout={
              <Callout variant="warning">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {task.state === TaskState.Funded
                    ? <>The deadline has passed. Requesting a refund returns <strong>{formatUsdc(task.amount)} USDC</strong> to you.</>
                    : <>Work was submitted. You may refund within the review window. After the window closes, the provider can collect payment.</>
                  }
                </span>
              </Callout>
            }
          />
        )}

        {showClaim && (
          <SimpleActionPanel
            label={`Claim Payment — ${formatUsdc(task.amount)} USDC`}
            onAction={claimPayment.execute}
            hash={claimPayment.hash}
            isPending={claimPayment.isPending}
            isConfirming={claimPayment.isConfirming}
            isSuccess={claimPayment.isSuccess}
            errorMessage={claimPayment.errorMessage}
            txLabel="Payment claim"
            task={task}
            callout={
              <Callout variant="info">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  The review window has passed without employer action. You may now collect <strong>{formatUsdc(task.amount)} USDC</strong>.
                </span>
              </Callout>
            }
          />
        )}

        {/* Terminal states */}
        {task.state === TaskState.Completed && (
          <div className="pt-4">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3.5 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Payment released</p>
                <p className="text-xs text-emerald-600">USDC has been sent to the provider. This task is complete.</p>
              </div>
            </div>
          </div>
        )}

        {task.state === TaskState.Refunded && (
          <div className="pt-4">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3.5 ring-1 ring-slate-200">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Refund issued</p>
                <p className="text-xs text-slate-500">USDC has been returned to the employer. This task is closed.</p>
              </div>
            </div>
          </div>
        )}

        {/* Not a party */}
        {!address && (
          <p className="pt-2 text-center text-sm text-slate-400">
            Connect your wallet to take action on this task.
          </p>
        )}
      </div>
    </div>
  )
}
