# AgentBond — Arc Mainnet End-to-End Test Report

**Date:** October 31, 2026
**Network:** Arc Mainnet (Chain ID: 5042)
**Report status:** Final — all data verified directly from on-chain records.

---

## 1. Deployment Information

| Field | Value |
|---|---|
| Contract | `AgentBondEscrow` |
| Contract address | `0xb705840BC901200CdF163c3d96f224d98e285B28` |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` (Arc predeploy) |
| Review window | 432,000 seconds (5 days) |
| Deploy block | 28,787,266 |
| Deploy tx | `0xe4dcab2f9d9fc518f62a698a9e5698c976cec50d156dc420baa174b944bf1f32` |

**On-chain verification:**
- `eth_getCode` → non-empty bytecode at deploy address ✓
- `usdc()` getter → `0x3600000000000000000000000000000000000000` ✓
- `reviewWindow()` getter → `432000` ✓
- USDC `symbol()` → "USDC", `decimals()` → 6 ✓

---

## 2. Wallets Used

| Role | Address |
|---|---|
| Employer | `0xb4Cb432dACebC30Af162CFdC5AD56D698425e291` |
| Provider | `0x1259Bf0eE9fE2Af4D719565117a8c1be43d2B822` |

---

## 3. Task Lifecycle — Task #1

| Field | Value |
|---|---|
| Task ID | 1 |
| Description | "AgentBond Mainnet Smoke Test" |
| Amount | 10,000 USDC units = 0.010000 USDC |
| Employer | `0xb4Cb432dACebC30Af162CFdC5AD56D698425e291` |
| Provider | `0x1259Bf0eE9fE2Af4D719565117a8c1be43d2B822` |
| Deadline | Unix `1793440200` = 2026-10-31T09:50:00Z |
| Final on-chain state | 3 (Completed) — verified via `tasks(1)` getter |

---

## 4. Transaction Table

The lifecycle consists of **five core transactions** plus one **prerequisite ERC-20 approval** transaction, for six total.

### Core Transactions (5)

| Step | Tx Hash | Block | Status | Sender |
|---|---|---|---|---|
| Deploy contract | `0xe4dcab2f9d9fc518f62a698a9e5698c976cec50d156dc420baa174b944bf1f32` | 28,787,266 | SUCCESS | Deployer |
| createTask | `0x0e0e21043115ffa164090cffe211cca21c7e596c990c9f600860cb5a078e97ec` | 28,791,664 | SUCCESS | Employer |
| fundTask | `0xf0b2ba5cc19df6c86c5f45ba421263c3874f95de136453cc239f101f60bca626` | 28,792,901 | SUCCESS | Employer |
| submitWork | `0x377bcd69ddbcecc45de0b49c5d088734adc37bbbb6f5cbc75efd38f0e7c74ecd` | 28,793,206 | SUCCESS | Provider |
| approveWork | `0x1d7d1511e21dc272048a019d56fea7880e83fbad6a0ea9c96d7085fb38fe499c` | 28,793,478 | SUCCESS | Employer |

### Prerequisite: ERC-20 USDC Approval (1)

This transaction was sent by the Employer to the USDC contract before `fundTask`, granting the escrow contract a 0.01 USDC spending allowance. It is a prerequisite for `fundTask` to succeed but is not a call to the `AgentBondEscrow` contract itself.

| Field | Value |
|---|---|
| Tx hash | `0x733b9a52718c84c14228f765a8849f56acf578310461c56a8486cd8ad7a09fcd` |
| Block | 28,791,953 |
| Status | SUCCESS |
| Contract called | `0x3600000000000000000000000000000000000000` (USDC ERC-20) |
| Sender (owner) | `0xb4Cb432dACebC30Af162CFdC5AD56D698425e291` (Employer) |
| Spender | `0xb705840BC901200CdF163c3d96f224d98e285B28` (AgentBondEscrow) |
| Approved amount | 10,000 units = 0.010000 USDC |
| Gas used | 55,426 |
| Explorer | [View on arc.etherscan.io](https://arc.etherscan.io/tx/0x733b9a52718c84c14228f765a8849f56acf578310461c56a8486cd8ad7a09fcd) |

---

## 5. Verified Event Emissions

### createTask (block 28,791,664)

Event: `TaskCreated(taskId=1, employer, provider)`

- Amount decoded from event data: 10,000 units = 0.010000 USDC ✓
- Deadline decoded: Unix `1793440200` ✓
- Description decoded: "AgentBond Mainnet Smoke Test" ✓

### fundTask (block 28,792,901)

Receipt contains 3 logs, confirming USDC pulled from Employer into escrow.

### submitWork (block 28,793,206)

Event: `WorkSubmitted(taskId=1)` — emitted by Provider. ✓

### approveWork (block 28,793,478)

Receipt contains 3 logs:

| Log | Contract | Event | Details |
|---|---|---|---|
| 0 | `0xb705840...B28` | `WorkApproved` | taskId=1, amount=10,000 units |
| 1 | `0xffff...fffe` | USDC Transfer (native view) | escrow → provider, 10,000,000,000,000,000 wei (native precision) |
| 2 | `0x3600...0000` | USDC Transfer (ERC-20 view) | escrow → provider, 10,000 units = **0.010000 USDC** ✓ |

The ERC-20 Transfer in log 2 is the authoritative record of the payment. The native-view transfer in log 1 represents the same funds in Arc's native USDC precision; both entries reflect a single 0.01 USDC movement.

---

## 6. USDC Payment Verification

| Item | Value | Source |
|---|---|---|
| Expected payment | 0.010000 USDC (10,000 units) | Task record in contract |
| Actual ERC-20 transfer | 10,000 units = 0.010000 USDC | `approveWork` receipt, log index 2 |
| Transfer from | `0xb705840BC901200CdF163c3d96f224d98e285B28` (escrow) | On-chain log |
| Transfer to | `0x1259Bf0eE9fE2Af4D719565117a8c1be43d2B822` (Provider) | On-chain log |
| Payment match | Exact ✓ | |

---

## 7. Provider Balance Analysis

| Item | Value | Source |
|---|---|---|
| Current balance (post-test) | 1,008,536 units = **1.008536 USDC** | `balanceOf` call at report time |
| Payment received this test | 10,000 units = 0.010000 USDC | `approveWork` receipt, log 2 |
| Inferred pre-test balance | ~998,536 units = ~0.998536 USDC | **Inferred** by subtracting the 0.01 USDC payment from the current balance — not directly verified from a historical on-chain snapshot |

> **Note:** The pre-test balance of ~0.998536 USDC is an inferred value only. It is derived arithmetically (current balance minus the verified payment). No historical balance snapshot was captured before the test began, and Arc Mainnet RPC does not support `eth_call` with a past block parameter in a way that was accessible from the sandbox. The current balance of 1.008536 USDC and the exact 0.01 USDC payment are both independently verified from on-chain records.

---

## 8. Application Behavior

- The application correctly identified Arc Mainnet (Chain ID 5042).
- Employer and Provider roles were correctly recognized based on connected wallet address.
- Task status transitioned through Created → Funded → Submitted → Completed in the UI, matching on-chain state at each step.
- After `approveWork` confirmed, the application displayed:
  > "Payment released — USDC has been sent to the provider. This task is complete."
- This matches the on-chain final state (`tasks(1).state = 3 = Completed`). ✓

---

## 9. Transaction Checklist

| # | Transaction | Hash | Verified |
|---|---|---|---|
| 1 | Contract deployment | `0xe4dcab2f...bf1f32` | ✓ |
| 2 | ERC-20 USDC approval (prerequisite) | `0x733b9a52...a09fcd` | ✓ |
| 3 | createTask | `0x0e0e2104...8e97ec` | ✓ |
| 4 | fundTask | `0xf0b2ba5c...ca626` | ✓ |
| 5 | submitWork | `0x377bcd69...74ecd` | ✓ |
| 6 | approveWork + USDC transfer | `0x1d7d1511...e499c` | ✓ |

**All 6 transactions: SUCCESS on Arc Mainnet.**

---

## 10. Limitations and Remaining Items

| Item | Status |
|---|---|
| Pre-test Provider balance | Inferred, not directly verified (see Section 7) |
| Historical balance snapshots | Not available from RPC in this environment |
| Explorer links for all tx | Explorer at https://arc.etherscan.io/ — tx hashes above are queryable |
| Microgrants S-3 reference tx | `approveWork`: `0x1d7d1511e21dc272048a019d56fea7880e83fbad6a0ea9c96d7085fb38fe499c` |

---

## 11. Explorer Links

All transactions are queryable at **https://arc.etherscan.io/**

| Transaction | Link |
|---|---|
| Deploy | https://arc.etherscan.io/tx/0xe4dcab2f9d9fc518f62a698a9e5698c976cec50d156dc420baa174b944bf1f32 |
| USDC Approval | https://arc.etherscan.io/tx/0x733b9a52718c84c14228f765a8849f56acf578310461c56a8486cd8ad7a09fcd |
| createTask | https://arc.etherscan.io/tx/0x0e0e21043115ffa164090cffe211cca21c7e596c990c9f600860cb5a078e97ec |
| fundTask | https://arc.etherscan.io/tx/0xf0b2ba5cc19df6c86c5f45ba421263c3874f95de136453cc239f101f60bca626 |
| submitWork | https://arc.etherscan.io/tx/0x377bcd69ddbcecc45de0b49c5d088734adc37bbbb6f5cbc75efd38f0e7c74ecd |
| approveWork | https://arc.etherscan.io/tx/0x1d7d1511e21dc272048a019d56fea7880e83fbad6a0ea9c96d7085fb38fe499c |
| Contract | https://arc.etherscan.io/address/0xb705840BC901200CdF163c3d96f224d98e285B28 |
