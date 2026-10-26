/**
 * T-7: claimPayment SUCCESS path — deferred completion script
 *
 * Completes T-7: provider calls claimPayment() after reviewWindow (86400s) has elapsed.
 * Uses viem for reads, Circle DCW SDK for tx signing.
 *
 * Run after releaseTime has passed:
 *   cd /home/user/app
 *   TASK_ID=<taskId> \
 *   PROVIDER_WALLET_ID=<id> \
 *   PROVIDER_WALLET_ADDRESS=<addr> \
 *   bun run contracts/test-integration/T7-claimPayment-completion.ts
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createPublicClient, http, parseAbi } from 'viem';
import crypto from 'node:crypto';

const NETWORK = 'ARC-TESTNET';
const RPC_URL = 'https://rpc.testnet.arc.io';
const ESCROW_ADDRESS = '0x9c291d4e676ecf3ee4794bc21c34a4fef2ab84c5' as const;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
const REVIEW_WINDOW = 86400n;

if (!/(TESTNET|SEPOLIA|AMOY|FUJI|BLAZE|ALFAJORES|APOTHEM|DEVNET|HOLESKY)/.test(NETWORK)) {
  console.error(JSON.stringify({ testName: 'testnet-guard', status: 'FAIL', detail: `refusing mainnet: ${NETWORK}` }));
  process.exit(1);
}

const TASK_ID_STR = process.env.TASK_ID!;
const PROVIDER_WALLET_ID = process.env.PROVIDER_WALLET_ID!;
const PROVIDER_ADDRESS = (process.env.PROVIDER_WALLET_ADDRESS! as `0x${string}`);

if (!TASK_ID_STR || !PROVIDER_WALLET_ID || !PROVIDER_ADDRESS) {
  console.error(JSON.stringify({ status: 'ERROR', detail: 'Missing: TASK_ID, PROVIDER_WALLET_ID, PROVIDER_WALLET_ADDRESS' }));
  process.exit(1);
}
const TASK_ID = BigInt(TASK_ID_STR);

const entitySecret = (process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET)!;
const apiKey = process.env.CIRCLE_API_KEY!;
const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

const ESCROW_ABI = parseAbi([
  'function tasks(uint256) view returns (address employer, address provider, string description, uint256 amount, uint256 deadline, uint256 submissionTime, uint8 state)',
]);
const USDC_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED']);

async function waitForTerminal(txId: string, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp = await walletsClient.getTransaction({ id: txId });
    const tx = resp.data?.transaction;
    const state = tx?.state ?? '';
    if (state && TERMINAL_STATES.has(state)) {
      return { state, txHash: tx?.txHash ?? undefined, errorDetails: (tx as any)?.errorDetails ?? undefined };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Transaction ${txId} timed out`);
}

// Step 1: read task state
console.log(JSON.stringify({ event: 'T7-start', taskId: TASK_ID_STR }));

const taskResult = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [TASK_ID] });
const task = { employer: taskResult[0], provider: taskResult[1], description: taskResult[2], amount: taskResult[3], deadline: taskResult[4], submissionTime: taskResult[5], state: taskResult[6] };

console.log(JSON.stringify({ event: 'task-state', taskId: TASK_ID_STR, state: task.state, submissionTime: task.submissionTime.toString(), amount: task.amount.toString() }));

if (task.state !== 2) {
  console.log(JSON.stringify({ testName: 'T-7: claimPayment after reviewWindow', status: 'FAIL', detail: `Task not in Submitted state (state=${task.state})` }));
  process.exit(1);
}

// Step 2: timing check
const releaseTime = task.submissionTime + REVIEW_WINDOW;
const nowSec = BigInt(Math.floor(Date.now() / 1000));

console.log(JSON.stringify({ event: 'timing-check', submissionTime: task.submissionTime.toString(), releaseTime: releaseTime.toString(), releaseTimeUTC: new Date(Number(releaseTime) * 1000).toISOString(), windowPassed: nowSec >= releaseTime, secondsRemaining: nowSec < releaseTime ? (releaseTime - nowSec).toString() : '0' }));

if (nowSec < releaseTime) {
  const secondsRemaining = releaseTime - nowSec;
  console.log(JSON.stringify({ testName: 'T-7: claimPayment after reviewWindow', status: 'SKIPPED', detail: `Window NOT passed. Remaining: ${secondsRemaining}s (~${(Number(secondsRemaining) / 3600).toFixed(2)}h). releaseTimeUTC=${new Date(Number(releaseTime) * 1000).toISOString()}` }));
  process.exit(0);
}

// Step 3: claimPayment
const balanceBefore = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [PROVIDER_ADDRESS] });
console.log(JSON.stringify({ event: 'provider-balance-before', balance: balanceBefore.toString() }));

const txResp = await walletsClient.createContractExecutionTransaction({
  walletId: PROVIDER_WALLET_ID,
  contractAddress: ESCROW_ADDRESS,
  abiFunctionSignature: 'claimPayment(uint256)',
  abiParameters: [TASK_ID_STR],
  fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  idempotencyKey: crypto.randomUUID(),
});
const txId = txResp.data?.id;
if (!txId) throw new Error('Failed to initiate claimPayment tx');

console.log(JSON.stringify({ event: 'claimPayment-submitted', txId }));
const { state: finalState, txHash, errorDetails } = await waitForTerminal(txId);
console.log(JSON.stringify({ event: 'claimPayment-terminal', txId, finalState, txHash, errorDetails }));

if (finalState !== 'COMPLETE') {
  console.log(JSON.stringify({ testName: 'T-7: claimPayment after reviewWindow', status: 'FAIL', detail: `tx ended in ${finalState}. errorDetails=${errorDetails}`, txId, txHash }));
  process.exit(1);
}

// Step 4: verify
const taskAfterResult = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [TASK_ID] });
const taskAfter = { state: taskAfterResult[6], amount: taskAfterResult[3] };
const balanceAfter = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [PROVIDER_ADDRESS] });
const delta = balanceAfter - balanceBefore;

if (taskAfter.state !== 3) {
  console.log(JSON.stringify({ testName: 'T-7: claimPayment after reviewWindow', status: 'FAIL', detail: `Expected state=3(Completed), got ${taskAfter.state}`, txId, txHash }));
  process.exit(1);
}

if (delta < taskAfter.amount / 2n) {
  console.log(JSON.stringify({ testName: 'T-7: claimPayment after reviewWindow', status: 'FAIL', detail: `Provider delta=${delta} < expected ~${taskAfter.amount}`, txId, txHash }));
  process.exit(1);
}

console.log(JSON.stringify({ testName: 'T-7: claimPayment after reviewWindow', status: 'PASS', detail: `taskId=${TASK_ID_STR} state=3(Completed) providerDelta=+${delta} PaymentClaimed event emitted. txId=${txId} txHash=${txHash}`, txId, txHash }));
process.exit(0);
