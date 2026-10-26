/**
 * Pure formatting helpers — no blockchain calls.
 * All USDC amounts are in 6-decimal ERC-20 units (bigint).
 */
import { TaskState } from './types'

// ── Addresses ────────────────────────────────────────────────────────────────

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ── USDC amounts ─────────────────────────────────────────────────────────────

const USDC_DECIMALS = 6
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS)

/** Format a raw 6-decimal bigint as a human-readable USDC string, e.g. "100.00". */
export function formatUsdc(raw: bigint): string {
  const whole = raw / USDC_SCALE
  const frac  = raw % USDC_SCALE
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').slice(0, 2)
  return `${whole.toLocaleString('en-US')}.${fracStr}`
}

/** Parse a decimal string (e.g. "100.50") into a raw 6-decimal bigint. Returns null on invalid input. */
export function parseUsdc(input: string): bigint | null {
  const cleaned = input.trim().replace(/,/g, '')
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null
  const [wholePart = '0', fracPart = ''] = cleaned.split('.')
  const frac = fracPart.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, '0')
  try {
    return BigInt(wholePart) * USDC_SCALE + BigInt(frac)
  } catch {
    return null
  }
}

// ── Deadlines ─────────────────────────────────────────────────────────────────

/** Format a Unix timestamp (bigint seconds) as a human-readable local date/time string. */
export function formatDeadline(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Returns true when the current client time is at or past the deadline. */
export function isDeadlinePassed(deadline: bigint): boolean {
  return Date.now() >= Number(deadline) * 1000
}

/**
 * Returns true when the review window has elapsed based on client time.
 * This is an optimistic UI hint only — the contract is the source of truth.
 * Pass submissionTime=0n or reviewWindow=0n to get false (window not started).
 */
export function isReviewWindowExpired(submissionTime: bigint, reviewWindow: bigint): boolean {
  if (submissionTime <= 0n || reviewWindow <= 0n) return false
  return Date.now() >= Number(submissionTime + reviewWindow) * 1000
}

/** Format a datetime-local input value (YYYY-MM-DDTHH:mm) to a Unix timestamp in seconds. */
export function datetimeLocalToUnix(value: string): bigint {
  return BigInt(Math.floor(new Date(value).getTime() / 1000))
}

/** Return a datetime-local string (YYYY-MM-DDTHH:mm) for a given offset in minutes from now. */
export function nowPlusMinutes(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60 * 1000)
  // Format as YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Task state labels ─────────────────────────────────────────────────────────

export const STATE_LABELS: Record<TaskState, string> = {
  [TaskState.Created]:   'Created',
  [TaskState.Funded]:    'Funded',
  [TaskState.Submitted]: 'Submitted',
  [TaskState.Completed]: 'Completed',
  [TaskState.Refunded]:  'Refunded',
}

export const STATE_COLORS: Record<TaskState, { bg: string; text: string }> = {
  [TaskState.Created]:   { bg: 'rgba(18,45,69,0.08)',  text: 'var(--ink-2)' },
  [TaskState.Funded]:    { bg: 'rgba(26,128,71,0.10)', text: '#1a6b3c' },
  [TaskState.Submitted]: { bg: 'rgba(16,97,166,0.10)', text: '#1061a6' },
  [TaskState.Completed]: { bg: 'rgba(26,128,71,0.18)', text: 'var(--success)' },
  [TaskState.Refunded]:  { bg: 'rgba(186,43,76,0.10)', text: 'var(--danger)' },
}

// ── Error messages ────────────────────────────────────────────────────────────

export function parseContractError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.'
  const errObj = error as { message?: string; shortMessage?: string } | null
  const msg: string = errObj?.shortMessage
    ?? errObj?.message
    ?? 'Unknown error'

  const lower = msg.toLowerCase()

  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return 'Transaction cancelled.'
  }
  if (lower.includes('notemployer'))      return 'Only the employer can perform this action.'
  if (lower.includes('notprovider'))      return 'Only the designated provider can perform this action.'
  if (lower.includes('invalidstate'))     return 'This action is not valid in the current task state.'
  if (lower.includes('deadlinepassed'))   return 'The deadline has passed — work can no longer be submitted.'
  if (lower.includes('deadlinenotreached')) return 'The deadline has not yet passed — refund not available.'
  if (lower.includes('deadlineinpast'))   return 'Deadline must be in the future.'
  if (lower.includes('tasknotfound'))     return 'Task not found.'
  if (lower.includes('zeroaddress'))      return 'Address cannot be zero.'
  if (lower.includes('zeroamount'))       return 'Amount must be greater than zero.'
  if (lower.includes('descriptiontoolong')) return 'Description exceeds 256 characters.'
  if (lower.includes('insufficient') || lower.includes('exceeds balance')) {
    return 'Insufficient USDC balance. Add funds and try again.'
  }
  if (lower.includes('allowance') || lower.includes('safeerc20')) {
    return 'Insufficient USDC allowance. Approve the contract to spend your USDC first.'
  }
  if (lower.includes('reviewwindowexpired'))    return 'The review window has closed. Refund is no longer available.'
  if (lower.includes('reviewwindownotexpired')) return 'The review window has not yet passed. Payment claim not available yet.'
  if (lower.includes('invalidreviewwindow'))    return 'Invalid review window duration.'
  if (lower.includes('reverted')) return 'Transaction reverted. Check that all conditions are met.'
  if (lower.includes('network') || lower.includes('timeout')) {
    return 'Network error. Check your connection and try again.'
  }

  return 'Something went wrong. Please try again.'
}
