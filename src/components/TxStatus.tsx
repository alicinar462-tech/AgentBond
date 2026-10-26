/**
 * TxStatus — confirmed transaction receipt row.
 * Only rendered when a hash or error is present.
 * Explorer link appears only for real on-chain hashes.
 */
import { ExternalLink, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { TARGET_CHAIN_ID } from '@/lib/escrow-contract'

interface TxStatusProps {
  hash:         `0x${string}` | undefined
  isConfirming: boolean
  isSuccess:    boolean
  errorMessage: string | null
  label?:       string
}

export function TxStatus({ hash, isConfirming, isSuccess, errorMessage, label = 'Transaction' }: TxStatusProps) {
  if (!hash && !errorMessage) return null
  const explorerUrl = hash ? buildTxExplorerUrl(TARGET_CHAIN_ID, hash) : undefined

  if (isConfirming) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3.5 py-3 text-sm text-blue-700 ring-1 ring-blue-200">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>Waiting for confirmation…</span>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3.5 py-3 ring-1 ring-emerald-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {label} confirmed
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800"
          >
            View tx
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3.5 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{errorMessage}</span>
      </div>
    )
  }

  return null
}
