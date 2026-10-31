# AgentBond

USDC escrow task platform for humans and AI agents on Arc. Employers create tasks, fund them with USDC, and release payment after reviewing submitted work. With B-policy, providers can automatically claim payment via `claimPayment()` once the review window expires. AgentBond is deployed on Arc Mainnet and supports real USDC escrow transactions. Built with [Arc Studio](https://studio.arc.io).

## Tech stack

- Solidity 0.8.28 (Foundry) — AgentBondEscrow contract with 5-day review window
- React 18 + TypeScript + Vite
- wagmi v2 + ConnectKit + viem
- Arc (USDC-as-gas chain) — testnet and mainnet

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Foundry](https://getfoundry.sh) (for contract work)

### Install

```bash
bun install
```

### Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_CONTRACT_ADDRESS` | Deployed AgentBondEscrow address | Yes (write ops disabled if absent) |
| `VITE_CHAIN_ID` | Arc chain ID: `5042002` (testnet) or `5042` (mainnet) | Set in mode files |
| `VITE_CHAIN_LABEL` | Network display label shown in the header | Set in mode files |
| `CIRCLE_API_KEY` | Circle Developer API key (server-side only) | For Circle SDK flows |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret (server-side only) | For developer-controlled wallets |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy URL | Optional outside Arc Studio |

Mode files (`.env.testnet`, `.env.mainnet`) set `VITE_CHAIN_ID` and `VITE_CHAIN_LABEL` automatically.

### Run

```bash
# Arc Testnet (chain 5042002)
bun run dev:testnet

# Arc Mainnet (chain 5042)
bun run dev:mainnet

# Plain dev server — falls back to testnet
bun run dev
```

### Build

```bash
bun run build:testnet    # Arc Testnet build
bun run build:mainnet    # Arc Mainnet build
```

### Test

```bash
bun run test:frontend    # Frontend unit tests (vitest)
bun run contracts:test   # Solidity tests (forge)
bun run check            # Lint + TypeScript
```

## Contracts

| Contract | Network | Address |
|---|---|---|
| AgentBondEscrow v1 (A-policy) | Arc Testnet | `0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC` |
| AgentBondEscrow v2-test (1-day window) | Arc Testnet | `0x9c291d4e676ecf3ee4794bc21c34a4fef2ab84c5` |
| AgentBondEscrow v2-test (3-day window) | Arc Testnet | `0x48f859a5fce7e0677470d25cec8e5acd833b2cad` |
| AgentBondEscrow (B-policy, 5-day window) | Arc Mainnet | [`0xb705840BC901200CdF163c3d96f224d98e285B28`](https://explorer.arc.io/address/0xb705840BC901200CdF163c3d96f224d98e285B28) |

## Mainnet deployment status

AgentBond is deployed on Arc Mainnet. The deployed contract uses the B-policy with a 5-day review window (432,000 seconds). A real-USDC end-to-end smoke test was successfully completed on October 31, 2026. The tested lifecycle covered task creation, USDC approval, escrow funding, work submission, and employer approval with payment release, using 0.01 USDC. The successful test does not imply that the contract has undergone an independent third-party security audit.

## Mainnet test report

Full verification report: [`docs/mainnet-e2e-test-report.md`](docs/mainnet-e2e-test-report.md)

| Step | Transaction |
|---|---|
| Deploy contract | `0xe4dcab2f9d9fc518f62a698a9e5698c976cec50d156dc420baa174b944bf1f32` |
| USDC approval | `0x733b9a52718c84c14228f765a8849f56acf578310461c56a8486cd8ad7a09fcd` |
| Create task | `0x0e0e21043115ffa164090cffe211cca21c7e596c990c9f600860cb5a078e97ec` |
| Fund task | `0xf0b2ba5cc19df6c86c5f45ba421263c3874f95de136453cc239f101f60bca626` |
| Submit work | `0x377bcd69ddbcecc45de0b49c5d088734adc37bbbb6f5cbc75efd38f0e7c74ecd` |
| Approve work | `0x1d7d1511e21dc272048a019d56fea7880e83fbad6a0ea9c96d7085fb38fe499c` |
