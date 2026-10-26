/**
 * Header — sticky app bar with logo, network pill, wrong-chain banner, and wallet button.
 */
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle, Link2 } from 'lucide-react'
import { TARGET_CHAIN_ID, CHAIN_LABEL } from '@/lib/chain-config'

export function Header() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-display text-xs font-bold text-white">
            AB
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight text-slate-900">
            AgentBond
          </span>
          <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 sm:flex">
            <Link2 className="h-3 w-3" />
            {CHAIN_LABEL}
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {isWrongChain && (
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
              className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {isSwitching ? 'Switching…' : `Switch to ${CHAIN_LABEL}`}
            </button>
          )}
          <ConnectKitButton />
        </div>
      </div>
    </header>
  )
}
