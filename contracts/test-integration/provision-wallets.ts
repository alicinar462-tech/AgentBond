/**
 * Wallet provisioning script for AgentBondEscrow integration tests.
 * Creates two EOA wallets: employer and provider.
 * Run this first, then faucet_drip both addresses, then run the main test script.
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'node:crypto';

const walletsClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: (process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET)!,
});

const walletSetResp = await walletsClient.createWalletSet({
  name: `escrow-integration-test-${Date.now()}`,
  idempotencyKey: crypto.randomUUID(),
});
const walletSetId = walletSetResp.data?.walletSet?.id;
if (!walletSetId) throw new Error('Failed to create wallet set');

const walletsResp = await walletsClient.createWallets({
  blockchains: ['ARC-TESTNET'],
  count: 2,
  accountType: 'EOA',
  walletSetId,
  idempotencyKey: crypto.randomUUID(),
});

const wallets = walletsResp.data?.wallets;
if (!wallets || wallets.length < 2) throw new Error('Failed to create wallets');

const employer = wallets[0];
const provider = wallets[1];

console.log(JSON.stringify({
  phase: 'wallet_provisioning',
  walletSetId,
  employer: { walletId: employer.id, address: employer.address },
  provider: { walletId: provider.id, address: provider.address },
}));

process.exit(0);
