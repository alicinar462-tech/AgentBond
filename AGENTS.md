# AgentBond

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

AgentBond is an escrow-based USDC payment application for human and AI-powered work on Arc. Employers create tasks, fund them with USDC, and release payment to providers after approving submitted work.

## Contract

### AgentBondEscrow.sol — v1 (A-policy, deployed, do not modify)
- **Source:** `contracts/AgentBondEscrow.sol` at v1 commit (A-policy, single constructor arg)
- **Status:** Deployed on Arc Testnet — DO NOT MODIFY
- **Deployed address:** `0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC`
- **Deploy tx:** `0x2573c50f2116f9028ed1f6cfe8a7a411e45df57d40251ed1cd5ba2819f2f608b`
- **Explorer:** https://explorer.testnet.arc.io/address/0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC
- **Deployer wallet:** `0xbfc1d115d2c7850716f86dd3d057bf0d0ffc6a02` (Circle DCW)
- **Network:** ARC-TESTNET (Chain ID 5042002)
- **Constructor args:** `(address usdcToken)` — single arg (A-policy)
- **Policy:** A-policy — deadline-only refund logic, no reviewWindow

### AgentBondEscrow.sol — v2-test (B-policy test, reviewWindow=86400, integration test only)
- **Source:** `contracts/AgentBondEscrow.sol` (current, B-policy, two constructor args)
- **Status:** Deployed on Arc Testnet — INTEGRATION TEST ONLY, not production
- **Deployed address:** `0x9c291d4e676ecf3ee4794bc21c34a4fef2ab84c5`
- **Deploy tx:** `0xf213b886` (short form recorded; full hash from Circle SCP dashboard)
- **Network:** ARC-TESTNET (Chain ID 5042002)
- **Constructor args:** `(address usdcToken, uint256 reviewWindow_)` = `(0x3600000000000000000000000000000000000000, 86400)`
- **reviewWindow:** 86400 seconds (1 day) — test only
- **Policy:** B-policy — reviewWindow-based claimPayment(), see contracts/AgentBondEscrow.sol
- **Purpose:** Testnet integration testing of B-policy before 5-day production deploy

### AgentBondEscrow.sol — v2-test-3day (B-policy test, reviewWindow=259200) — 2026-10-23
- **Source:** `contracts/AgentBondEscrow.sol` (current, B-policy)
- **Status:** Deployed on Arc Testnet — INTEGRATION TEST ONLY
- **Deployed address:** `0x48f859a5fce7e0677470d25cec8e5acd833b2cad`
- **Deploy tx:** `0x9df02278b081b3fe8a2b2658f1017d63265c494f7fc2c305218de483bb01f175`
- **Explorer:** https://explorer.testnet.arc.io/address/0x48f859a5fce7e0677470d25cec8e5acd833b2cad
- **Network:** ARC-TESTNET (Chain ID 5042002)
- **Constructor args:** `(0x3600000000000000000000000000000000000000, 259200)`
- **reviewWindow:** 259200 seconds (3 days) — test only
- **On-chain verified:** reviewWindow=259200 ✓, usdc=0x3600…0000 ✓, nextTaskId=1 ✓, MIN=86400 ✓, MAX=2592000 ✓
- **T-7b (claimPayment success):** PASS (2026-10-26) — txHash=0x1f3388006033b2f84a442b4fff1056562ece5fb7962800fb28263aff64d21d0f, taskId=1 state=3(Completed), providerDelta=+995863, PaymentClaimed event confirmed on-chain, block=69171182
- **T-2..T-4 integration tests:** PASS (2026-10-23) — taskId=1 in Submitted state, early claimPayment correctly rejected with ReviewWindowNotExpired

### AgentBondEscrow.sol — v2-production (B-policy production, reviewWindow=432000) — NOT YET DEPLOYED
- **Status:** Pending user approval
- **Planned constructor args:** `(0x3600000000000000000000000000000000000000, 432000)`
- **reviewWindow:** 432000 seconds (5 days)
- **T-7 verification (1-day test contract):** PASS — txHash `0x32ef687f4d75d1e2ef7f85517aa2978e4db6aa3f720a196a7b47a59df810f4c5`, state=3(Completed), providerDelta=+998349 USDC units, PaymentClaimed event confirmed on-chain

### Task States (B-policy, current source)
`Created → Funded → Submitted → Completed` (terminal, via approveWork OR claimPayment)
`Funded → Refunded` (terminal, employer after deadline)
`Submitted → Refunded` (terminal, employer within reviewWindow)
`Submitted → Completed` (terminal, provider after reviewWindow via claimPayment)

### Tests
- **Test file:** `contracts/test/AgentBondEscrow.t.sol`
- **Run:** `forge test`
- **Last result:** 81/81 passed (B-policy, 8 suites: happy path, accounting, access control, state transitions, edge cases, reentrancy, fuzz, invariant)
- **Frontend tests:** 88/88 passed (vitest)

### USDC Addresses
- **Arc Testnet (Chain ID 5042002):** `0x3600000000000000000000000000000000000000`
- **Arc Mainnet (Chain ID 5042):** `0x3600000000000000000000000000000000000000`

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
