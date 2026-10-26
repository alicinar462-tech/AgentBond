/**
 * AgentBondEscrow ABI — typed directly from the Foundry artifact.
 * Source: contracts/out/AgentBondEscrow.sol/AgentBondEscrow.json
 * Do not edit: regenerate from `forge build` if the contract changes.
 */
export const ESCROW_ABI = [
  // ── View / pure ──────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'MAX_REF_LENGTH',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MIN_REVIEW_WINDOW',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_REVIEW_WINDOW',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextTaskId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'reviewWindow',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tasks',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'employer',       type: 'address' },
      { name: 'provider',       type: 'address' },
      { name: 'description',    type: 'string'  },
      { name: 'amount',         type: 'uint256' },
      { name: 'deadline',       type: 'uint256' },
      { name: 'submissionTime', type: 'uint256' },
      { name: 'state',          type: 'uint8'   },
    ],
    stateMutability: 'view',
  },
  // ── State-mutating ───────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'createTask',
    inputs: [
      { name: 'provider',    type: 'address' },
      { name: 'description', type: 'string'  },
      { name: 'amount',      type: 'uint256' },
      { name: 'deadline',    type: 'uint256' },
    ],
    outputs: [{ name: 'taskId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'fundTask',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submitWork',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approveWork',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'requestRefund',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimPayment',
    inputs: [{ name: 'taskId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'TaskCreated',
    inputs: [
      { name: 'taskId',      type: 'uint256', indexed: true  },
      { name: 'employer',    type: 'address', indexed: true  },
      { name: 'provider',    type: 'address', indexed: true  },
      { name: 'amount',      type: 'uint256', indexed: false },
      { name: 'deadline',    type: 'uint256', indexed: false },
      { name: 'description', type: 'string',  indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TaskFunded',
    inputs: [
      { name: 'taskId',   type: 'uint256', indexed: true  },
      { name: 'employer', type: 'address', indexed: true  },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WorkSubmitted',
    inputs: [
      { name: 'taskId',   type: 'uint256', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WorkApproved',
    inputs: [
      { name: 'taskId',   type: 'uint256', indexed: true  },
      { name: 'employer', type: 'address', indexed: true  },
      { name: 'provider', type: 'address', indexed: true  },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RefundIssued',
    inputs: [
      { name: 'taskId',   type: 'uint256', indexed: true  },
      { name: 'employer', type: 'address', indexed: true  },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PaymentClaimed',
    inputs: [
      { name: 'taskId',   type: 'uint256', indexed: true  },
      { name: 'provider', type: 'address', indexed: true  },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  // ── Custom errors ────────────────────────────────────────────────────────
  { type: 'error', name: 'ZeroAddress',                inputs: [] },
  { type: 'error', name: 'ZeroAmount',                 inputs: [] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'TaskNotFound',               inputs: [{ name: 'taskId',      type: 'uint256' }] },
  { type: 'error', name: 'NotEmployer',                inputs: [{ name: 'taskId',      type: 'uint256' }] },
  { type: 'error', name: 'NotProvider',                inputs: [{ name: 'taskId',      type: 'uint256' }] },
  { type: 'error', name: 'InvalidState',               inputs: [{ name: 'taskId',      type: 'uint256' }, { name: 'current', type: 'uint8' }] },
  { type: 'error', name: 'DeadlinePassed',             inputs: [{ name: 'taskId',      type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'currentTime', type: 'uint256' }] },
  { type: 'error', name: 'DeadlineNotReached',         inputs: [{ name: 'taskId',      type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'currentTime', type: 'uint256' }] },
  { type: 'error', name: 'DeadlineInPast',             inputs: [{ name: 'deadline',    type: 'uint256' }, { name: 'currentTime', type: 'uint256' }] },
  { type: 'error', name: 'DescriptionTooLong',         inputs: [{ name: 'length',      type: 'uint256' }, { name: 'max', type: 'uint256' }] },
  { type: 'error', name: 'SafeERC20FailedOperation',   inputs: [{ name: 'token',       type: 'address' }] },
  { type: 'error', name: 'ReviewWindowExpired',        inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'expiredAt', type: 'uint256' }, { name: 'currentTime', type: 'uint256' }] },
  { type: 'error', name: 'ReviewWindowNotExpired',     inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'releaseTime', type: 'uint256' }, { name: 'currentTime', type: 'uint256' }] },
  { type: 'error', name: 'InvalidReviewWindow',        inputs: [{ name: 'provided', type: 'uint256' }] },
] as const
