/**
 * AgentBond shared TypeScript types.
 * TaskState values mirror the Solidity enum exactly.
 */

/** Mirror of AgentBondEscrow.TaskState enum (uint8 on-chain). */
export enum TaskState {
  Created   = 0,
  Funded    = 1,
  Submitted = 2,
  Completed = 3,
  Refunded  = 4,
}

/** Decoded task struct as returned by the `tasks(uint256)` getter. */
export interface Task {
  id:             bigint
  employer:       `0x${string}`
  provider:       `0x${string}`
  description:    string
  amount:         bigint   // 6-decimal USDC ERC-20 units
  deadline:       bigint   // Unix timestamp (seconds)
  submissionTime: bigint   // Unix timestamp set by submitWork(); 0 before submission
  state:          TaskState
}

/** Which role the connected wallet plays in a task. */
export type WalletRole = 'employer' | 'provider' | 'none'
