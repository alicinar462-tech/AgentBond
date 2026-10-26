/**
 * Mode-aware Arc chain selection.
 *
 * This module is the SINGLE source of truth for which Arc chain (testnet or
 * mainnet) the frontend targets. All other modules that need the chain ID,
 * the viem/chains object, or the network label import from here — never from
 * each other or from hardcoded constants.
 *
 * How it works:
 *   Vite replaces `import.meta.env.VITE_CHAIN_ID` at bundle time with the
 *   value from the active mode file:
 *     .env.testnet  →  VITE_CHAIN_ID=5042002  (Arc Testnet)
 *     .env.mainnet  →  VITE_CHAIN_ID=5042     (Arc Mainnet)
 *     (no mode)     →  VITE_CHAIN_ID undefined → fallback 5042002
 *
 *   Only the two canonical Arc chain IDs are accepted. Any other value is
 *   rejected at module load time so a misconfigured build fails loudly rather
 *   than silently targeting the wrong chain.
 *
 * Circular-import safety:
 *   chain-config.ts → viem/chains, import.meta.env only.
 *   escrow-contract.ts → chain-config.ts (one direction).
 *   config.ts          → chain-config.ts (one direction).
 *   Neither escrow-contract.ts nor config.ts imports the other, so no cycle.
 */
import { arcTestnet, arc } from 'viem/chains'

/** All Arc chain IDs this app supports. */
export const ARC_TESTNET_CHAIN_ID = 5042002 as const
export const ARC_MAINNET_CHAIN_ID = 5042    as const

type SupportedArcChainId = typeof ARC_TESTNET_CHAIN_ID | typeof ARC_MAINNET_CHAIN_ID

/**
 * Resolve VITE_CHAIN_ID to a supported Arc chain ID.
 * Throws at module load time (i.e. at bundle startup) if the value is set
 * but is not one of the two supported Arc chain IDs.
 */
function resolveChainId(): SupportedArcChainId {
  const raw = import.meta.env.VITE_CHAIN_ID as string | undefined
  // Undefined / empty string → safe testnet fallback (plain `vite`, test runner)
  if (raw === undefined || raw === '') return ARC_TESTNET_CHAIN_ID

  const parsed = Number(raw)
  if (parsed === ARC_TESTNET_CHAIN_ID) return ARC_TESTNET_CHAIN_ID
  if (parsed === ARC_MAINNET_CHAIN_ID)  return ARC_MAINNET_CHAIN_ID

  // Invalid value: fail loudly so a misconfigured build is caught immediately.
  throw new Error(
    `[chain-config] VITE_CHAIN_ID="${raw}" is not a supported Arc chain ID. ` +
    `Expected ${ARC_TESTNET_CHAIN_ID} (Arc Testnet) or ${ARC_MAINNET_CHAIN_ID} (Arc Mainnet).`
  )
}

/**
 * The Arc chain ID for this build.
 * 5042002 in testnet builds and the test runner; 5042 in mainnet builds.
 */
export const TARGET_CHAIN_ID: SupportedArcChainId = resolveChainId()

/**
 * The viem chain object matching TARGET_CHAIN_ID.
 * Use this wherever a full Chain object is required (wagmi config, cast calls, etc.).
 */
export const arcChain = TARGET_CHAIN_ID === ARC_MAINNET_CHAIN_ID ? arc : arcTestnet

/**
 * Human-readable network label for UI display.
 * Falls back to the chain name if VITE_CHAIN_LABEL is not set.
 */
export const CHAIN_LABEL: string =
  ((import.meta.env.VITE_CHAIN_LABEL as string | undefined) ?? arcChain.name)
