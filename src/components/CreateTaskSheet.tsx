/**
 * CreateTaskSheet — modal dialog for creating a new escrow task.
 * Validates all inputs client-side before calling the contract.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { isAddress } from 'viem'
import { useAccount } from 'wagmi'
import { parseUsdc, formatUsdc, datetimeLocalToUnix, nowPlusMinutes } from '@/lib/format'
import { useCreateTask } from '@/hooks/useEscrowWrite'
import { TxStatus } from './TxStatus'

const MAX_DESC_BYTES = 256

interface CreateTaskSheetProps {
  open:              boolean
  onClose:           () => void
  contractVerified:  boolean
}

interface FieldProps {
  label:     string
  hint?:     string
  error?:    string
  required?: boolean
  children:  React.ReactNode
}

function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500">
          {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  )
}

export function CreateTaskSheet({ open, onClose, contractVerified }: CreateTaskSheetProps) {
  const { address, isConnected } = useAccount()

  const [provider,    setProvider]    = useState('')
  const [description, setDescription] = useState('')
  const [amount,      setAmount]      = useState('')
  const [deadlineStr, setDeadlineStr] = useState(nowPlusMinutes(60 * 24))

  const { execute, hash, isPending, isConfirming, isSuccess, errorMessage, reset } = useCreateTask(contractVerified)

  // Validation
  const providerTouched   = provider.length > 0
  const providerValid     = isAddress(provider)
  const parsedAmount      = parseUsdc(amount)
  const amountTouched     = amount.length > 0
  const amountValid       = parsedAmount !== null && parsedAmount > 0n
  const descBytes         = new TextEncoder().encode(description).length
  const descValid         = descBytes <= MAX_DESC_BYTES
  // eslint-disable-next-line -- Date.now() is intentional: deadline validation requires current time
  const nowSeconds        = BigInt(Math.floor(Date.now() / 1000))
  const deadlineUnix      = deadlineStr ? datetimeLocalToUnix(deadlineStr) : 0n
  const deadlineValid     = deadlineUnix > nowSeconds
  const deadlineTouched   = deadlineStr.length > 0

  const isSelfEscrow      = isConnected && address && providerValid && provider.toLowerCase() === address.toLowerCase()
  const canSubmit         = contractVerified && isConnected && providerValid && amountValid && descValid && deadlineValid && !isPending && !isConfirming

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || parsedAmount === null) return
    execute(provider, description, parsedAmount, deadlineUnix)
  }

  function handleClose() {
    reset()
    setProvider('')
    setDescription('')
    setAmount('')
    setDeadlineStr(nowPlusMinutes(60 * 24))
    onClose()
  }

  const inputBase = 'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-slate-900 focus:border-slate-900'
  const inputNormal = `${inputBase} border-slate-200`
  const inputError  = `${inputBase} border-rose-400 ring-1 ring-rose-300`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent bar */}
            <div className="h-1 w-full bg-slate-900" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">
                New Escrow Task
              </h2>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
              {isSuccess ? (
                /* Success state */
                <div className="py-4 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">Task created!</p>
                  <p className="mt-1 text-sm text-slate-500">Fund it to activate the escrow.</p>
                  <TxStatus hash={hash} isConfirming={false} isSuccess={true} errorMessage={null} label="Task creation" />
                  <button
                    onClick={handleClose}
                    className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Provider */}
                  <Field
                    label="Provider wallet address"
                    required
                    error={providerTouched && !providerValid ? 'Enter a valid 0x wallet address' : undefined}
                  >
                    <input
                      type="text"
                      placeholder="0x…"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value.trim())}
                      className={`${providerTouched && !providerValid ? inputError : inputNormal} font-mono`}
                    />
                    {isSelfEscrow && (
                      <p className="mt-1 text-xs text-amber-600">Self-escrow: you are both employer and provider.</p>
                    )}
                  </Field>

                  {/* Description */}
                  <Field
                    label="Task description"
                    hint={`${descBytes} / ${MAX_DESC_BYTES} bytes`}
                    error={!descValid ? `${descBytes - MAX_DESC_BYTES} bytes over limit` : undefined}
                  >
                    <textarea
                      rows={3}
                      placeholder="Describe the work or paste a reference link / IPFS CID…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={`${!descValid ? inputError : inputNormal} resize-none`}
                    />
                  </Field>

                  {/* USDC amount */}
                  <Field
                    label="USDC amount"
                    required
                    error={amountTouched && !amountValid ? 'Enter a positive amount' : undefined}
                  >
                    <div className={[
                      'flex items-center overflow-hidden rounded-lg border transition',
                      amountTouched && !amountValid ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200 focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900',
                    ].join(' ')}>
                      <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                        }}
                        className="font-display min-w-0 flex-1 bg-white px-3.5 py-2.5 text-xl font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-300"
                      />
                      <span className="border-l border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-500">
                        USDC
                      </span>
                    </div>
                    {parsedAmount !== null && parsedAmount > 0n && (
                      <p className="mt-1 text-xs tabular-nums text-slate-400">= {formatUsdc(parsedAmount)} USDC</p>
                    )}
                  </Field>

                  {/* Deadline */}
                  <Field
                    label="Deadline"
                    required
                    error={deadlineTouched && !deadlineValid ? 'Deadline must be in the future' : undefined}
                  >
                    <input
                      type="datetime-local"
                      value={deadlineStr}
                      onChange={(e) => setDeadlineStr(e.target.value)}
                      className={deadlineTouched && !deadlineValid ? inputError : inputNormal}
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Provider must submit work before this time. Refund available after it passes.
                    </p>
                  </Field>

                  {/* Tx error */}
                  <TxStatus hash={hash} isConfirming={isConfirming} isSuccess={false} errorMessage={errorMessage} label="Task creation" />

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isPending && <><Loader2 className="h-4 w-4 animate-spin" /> Confirm…</>}
                      {isConfirming && <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>}
                      {!isPending && !isConfirming && (!isConnected ? 'Connect wallet first' : 'Create Task')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
