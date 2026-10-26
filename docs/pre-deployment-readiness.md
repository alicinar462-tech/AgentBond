# AgentBond — Pre-Deployment Readiness Report
**Date:** 2026-10-16  
**Target:** Arc Testnet (chain ID 5042002)  
**Status:** READY FOR TESTNET DEPLOYMENT

---

## Check 1 — Lint and TypeScript

**Command:** `bash scripts/check.sh`  
**Result:** PASS  
**Evidence:**
```
Found 0 warnings and 0 errors.   (oxlint type-aware, 25 files, 57 rules)
Found 0 warnings and 0 errors.   (oxlint, 28 files, 34 rules)
tsc --noEmit                      (exit 0)
```
Zero errors, zero warnings. Both lint passes and the TypeScript compile completed cleanly.

---

## Check 2 — Forge Build and Test Suite

**Build command:** `forge build --force`  
**Build result:** PASS  
**Compiler:** Solc `0.8.28` (matches `foundry.toml`)  
**Warnings:** 6 × `block-timestamp` informational lint (3 in contract, 3 in test file). All are informational, acknowledged in the architecture as Risk R10. No errors.

**Test command:** `forge test --match-path "contracts/test/AgentBondEscrow.t.sol" -vv`  
**Test result:** PASS — 60 tests passed, 0 failed, 0 skipped  
**Duration:** 78.4 s (dominated by invariant fuzzing: 256 runs × 500 calls × 2 invariants = 256,000 handler calls)

| Suite | Tests | Fuzz/invariant runs | Result |
|---|---|---|---|
| HappyPathTest | 8 | — | PASS |
| AccountingTest | 5 | 256 fuzz runs (A-4) | PASS |
| AccessControlTest | 9 | — | PASS |
| StateTransitionTest | 13 | — | PASS |
| EdgeCaseTest | 17 | — | PASS |
| ReentrancyTest | 3 | — | PASS |
| FuzzTest | 3 | 256 runs each | PASS |
| InvariantTest | 2 | 256 runs × 500 calls each; 0 reverts | PASS |

---

## Check 3 — Chain Configuration Consistency

**File:** `src/config.ts`  
**Result:** PASS

- `arcTestnet` imported from `viem/chains` — standard, not a custom definition.
- Chain list: `[arcTestnet, mainnet]`. Mainnet is present only for ENS resolution (wagmi requirement), not as a deployment target.
- Transport: `http()` (default) for both chains — no hardcoded RPC URL in frontend config.
- Connector: `injected()` — wallet-agnostic.
- `TARGET_CHAIN_ID` in `escrow-contract.ts` is `arcTestnet.id` (5042002), identical to the value in `src/config.ts`'s chain list.
- `Header.tsx` calls `switchChain({ chainId: TARGET_CHAIN_ID })` when the connected wallet is on the wrong chain — consistent with config.
- All reads (`useReadContract`, `useReadContracts`) and writes (`useWriteContract`) pass `chainId: TARGET_CHAIN_ID` — no chain ambiguity.

---

## Check 4 — USDC Address and Approval Flow

**Files:** `src/lib/escrow-contract.ts`, `src/hooks/useEscrowWrite.ts`, `src/onchain-facts.ts`  
**Result:** PASS

**USDC address chain:**
- `getUsdcAddress()` calls `getUsdc(TARGET_CHAIN_ID)?.address` at runtime.
- `getUsdc(5042002)` resolves from `onchain-facts.ts` (generated, registry-sourced) to `0x3600000000000000000000000000000000000000`, decimals 6.
- This is the same address shown in `DeploymentNotice` as the constructor argument — consistent.
- No USDC address is hardcoded in the hooks or components; every use goes through `getUsdcAddress()`.

**Approval flow (useFundTask):**
1. `allowance` is read via `erc20Abi` against `usdcAddress` from `getUsdcAddress()` — correct.
2. `approve` calls `writeApprove` with `args: [CONTRACT_ADDRESS, taskAmount]` — correct spender and exact amount.
3. After approval confirms (`isApproveSuccess`), `refetchAllowance()` is called immediately, then `needsApproval` re-evaluates before the Fund button is shown.
4. `fundTask` is only callable when `isContractDeployed && CONTRACT_ADDRESS !== undefined` — gated correctly.

**Separation of contract vs USDC address:**
- `CONTRACT_ADDRESS` comes exclusively from `VITE_CONTRACT_ADDRESS` env var.
- USDC address comes exclusively from the registry via `getUsdcAddress()`.
- Neither assumes the other's value. The deployment notice makes both explicit.

**Mainnet address isolation:** `getUsdcAddress()` reads from `getUsdc(TARGET_CHAIN_ID)` where `TARGET_CHAIN_ID` is hardcoded to `5042002` (testnet). A mainnet deploy would require changing `TARGET_CHAIN_ID` to `5042` — no accidental mainnet USDC address bleeds into the testnet build.

---

## Check 5 — ABI vs Contract Source

**Files:** `src/lib/escrow-abi.ts`, `contracts/AgentBondEscrow.sol`  
**Result:** PASS — all items match

| Item | Solidity source | ABI entry | Match |
|---|---|---|---|
| `MAX_REF_LENGTH` | `uint256 public constant` | `view`, `outputs: [uint256]` | ✓ |
| `nextTaskId` | `uint256 public` | `view`, `outputs: [uint256]` | ✓ |
| `usdc` | `IERC20 public immutable` | `view`, `outputs: [address]` | ✓ |
| `tasks(uint256)` | mapping getter, returns `(address,address,string,uint256,uint256,TaskState)` | 6 outputs: `address,address,string,uint256,uint256,uint8` — TaskState encoded as uint8 | ✓ |
| `createTask(address,string,uint256,uint256)` | `external returns (uint256)` | `nonpayable`, inputs match, `outputs: [taskId uint256]` | ✓ |
| `fundTask(uint256)` | `external nonReentrant` | `nonpayable`, input `taskId uint256`, no outputs | ✓ |
| `submitWork(uint256)` | `external` | `nonpayable`, input `taskId uint256`, no outputs | ✓ |
| `approveWork(uint256)` | `external nonReentrant` | `nonpayable`, input `taskId uint256`, no outputs | ✓ |
| `requestRefund(uint256)` | `external nonReentrant` | `nonpayable`, input `taskId uint256`, no outputs | ✓ |
| `TaskCreated` event | `indexed: taskId, employer, provider` | `indexed: true` for all three | ✓ |
| `TaskFunded` event | `indexed: taskId, employer` | matches | ✓ |
| `WorkSubmitted` event | `indexed: taskId, provider` | matches | ✓ |
| `WorkApproved` event | `indexed: taskId, employer, provider` | matches | ✓ |
| `RefundIssued` event | `indexed: taskId, employer` | matches | ✓ |
| Custom errors (10) | All declared | All present with matching param names and types | ✓ |
| `ReentrancyGuardReentrantCall` | From OZ `ReentrancyGuard` | Included in ABI | ✓ |
| `SafeERC20FailedOperation` | From OZ `SafeERC20` | Included in ABI | ✓ |

**TaskState enum mapping:**
- Solidity: `Created=0, Funded=1, Submitted=2, Completed=3, Refunded=4`
- `src/lib/types.ts`: identical numeric mapping
- `tasks()` getter: `state` field type is `uint8` in ABI, decoded to `number` in `useEscrowTasks` and cast to `TaskState` — correct.

---

## Check 6 — Edge-Case UI Handling

**Absent contract address — PASS**
- `isContractDeployed = !!CONTRACT_ADDRESS`. When `VITE_CONTRACT_ADDRESS` is unset, `CONTRACT_ADDRESS` is `undefined`.
- `App.tsx` renders `<DeploymentNotice />` instead of the task list or any interactive elements.
- All `useReadContract`/`useReadContracts` queries have `enabled: isContractDeployed` — no RPC calls are made.
- All write functions guard on `!isContractDeployed` and return early without calling `writeContract`.

**Disconnected wallet — PASS**
- `ConnectKitButton` in `Header.tsx` prompts connection.
- "New Task" button is `disabled` when `!isConnected`.
- `TaskDetail` shows "Connect your wallet to take action on this task." when `!address`.
- Action buttons (`FundPanel`, `SimpleActionPanel`) are never shown without a valid `address` match (employer/provider role check returns false when `address` is undefined).
- `useFundTask` allowance read has `enabled: !!walletAddress && isContractDeployed && !!usdcAddress` — no calls without a connected wallet.

**Wrong network — PASS**
- `Header.tsx` detects `isConnected && chainId !== TARGET_CHAIN_ID` and renders a "Switch to Arc Testnet" button.
- All writes pass `chainId: TARGET_CHAIN_ID` — wagmi will reject or prompt a chain switch if the wallet is on the wrong chain.

**Rejected transactions — PASS**
- `parseContractError` in `format.ts` explicitly matches `"user rejected"`, `"user denied"`, `"rejected the request"` and returns `"Transaction cancelled."`.
- `writeError` is captured in every hook and surfaced via `errorMessage` to `TxStatus`.
- Buttons re-enable after rejection (wagmi `useWriteContract` resets `isPending` to false on rejection).

**Pending transactions — PASS**
- Every action button shows a `Loader2` spinner and "Confirm in wallet…" while `isPending` (wallet not yet signed).
- Shows "Confirming…" with spinner while `isConfirming` (tx sent, awaiting receipt via `useWaitForTransactionReceipt`).
- `disabled={isPending || isConfirming}` prevents double-submission.
- `TxStatus` shows "Waiting for confirmation…" independently during the confirming phase.

**Reverted transactions — PASS**
- `receiptError` from `useWaitForTransactionReceipt` is captured alongside `writeError`.
- `parseContractError` maps all 10 custom error names plus generic revert to human-readable strings.
- The error is displayed in `TxStatus` with a red `XCircle` icon.

**Confirmed receipts — PASS**
- `isSuccess` from `useWaitForTransactionReceipt` is only `true` after the receipt lands — never speculatively.
- `TxStatus` shows a `CheckCircle2` with "confirmed" label and an explorer link built from `buildTxExplorerUrl(TARGET_CHAIN_ID, hash)`.
- After success, `queryClient.invalidateQueries()` triggers a re-read of the task list from chain.
- The explorer link points to `https://explorer.testnet.arc.io/tx/<hash>` — correct for Arc Testnet.

---

## Check 7 — Task List Refresh Strategy and 50-Task Limit

**File:** `src/hooks/useEscrowTasks.ts`  
**Result:** PASS

**How it works:**
1. `useNextTaskId` reads `nextTaskId` from the contract with `staleTime: 0` and `refetchInterval: 4000`. The 4-second interval is a safety net; wagmi's block-watch (`watch: true` is not set, but `staleTime: 0` ensures the query is treated as immediately stale and re-fetches on any relevant cache invalidation).
2. `idsToRead` is computed as the 50 most recent IDs (newest-first) from `nextId - MAX_DISPLAY_TASKS` to `nextId - 1`.
3. `useReadContracts` multicalls all IDs in a single batch with `enabled: isContractDeployed && idsToRead.length > 0`.
4. After any write, `queryClient.invalidateQueries()` is called, which causes both `nextTaskId` and the task batch to re-fetch immediately without waiting for the 4-second interval.
5. The manual "Refresh" button in `TaskList.tsx` calls `refetch()` on the batch query directly.

**50-task limit behavior:**
- When fewer than 50 tasks exist (`nextId - 1 < 50`), all tasks are shown.
- When more than 50 tasks exist, only the 50 most recent (by ID) are shown — no pagination for MVP. The TaskList header displays `"Showing X of Y"` when `showing < totalKnown`.
- IDs are guaranteed to be newest-first because the loop runs from `nextId - 1` down to `start`.

**Potential inefficiency acknowledged (not a blocker):**
- Every `useReadContracts` call re-fetches all up-to-50 tasks as a block, not just changed ones. For 50 tasks this is ~50 RPC calls per refresh cycle. Acceptable for MVP on Arc Testnet. A production version would use event indexing.

---

## Blockers

None. There are no code defects, type errors, or broken flows.

---

## Pre-Deployment Checklist (required before deployment, not before frontend dev)

| # | Item | Status |
|---|---|---|
| D-1 | `VITE_CONTRACT_ADDRESS` set in `.env` after deployment | Not yet — requires deploy |
| D-2 | Restart dev server after setting `VITE_CONTRACT_ADDRESS` | Not yet — after D-1 |
| D-3 | Constructor arg confirmed as `0x3600000000000000000000000000000000000000` | Confirmed in source and notice |
| D-4 | `eth_getCode` on `0x3600...` at Arc Testnet (chain 5042002) | Recommended before deploy |
| D-5 | Test wallet funded with Arc Testnet USDC (via "Get test USDC" in Arc Studio sidebar) | Required for end-to-end testing |
| D-6 | Gas costs for `fundTask`, `approveWork`, `requestRefund` measured | Can be measured on first testnet transaction |

---

## Recommendation

**READY FOR ARC TESTNET DEPLOYMENT.**
