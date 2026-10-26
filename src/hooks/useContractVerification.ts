/**
 * useContractVerification — runtime on-chain bytecode verification for
 * AgentBondEscrow.
 *
 * WHY:
 *   isContractDeployed (escrow-contract.ts) only validates the address format.
 *   A valid-looking address can still be empty (no bytecode) on the target chain,
 *   or can be the wrong contract, or the env mode can be misconfigured.
 *   This hook adds an eth_getCode check before any write is allowed.
 *
 * BEHAVIOUR:
 *   • Calls getCode({ address, blockTag: 'latest' }) on TARGET_CHAIN_ID using
 *     the wagmi public client for that chain.
 *   • Treats the address as verified only when:
 *       1. The format is valid (isContractDeployed from escrow-contract.ts)
 *       2. The address is not the zero address
 *       3. The returned bytecode is non-empty (length > 2, i.e. not "0x")
 *   • While the check is pending, `contractVerified` is false — writes are blocked.
 *   • On RPC error, `contractVerified` is false — writes are blocked.
 *   • Stale results are discarded via a cancellation flag when ADDRESS changes.
 *
 * ISOLATION:
 *   Always targets TARGET_CHAIN_ID, not the wallet's connected chain.
 */
import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { CONTRACT_ADDRESS, TARGET_CHAIN_ID, isContractDeployed } from '@/lib/escrow-contract'

export type ContractVerificationStatus =
  | 'idle'          // address format invalid or missing — no check attempted
  | 'checking'      // getCode request in flight
  | 'verified'      // non-empty bytecode confirmed on TARGET_CHAIN_ID
  | 'not-deployed'  // address has no bytecode on TARGET_CHAIN_ID
  | 'rpc-error'     // getCode call failed (network error, timeout, etc.)

export interface ContractVerificationResult {
  /** True only when bytecode is confirmed present. Use this to gate writes. */
  contractVerified: boolean
  status: ContractVerificationStatus
  /** Human-readable status message suitable for display. */
  statusMessage: string
  /** The address that was (or is being) verified. */
  verifiedAddress: `0x${string}` | undefined
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function buildMessage(status: ContractVerificationStatus, address: string | undefined): string {
  switch (status) {
    case 'idle':
      return 'Contract address not configured or invalid format.'
    case 'checking':
      return `Verifying contract on-chain… (${address ? address.slice(0, 10) + '…' : ''})`
    case 'verified':
      return 'Contract verified on-chain.'
    case 'not-deployed':
      return `No contract bytecode at ${address ? address.slice(0, 10) + '…' : 'configured address'} on this network. Check VITE_CONTRACT_ADDRESS.`
    case 'rpc-error':
      return 'RPC error during verification. Writes are disabled until the check succeeds.'
  }
}

export function useContractVerification(): ContractVerificationResult {
  // Derive the initial status from format validation synchronously during render.
  const initialStatus: ContractVerificationStatus =
    !isContractDeployed || !CONTRACT_ADDRESS
      ? 'idle'
      : CONTRACT_ADDRESS.toLowerCase() === ZERO_ADDRESS
        ? 'not-deployed'
        : 'checking'

  const [status, setStatus] = useState<ContractVerificationStatus>(initialStatus)

  // Get the wagmi public client for TARGET_CHAIN_ID — always the configured chain.
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID })

  const address = CONTRACT_ADDRESS

  useEffect(() => {
    // Short-circuit: nothing to check when format is invalid, zero, or no public client.
    if (!isContractDeployed || !address || !publicClient) {
      return
    }
    if (address.toLowerCase() === ZERO_ADDRESS) {
      return
    }

    // Start the async check; use a flag to discard stale results if address changes.
    let cancelled = false

    publicClient
      .getCode({ address, blockTag: 'latest' })
      .then((code) => {
        if (cancelled) return
        const hasCode = typeof code === 'string' && code.length > 2
        setStatus(hasCode ? 'verified' : 'not-deployed')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('rpc-error')
      })

    return () => { cancelled = true }
  }, [address, publicClient])

  // Synchronise the displayed status with the current address between renders.
  // We do this as a derived calculation rather than inside the effect to avoid
  // the react(set-state-in-effect) lint rule.
  const effectiveStatus: ContractVerificationStatus = (() => {
    if (!isContractDeployed || !address) return 'idle'
    if (address.toLowerCase() === ZERO_ADDRESS) return 'not-deployed'
    // Trust whatever the async effect last set, but reset to 'checking' if the
    // effect hasn't resolved yet (status would still be initialStatus 'checking').
    return status
  })()

  return {
    contractVerified: effectiveStatus === 'verified',
    status: effectiveStatus,
    statusMessage: buildMessage(effectiveStatus, address),
    verifiedAddress: effectiveStatus === 'verified' ? address : undefined,
  }
}
