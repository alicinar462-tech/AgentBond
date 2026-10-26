/**
 * AgentBondEscrow — live-SCP integration test suite
 *
 * Network: ARC-TESTNET (chain ID 5042002)
 * Contract (v2-test, reviewWindow=86400): 0x9c291d4e676ecf3ee4794bc21c34a4fef2ab84c5
 *
 * Uses Circle developer-controlled wallets for tx signing and
 * direct RPC eth_call for read operations (SCP queryContract
 * does not populate outputValues on this endpoint).
 *
 * Run:
 *   cd /home/user/app
 *   EMPLOYER_WALLET_ID=<id> EMPLOYER_WALLET_ADDRESS=<addr> \
 *   PROVIDER_WALLET_ID=<id> PROVIDER_WALLET_ADDRESS=<addr> \
 *   bun run contracts/test-integration/AgentBondEscrow.integration.test.ts
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import crypto from 'node:crypto';
import {
  createPublicClient, http, decodeFunctionResult, encodeFunctionData,
  parseAbi, type Abi,
} from 'viem';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK = 'ARC-TESTNET';
const RPC_URL = 'https://rpc.testnet.arc.io';
const ESCROW_ADDRESS = '0x9c291d4e676ecf3ee4794bc21c34a4fef2ab84c5' as const;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

// Testnet guard
if (!/(TESTNET|SEPOLIA|AMOY|FUJI|BLAZE|ALFAJORES|APOTHEM|DEVNET|HOLESKY)/.test(NETWORK)) {
  console.error(JSON.stringify({ testName: 'testnet-guard', status: 'FAIL', detail: `refusing non-testnet: ${NETWORK}` }));
  process.exit(1);
}

// Wallet env vars
const EMPLOYER_WALLET_ID = process.env.EMPLOYER_WALLET_ID!;
const EMPLOYER_ADDRESS = (process.env.EMPLOYER_WALLET_ADDRESS! as `0x${string}`);
const PROVIDER_WALLET_ID = process.env.PROVIDER_WALLET_ID!;
const PROVIDER_ADDRESS = (process.env.PROVIDER_WALLET_ADDRESS! as `0x${string}`);

if (!EMPLOYER_WALLET_ID || !EMPLOYER_ADDRESS || !PROVIDER_WALLET_ID || !PROVIDER_ADDRESS) {
  console.error(JSON.stringify({ testName: 'wallet-env-check', status: 'FAIL', detail: 'Missing wallet env vars' }));
  process.exit(1);
}

// SDK client (wallets only — reads go via RPC)
const entitySecret = (process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET)!;
const apiKey = process.env.CIRCLE_API_KEY!;
const walletsClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

// viem public client for read calls
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

// ─────────────────────────────────────────────────────────────────────────────
// ABI fragments
// ─────────────────────────────────────────────────────────────────────────────

const ESCROW_ABI = parseAbi([
  'function reviewWindow() view returns (uint256)',
  'function usdc() view returns (address)',
  'function nextTaskId() view returns (uint256)',
  'function MIN_REVIEW_WINDOW() view returns (uint256)',
  'function MAX_REVIEW_WINDOW() view returns (uint256)',
  'function tasks(uint256) view returns (address employer, address provider, string description, uint256 amount, uint256 deadline, uint256 submissionTime, uint8 state)',
]);

const USDC_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  throw new Error(`Transaction ${txId} did not reach terminal state within ${timeoutMs}ms`);
}

type Result = {
  testName: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  detail?: string;
  txId?: string;
  txHash?: string;
  expected?: string;
  actual?: string;
  durationMs?: number;
};

const results: Result[] = [];
function log(r: Result) { results.push(r); console.log(JSON.stringify(r)); }

async function queryTask(taskId: bigint) {
  const result = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'tasks',
    args: [taskId],
  });
  return {
    employer: result[0],
    provider: result[1],
    description: result[2],
    amount: result[3],
    deadline: result[4],
    submissionTime: result[5],
    state: result[6],
  };
}

async function queryUsdcBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [address] });
}

async function sendEscrowTx(
  walletId: string,
  fnSig: string,
  params: string[],
  label: string,
): Promise<{ txId: string; finalState: string; txHash?: string; errorDetails?: string }> {
  const txResp = await walletsClient.createContractExecutionTransaction({
    walletId,
    contractAddress: ESCROW_ADDRESS,
    abiFunctionSignature: fnSig,
    abiParameters: params,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  });
  const txId = txResp.data?.id;
  if (!txId) throw new Error(`${label}: Failed to initiate tx`);
  const { state, txHash, errorDetails } = await waitForTerminal(txId);
  return { txId, finalState: state, txHash, errorDetails };
}

async function sendUsdcApprove(walletId: string, spender: string, amount: string, label: string) {
  const txResp = await walletsClient.createContractExecutionTransaction({
    walletId,
    contractAddress: USDC_ADDRESS,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [spender, amount],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: crypto.randomUUID(),
  });
  const txId = txResp.data?.id;
  if (!txId) throw new Error(`${label}: Failed to initiate approval tx`);
  const { state, txHash } = await waitForTerminal(txId);
  return { txId, finalState: state, txHash };
}

// ─────────────────────────────────────────────────────────────────────────────
// T-1: On-chain configuration verification
// ─────────────────────────────────────────────────────────────────────────────

{
  const t0 = Date.now();
  try {
    const [rw, usdcAddr, nextId, minRw, maxRw] = await Promise.all([
      publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'reviewWindow' }),
      publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'usdc' }),
      publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' }),
      publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'MIN_REVIEW_WINDOW' }),
      publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'MAX_REVIEW_WINDOW' }),
    ]);

    const allOk =
      rw === 86400n &&
      usdcAddr.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
      nextId >= 1n &&
      minRw === 86400n &&
      maxRw === 2592000n;

    log({
      testName: 'T-1: on-chain configuration verification',
      status: allOk ? 'PASS' : 'FAIL',
      detail: `reviewWindow=${rw} usdc=${usdcAddr} nextTaskId=${nextId} MIN_REVIEW_WINDOW=${minRw} MAX_REVIEW_WINDOW=${maxRw}`,
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    log({ testName: 'T-1: on-chain configuration verification', status: 'FAIL', detail: String(err), durationMs: Date.now() - t0 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-2: createTask → fundTask → submitWork
// ─────────────────────────────────────────────────────────────────────────────

let T2_TASK_ID = 0n;
let T2_SUBMISSION_TIME = 0n;

{
  const t0 = Date.now();
  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 24 * 3600);
    const amount = '1000000'; // 1 USDC

    // Read nextTaskId to predict taskId
    const nextId = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' });
    T2_TASK_ID = nextId;

    // createTask
    const ct = await sendEscrowTx(
      EMPLOYER_WALLET_ID,
      'createTask(address,string,uint256,uint256)',
      [PROVIDER_ADDRESS, 'integration-test-b-policy', amount, deadline.toString()],
      'T-2 createTask',
    );
    if (ct.finalState !== 'COMPLETE') throw new Error(`createTask FAILED: ${ct.finalState} — ${ct.errorDetails}`);

    // approve USDC
    const ap = await sendUsdcApprove(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, amount, 'T-2 approve');
    if (ap.finalState !== 'COMPLETE') throw new Error(`approve FAILED: ${ap.finalState}`);

    // fundTask — taskId as decimal string
    const ft = await sendEscrowTx(EMPLOYER_WALLET_ID, 'fundTask(uint256)', [T2_TASK_ID.toString()], 'T-2 fundTask');
    if (ft.finalState !== 'COMPLETE') throw new Error(`fundTask FAILED: ${ft.finalState} — ${ft.errorDetails}`);

    // submitWork
    const sw = await sendEscrowTx(PROVIDER_WALLET_ID, 'submitWork(uint256)', [T2_TASK_ID.toString()], 'T-2 submitWork');
    if (sw.finalState !== 'COMPLETE') throw new Error(`submitWork FAILED: ${sw.finalState} — ${sw.errorDetails}`);

    // Verify via RPC
    const task = await queryTask(T2_TASK_ID);
    T2_SUBMISSION_TIME = task.submissionTime;

    if (task.state !== 2) throw new Error(`Expected state=2 (Submitted), got ${task.state}`);
    if (T2_SUBMISSION_TIME === 0n) throw new Error('submissionTime is 0 after submitWork');

    log({
      testName: 'T-2: createTask → fundTask → submitWork',
      status: 'PASS',
      detail: `taskId=${T2_TASK_ID} state=${task.state}(Submitted) submissionTime=${T2_SUBMISSION_TIME} createTask.txHash=${ct.txHash} fundTask.txHash=${ft.txHash} submitWork.txHash=${sw.txHash}`,
      txHash: ct.txHash,
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    log({ testName: 'T-2: createTask → fundTask → submitWork', status: 'FAIL', detail: String(err), durationMs: Date.now() - t0 });
    T2_TASK_ID = 0n;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-3: approveWork (employer approval path) — fresh task
// ─────────────────────────────────────────────────────────────────────────────

{
  const t0 = Date.now();
  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 24 * 3600);
    const amount = '1000000';

    const nextId = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' });
    const t3TaskId = nextId;

    const ct = await sendEscrowTx(
      EMPLOYER_WALLET_ID,
      'createTask(address,string,uint256,uint256)',
      [PROVIDER_ADDRESS, 'integration-test-approve-path', amount, deadline.toString()],
      'T-3 createTask',
    );
    if (ct.finalState !== 'COMPLETE') throw new Error(`createTask FAILED: ${ct.finalState} — ${ct.errorDetails}`);

    const ap = await sendUsdcApprove(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, amount, 'T-3 approve');
    if (ap.finalState !== 'COMPLETE') throw new Error(`approve FAILED: ${ap.finalState}`);

    const ft = await sendEscrowTx(EMPLOYER_WALLET_ID, 'fundTask(uint256)', [t3TaskId.toString()], 'T-3 fundTask');
    if (ft.finalState !== 'COMPLETE') throw new Error(`fundTask FAILED: ${ft.finalState} — ${ft.errorDetails}`);

    const sw = await sendEscrowTx(PROVIDER_WALLET_ID, 'submitWork(uint256)', [t3TaskId.toString()], 'T-3 submitWork');
    if (sw.finalState !== 'COMPLETE') throw new Error(`submitWork FAILED: ${sw.finalState} — ${sw.errorDetails}`);

    const balanceBefore = await queryUsdcBalance(PROVIDER_ADDRESS);

    const aw = await sendEscrowTx(EMPLOYER_WALLET_ID, 'approveWork(uint256)', [t3TaskId.toString()], 'T-3 approveWork');
    if (aw.finalState !== 'COMPLETE') throw new Error(`approveWork FAILED: ${aw.finalState} — ${aw.errorDetails}`);

    const task = await queryTask(t3TaskId);
    const balanceAfter = await queryUsdcBalance(PROVIDER_ADDRESS);

    if (task.state !== 3) throw new Error(`Expected state=3 (Completed), got ${task.state}`);
    const delta = balanceAfter - balanceBefore;
    if (delta < 500_000n) throw new Error(`Provider delta=${delta}, expected ~1000000`);

    log({
      testName: 'T-3: approveWork (employer approval path)',
      status: 'PASS',
      detail: `taskId=${t3TaskId} state=${task.state}(Completed) providerDelta=+${delta} approveWork.txHash=${aw.txHash}`,
      txHash: aw.txHash,
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    log({ testName: 'T-3: approveWork (employer approval path)', status: 'FAIL', detail: String(err), durationMs: Date.now() - t0 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-4: claimPayment BEFORE reviewWindow — must revert
// ─────────────────────────────────────────────────────────────────────────────

{
  const t0 = Date.now();
  try {
    if (T2_TASK_ID === 0n) throw new Error('T-2 taskId not available (T-2 failed)');

    const cp = await sendEscrowTx(PROVIDER_WALLET_ID, 'claimPayment(uint256)', [T2_TASK_ID.toString()], 'T-4 claimPayment');

    if (cp.finalState !== 'FAILED') {
      throw new Error(`Expected claimPayment to FAIL (ReviewWindowNotExpired), got ${cp.finalState}`);
    }

    const task = await queryTask(T2_TASK_ID);
    if (task.state !== 2) throw new Error(`Expected state=2 (Submitted) after failed claimPayment, got ${task.state}`);

    log({
      testName: 'T-4: claimPayment before reviewWindow reverts',
      status: 'PASS',
      detail: `taskId=${T2_TASK_ID} txFinalState=FAILED(expected) taskStateStill=${task.state}(Submitted) error=ReviewWindowNotExpired txId=${cp.txId}`,
      txId: cp.txId,
      expected: 'FAILED (ReviewWindowNotExpired)',
      actual: 'FAILED',
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    log({ testName: 'T-4: claimPayment before reviewWindow reverts', status: 'FAIL', detail: String(err), durationMs: Date.now() - t0 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-5: requestRefund from Funded state (short deadline)
// ─────────────────────────────────────────────────────────────────────────────

{
  const t0 = Date.now();
  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 65);
    const amount = '1000000';

    const nextId = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' });
    const t5TaskId = nextId;

    const ct = await sendEscrowTx(
      EMPLOYER_WALLET_ID,
      'createTask(address,string,uint256,uint256)',
      [PROVIDER_ADDRESS, 'integration-test-refund-deadline', amount, deadline.toString()],
      'T-5 createTask',
    );
    if (ct.finalState !== 'COMPLETE') throw new Error(`createTask FAILED: ${ct.finalState} — ${ct.errorDetails}`);

    const ap = await sendUsdcApprove(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, amount, 'T-5 approve');
    if (ap.finalState !== 'COMPLETE') throw new Error(`approve FAILED: ${ap.finalState}`);

    const ft = await sendEscrowTx(EMPLOYER_WALLET_ID, 'fundTask(uint256)', [t5TaskId.toString()], 'T-5 fundTask');
    if (ft.finalState !== 'COMPLETE') throw new Error(`fundTask FAILED: ${ft.finalState} — ${ft.errorDetails}`);

    const balanceBefore = await queryUsdcBalance(EMPLOYER_ADDRESS);

    console.log(JSON.stringify({ event: 'T-5-waiting', detail: 'Waiting 70s for deadline to pass...' }));
    await new Promise((r) => setTimeout(r, 70_000));

    const rf = await sendEscrowTx(EMPLOYER_WALLET_ID, 'requestRefund(uint256)', [t5TaskId.toString()], 'T-5 requestRefund');
    if (rf.finalState !== 'COMPLETE') throw new Error(`requestRefund FAILED: ${rf.finalState} — ${rf.errorDetails}`);

    const task = await queryTask(t5TaskId);
    const balanceAfter = await queryUsdcBalance(EMPLOYER_ADDRESS);

    if (task.state !== 4) throw new Error(`Expected state=4 (Refunded), got ${task.state}`);
    const delta = balanceAfter - balanceBefore;
    if (delta < 500_000n) throw new Error(`Employer delta=${delta}, expected ~1000000`);

    log({
      testName: 'T-5: requestRefund from Funded state (deadline path)',
      status: 'PASS',
      detail: `taskId=${t5TaskId} state=${task.state}(Refunded) employerDelta=+${delta} requestRefund.txHash=${rf.txHash}`,
      txHash: rf.txHash,
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    log({ testName: 'T-5: requestRefund from Funded state (deadline path)', status: 'FAIL', detail: String(err), durationMs: Date.now() - t0 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-6: requestRefund from Submitted state (within reviewWindow)
// ─────────────────────────────────────────────────────────────────────────────

{
  const t0 = Date.now();
  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 24 * 3600);
    const amount = '1000000';

    const nextId = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'nextTaskId' });
    const t6TaskId = nextId;

    const ct = await sendEscrowTx(
      EMPLOYER_WALLET_ID,
      'createTask(address,string,uint256,uint256)',
      [PROVIDER_ADDRESS, 'integration-test-refund-submitted', amount, deadline.toString()],
      'T-6 createTask',
    );
    if (ct.finalState !== 'COMPLETE') throw new Error(`createTask FAILED: ${ct.finalState} — ${ct.errorDetails}`);

    const ap = await sendUsdcApprove(EMPLOYER_WALLET_ID, ESCROW_ADDRESS, amount, 'T-6 approve');
    if (ap.finalState !== 'COMPLETE') throw new Error(`approve FAILED: ${ap.finalState}`);

    const ft = await sendEscrowTx(EMPLOYER_WALLET_ID, 'fundTask(uint256)', [t6TaskId.toString()], 'T-6 fundTask');
    if (ft.finalState !== 'COMPLETE') throw new Error(`fundTask FAILED: ${ft.finalState} — ${ft.errorDetails}`);

    const sw = await sendEscrowTx(PROVIDER_WALLET_ID, 'submitWork(uint256)', [t6TaskId.toString()], 'T-6 submitWork');
    if (sw.finalState !== 'COMPLETE') throw new Error(`submitWork FAILED: ${sw.finalState} — ${sw.errorDetails}`);

    const balanceBefore = await queryUsdcBalance(EMPLOYER_ADDRESS);

    const rf = await sendEscrowTx(EMPLOYER_WALLET_ID, 'requestRefund(uint256)', [t6TaskId.toString()], 'T-6 requestRefund');
    if (rf.finalState !== 'COMPLETE') throw new Error(`requestRefund FAILED: ${rf.finalState} — ${rf.errorDetails}`);

    const task = await queryTask(t6TaskId);
    const balanceAfter = await queryUsdcBalance(EMPLOYER_ADDRESS);

    if (task.state !== 4) throw new Error(`Expected state=4 (Refunded), got ${task.state}`);
    const delta = balanceAfter - balanceBefore;
    if (delta < 500_000n) throw new Error(`Employer delta=${delta}, expected ~1000000`);

    log({
      testName: 'T-6: requestRefund from Submitted state (within reviewWindow)',
      status: 'PASS',
      detail: `taskId=${t6TaskId} state=${task.state}(Refunded) employerDelta=+${delta} requestRefund.txHash=${rf.txHash}`,
      txHash: rf.txHash,
      durationMs: Date.now() - t0,
    });
  } catch (err: any) {
    log({ testName: 'T-6: requestRefund from Submitted state (within reviewWindow)', status: 'FAIL', detail: String(err), durationMs: Date.now() - t0 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-7: Document claimPayment SUCCESS path (deferred — reviewWindow=86400s)
// ─────────────────────────────────────────────────────────────────────────────

{
  const t0 = Date.now();
  if (T2_TASK_ID > 0n && T2_SUBMISSION_TIME > 0n) {
    const releaseTime = T2_SUBMISSION_TIME + 86400n;
    const releaseDate = new Date(Number(releaseTime) * 1000).toISOString();
    log({
      testName: 'T-7: claimPayment after reviewWindow (deferred)',
      status: 'SKIPPED',
      detail: `taskId=${T2_TASK_ID} submissionTime=${T2_SUBMISSION_TIME} releaseTime=${releaseTime} releaseTimeUTC=${releaseDate} providerWalletId=${PROVIDER_WALLET_ID} providerAddress=${PROVIDER_ADDRESS} — Run T7-claimPayment-completion.ts after releaseTime`,
      durationMs: Date.now() - t0,
    });
  } else {
    log({
      testName: 'T-7: claimPayment after reviewWindow (deferred)',
      status: 'SKIPPED',
      detail: 'T-2 failed; T-7 completion script on disk for manual use.',
      durationMs: Date.now() - t0,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const skipped = results.filter((r) => r.status === 'SKIPPED').length;

console.log(JSON.stringify({
  summary: true,
  passed,
  failed,
  skipped,
  total: results.length,
  T2_taskId: T2_TASK_ID.toString(),
  T2_submissionTime: T2_SUBMISSION_TIME.toString(),
  T2_releaseTime: T2_SUBMISSION_TIME > 0n ? (T2_SUBMISSION_TIME + 86400n).toString() : 'unknown',
  T2_releaseTimeUTC: T2_SUBMISSION_TIME > 0n
    ? new Date(Number(T2_SUBMISSION_TIME + 86400n) * 1000).toISOString()
    : 'unknown',
  providerWalletId: PROVIDER_WALLET_ID,
  providerAddress: PROVIDER_ADDRESS,
}));

process.exit(failed > 0 ? 1 : 0);
