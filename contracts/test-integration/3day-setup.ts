/**
 * 3-day reviewWindow contract (0x48f859…) — B-policy setup test
 *
 * Runs T-2 through T-4 equivalent against the 3-day contract:
 *   T-2: createTask → USDC approve → fundTask → submitWork
 *   T-3: approveWork (employer approval path, separate task)
 *   T-4: claimPayment BEFORE window → expect ReviewWindowNotExpired revert
 *
 * Does NOT simulate time. T-7b (claimPayment success) requires
 * 3 days to elapse on-chain and must be run separately.
 *
 * Env vars (no secrets printed):
 *   EMPLOYER_WALLET_ID, EMPLOYER_WALLET_ADDRESS
 *   PROVIDER_WALLET_ID, PROVIDER_WALLET_ADDRESS
 *   CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createPublicClient, http, parseAbi, encodeAbiParameters, parseAbiParameters } from 'viem';
import crypto from 'node:crypto';

// ─── Config ─────────────────────────────────────────────────────────────────

const NETWORK = 'ARC-TESTNET';
const RPC_URL = 'https://rpc.testnet.arc.io';
const ESCROW_ADDRESS = '0x48f859a5fce7e0677470d25cec8e5acd833b2cad' as const;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
const REVIEW_WINDOW = 259200n; // 3 days

if (!/(TESTNET|SEPOLIA|AMOY|FUJI|BLAZE|ALFAJORES|APOTHEM|DEVNET|HOLESKY)/.test(NETWORK)) {
  console.error(JSON.stringify({ status: 'FAIL', detail: `refusing non-testnet: ${NETWORK}` }));
  process.exit(1);
}

const EMPLOYER_WALLET_ID = process.env.EMPLOYER_WALLET_ID!;
const EMPLOYER_ADDRESS = process.env.EMPLOYER_WALLET_ADDRESS! as `0x${string}`;
const PROVIDER_WALLET_ID = process.env.PROVIDER_WALLET_ID!;
const PROVIDER_ADDRESS = process.env.PROVIDER_WALLET_ADDRESS! as `0x${string}`;
const apiKey = process.env.CIRCLE_API_KEY!;
const entitySecret = (process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET)!;

if (!EMPLOYER_WALLET_ID || !EMPLOYER_ADDRESS || !PROVIDER_WALLET_ID || !PROVIDER_ADDRESS) {
  console.error(JSON.stringify({ status: 'ERROR', detail: 'Missing wallet env vars' }));
  process.exit(1);
}

const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

// ─── ABI ─────────────────────────────────────────────────────────────────────

const ESCROW_ABI = parseAbi([
  'function reviewWindow() view returns (uint256)',
  'function nextTaskId() view returns (uint256)',
  'function tasks(uint256) view returns (address employer, address provider, string description, uint256 amount, uint256 deadline, uint256 submissionTime, uint8 state)',
  'function createTask(address,string,uint256,uint256) returns (uint256)',
  'function fundTask(uint256)',
  'function submitWork(uint256)',
  'function approveWork(uint256)',
  'function claimPayment(uint256)',
]);

const USDC_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED']);

async function waitForTerminal(txId: string, timeoutMs = 180_000): Promise<{ state: string; txHash?: string; errorDetails?: string }> {
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
  throw new Error(`Tx ${txId} timed out`);
}

async function sendTx(walletId: string, contractAddress: string, sig: string, params: string[], label: string) {
  const resp = await walletsClient.createContractExecutionTransaction({
    walletId,
    contractAddress,
    abiFunctionSignature: sig,
    abiParameters: params,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  });
  const txId = resp.data?.id;
  if (!txId) throw new Error(`${label}: failed to initiate`);
  console.log(JSON.stringify({ event: `${label}-submitted`, txId }));
  const result = await waitForTerminal(txId);
  console.log(JSON.stringify({ event: `${label}-terminal`, ...result }));
  return result;
}

function pass(name: string, detail: string) {
  console.log(JSON.stringify({ testName: name, status: 'PASS', detail }));
}
function fail(name: string, detail: string) {
  console.log(JSON.stringify({ testName: name, status: 'FAIL', detail }));
  process.exit(1);
}

// ─── T-1: Verify reviewWindow on 3-day contract ──────────────────────────────

console.log(JSON.stringify({ event: 'start', escrow: ESCROW_ADDRESS }));

const rwOnChain = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'reviewWindow' });
if (rwOnChain !== REVIEW_WINDOW) fail('T-1: reviewWindow', `Expected 259200, got ${rwOnChain}`);
pass('T-1: reviewWindow', `reviewWindow=${rwOnChain} (3 days) confirmed on-chain`);

const nextIdBefore = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' });
console.log(JSON.stringify({ event: 'nextTaskId-before', nextTaskId: nextIdBefore.toString() }));

// ─── T-2: createTask → approve → fundTask → submitWork ───────────────────────

const nowSec = BigInt(Math.floor(Date.now() / 1000));
const deadline = nowSec + BigInt(2 * 24 * 3600); // 2 days from now
const taskAmount = 1_000_000n; // 1 USDC

// createTask
const createResult = await sendTx(
  EMPLOYER_WALLET_ID, ESCROW_ADDRESS,
  'createTask(address,string,uint256,uint256)',
  [PROVIDER_ADDRESS, '3day-integration-test', taskAmount.toString(), deadline.toString()],
  'T2-createTask',
);
if (createResult.state !== 'COMPLETE') fail('T-2: createTask', `tx ended in ${createResult.state}: ${createResult.errorDetails}`);

// Read taskId (nextTaskId was N before create, so taskId = N)
const taskId = nextIdBefore; // createTask uses nextTaskId then increments
const taskIdStr = taskId.toString();
console.log(JSON.stringify({ event: 'T2-taskId', taskId: taskIdStr, createTxHash: createResult.txHash }));

// Verify task created
const taskCreated = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [taskId] });
if (taskCreated[6] !== 0) fail('T-2: task state after create', `Expected Created(0), got ${taskCreated[6]}`);
console.log(JSON.stringify({ event: 'T2-task-created', taskId: taskIdStr, state: taskCreated[6], amount: taskCreated[3].toString() }));

// USDC approve
const allowanceBefore = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'allowance', args: [EMPLOYER_ADDRESS, ESCROW_ADDRESS] });
console.log(JSON.stringify({ event: 'T2-allowance-before', allowance: allowanceBefore.toString() }));

const approveResult = await sendTx(
  EMPLOYER_WALLET_ID, USDC_ADDRESS,
  'approve(address,uint256)',
  [ESCROW_ADDRESS, taskAmount.toString()],
  'T2-usdcApprove',
);
if (approveResult.state !== 'COMPLETE') fail('T-2: USDC approve', `tx ended in ${approveResult.state}: ${approveResult.errorDetails}`);

// fundTask
const fundResult = await sendTx(
  EMPLOYER_WALLET_ID, ESCROW_ADDRESS,
  'fundTask(uint256)',
  [taskIdStr],
  'T2-fundTask',
);
if (fundResult.state !== 'COMPLETE') fail('T-2: fundTask', `tx ended in ${fundResult.state}: ${fundResult.errorDetails}`);

const taskFunded = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [taskId] });
if (taskFunded[6] !== 1) fail('T-2: state after fundTask', `Expected Funded(1), got ${taskFunded[6]}`);

// submitWork
const submitResult = await sendTx(
  PROVIDER_WALLET_ID, ESCROW_ADDRESS,
  'submitWork(uint256)',
  [taskIdStr],
  'T2-submitWork',
);
if (submitResult.state !== 'COMPLETE') fail('T-2: submitWork', `tx ended in ${submitResult.state}: ${submitResult.errorDetails}`);

const taskSubmitted = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [taskId] });
if (taskSubmitted[6] !== 2) fail('T-2: state after submitWork', `Expected Submitted(2), got ${taskSubmitted[6]}`);
if (taskSubmitted[5] === 0n) fail('T-2: submissionTime', 'submissionTime is 0 after submitWork');

const submissionTime = taskSubmitted[5];
const releaseTime = submissionTime + REVIEW_WINDOW;
const releaseTimeUTC = new Date(Number(releaseTime) * 1000).toISOString();

pass('T-2: createTask→fundTask→submitWork', `taskId=${taskIdStr} state=2(Submitted) submissionTime=${submissionTime} createTxHash=${createResult.txHash} fundTxHash=${fundResult.txHash} submitTxHash=${submitResult.txHash}`);
console.log(JSON.stringify({ event: 'T2-timing', taskId: taskIdStr, submissionTime: submissionTime.toString(), reviewWindow: REVIEW_WINDOW.toString(), releaseTime: releaseTime.toString(), releaseTimeUTC }));

// ─── T-3: approveWork on a SEPARATE task ─────────────────────────────────────

const nextIdForT3 = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' });
const deadlineT3 = nowSec + BigInt(2 * 24 * 3600);

const createT3 = await sendTx(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, 'createTask(address,string,uint256,uint256)',
  [PROVIDER_ADDRESS, '3day-approveWork-test', taskAmount.toString(), deadlineT3.toString()], 'T3-createTask');
if (createT3.state !== 'COMPLETE') fail('T-3: createTask', `${createT3.state}: ${createT3.errorDetails}`);

const taskIdT3 = nextIdForT3;
const taskIdT3Str = taskIdT3.toString();

const approveT3 = await sendTx(EMPLOYER_WALLET_ID, USDC_ADDRESS, 'approve(address,uint256)',
  [ESCROW_ADDRESS, taskAmount.toString()], 'T3-usdcApprove');
if (approveT3.state !== 'COMPLETE') fail('T-3: USDC approve', `${approveT3.state}: ${approveT3.errorDetails}`);

const fundT3 = await sendTx(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, 'fundTask(uint256)',
  [taskIdT3Str], 'T3-fundTask');
if (fundT3.state !== 'COMPLETE') fail('T-3: fundTask', `${fundT3.state}: ${fundT3.errorDetails}`);

const submitT3 = await sendTx(PROVIDER_WALLET_ID, ESCROW_ADDRESS, 'submitWork(uint256)',
  [taskIdT3Str], 'T3-submitWork');
if (submitT3.state !== 'COMPLETE') fail('T-3: submitWork', `${submitT3.state}: ${submitT3.errorDetails}`);

const provBalBefore = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [PROVIDER_ADDRESS] });

const approveWorkT3 = await sendTx(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, 'approveWork(uint256)',
  [taskIdT3Str], 'T3-approveWork');
if (approveWorkT3.state !== 'COMPLETE') fail('T-3: approveWork', `${approveWorkT3.state}: ${approveWorkT3.errorDetails}`);

const taskT3After = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [taskIdT3] });
if (taskT3After[6] !== 3) fail('T-3: state after approveWork', `Expected Completed(3), got ${taskT3After[6]}`);

const provBalAfter = await publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [PROVIDER_ADDRESS] });
const provDelta = provBalAfter - provBalBefore;
if (provDelta < taskAmount / 2n) fail('T-3: provider balance delta', `delta=${provDelta} < expected ~${taskAmount}`);

pass('T-3: approveWork', `taskId=${taskIdT3Str} state=3(Completed) providerDelta=+${provDelta} txHash=${approveWorkT3.txHash}`);

// ─── T-4: claimPayment BEFORE window — must revert ───────────────────────────

const claimEarlyResult = await sendTx(
  PROVIDER_WALLET_ID, ESCROW_ADDRESS,
  'claimPayment(uint256)',
  [taskIdStr],
  'T4-claimPayment-early',
);

// Expect FAILED (ReviewWindowNotExpired revert)
if (claimEarlyResult.state === 'COMPLETE') {
  fail('T-4: early claimPayment must revert', 'Expected FAILED but tx COMPLETE — contract did NOT enforce reviewWindow');
}

// Verify task still Submitted
const taskAfterEarlyAttempt = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'tasks', args: [taskId] });
if (taskAfterEarlyAttempt[6] !== 2) fail('T-4: task state unchanged', `Expected Submitted(2) after failed claim, got ${taskAfterEarlyAttempt[6]}`);

pass('T-4: early claimPayment rejected', `tx FAILED as expected (ReviewWindowNotExpired). taskId=${taskIdStr} state still 2(Submitted). errorDetails=${claimEarlyResult.errorDetails ?? 'n/a'}`);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(JSON.stringify({
  event: 'SETUP-COMPLETE',
  contract: ESCROW_ADDRESS,
  reviewWindow: REVIEW_WINDOW.toString(),
  T7b: {
    taskId: taskIdStr,
    submissionTime: submissionTime.toString(),
    releaseTime: releaseTime.toString(),
    releaseTimeUTC,
    providerWalletId: PROVIDER_WALLET_ID,
    providerAddress: PROVIDER_ADDRESS,
    runCommand: `TASK_ID=${taskIdStr} PROVIDER_WALLET_ID=${PROVIDER_WALLET_ID} PROVIDER_WALLET_ADDRESS=${PROVIDER_ADDRESS} ESCROW_ADDRESS=0x48f859a5fce7e0677470d25cec8e5acd833b2cad REVIEW_WINDOW=259200 bun run contracts/test-integration/T7b-claimPayment-3day.ts`,
  },
}));
