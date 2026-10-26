/**
 * Contract address and chain configuration for AgentBondEscrow.
 *
 * CONTRACT ADDRESS:
 *   Set VITE_CONTRACT_ADDRESS in .env (or .env.testnet / .env.mainnet) after
 *   deploying the contract. This value is intentionally separate from the USDC
 *   token address.
 *
 *   Mode files:
 *     .env.testnet — Arc Testnet (chain 5042002); used by dev:testnet / build:testnet
 *     .env.mainnet — Arc Mainnet  (chain 5042);    used by dev:mainnet / build:mainnet
 *     .env         — fallback for plain `vite` / `vite build`
 *
 * USDC ADDRESS:
 *   Read from @/onchain-facts (Arc Studio registry). The value at chainId
 *   5042002 (Arc Testnet) is 0x3600000000000000000000000000000000000000,
 *   verified from the registry. The mainnet value (chainId 5042) is the same
 *   predeploy address but is NOT assumed valid here without runtime confirmation.
 *   Both are read from the registry at runtime — never hardcoded.
 *
 * MAINNET SWITCH (⚠ do both in the same commit):
 *   1. Change TARGET_CHAIN_ID to arc.id (5042) — import { arc } from 'viem/chains'
 *   2. Set VITE_CONTRACT_ADDRESS to the mainnet deploy address in .env.mainnet
 *   Also update src/config.ts and src/components/Header.tsx (see B-4 assessment).
 *   Do NOT perform this switch until B-2 (independent security audit) is complete.
 *
 * LIMITATION:
 *   Until VITE_CONTRACT_ADDRESS is set to a valid address, the contract address is
 *   undefined and all write operations are disabled. The UI shows a deployment notice.
 */
import { getUsdc } from '@/onchain-facts'
import { TARGET_CHAIN_ID } from '@/lib/chain-config'
export { TARGET_CHAIN_ID } from '@/lib/chain-config'

/**
 * Validates that a string is a well-formed EVM address:
 * "0x" followed by exactly 40 hexadecimal characters (case-insensitive).
 * Does NOT verify on-chain bytecode — format check only.
 */
function isValidAddress(value: string | undefined): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

/**
 * The deployed AgentBondEscrow address.
 * Undefined when VITE_CONTRACT_ADDRESS is absent, empty, or not a valid
 * 20-byte hexadecimal address (0x + 40 hex chars).
 */
const _rawAddress = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined
export const CONTRACT_ADDRESS: `0x${string}` | undefined =
  isValidAddress(_rawAddress) ? _rawAddress : undefined

/**
 * True only when VITE_CONTRACT_ADDRESS is set AND passes the address format
 * validation. An empty placeholder, a malformed value, or a missing variable
 * all produce false, keeping the deployment notice visible.
 */
export const isContractDeployed = isValidAddress(_rawAddress)

/**
 * USDC token address for the target chain, read from the Arc Studio registry.
 * Returns undefined if the registry has no USDC entry for this chain.
 */
export function getUsdcAddress(): `0x${string}` | undefined {
  return getUsdc(TARGET_CHAIN_ID)?.address as `0x${string}` | undefined
}

/**
 * USDC decimals for the target chain (ERC-20 view: 6).
 * The contract uses only the ERC-20 view; the 18-decimal native view is never touched.
 */
export function getUsdcDecimals(): number {
  return getUsdc(TARGET_CHAIN_ID)?.decimals ?? 6
}

/** Maximum number of tasks to display (most recent N). */
export const MAX_DISPLAY_TASKS = 50
