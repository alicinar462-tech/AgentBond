/**
 * Tests for src/hooks/useEscrowWrite.ts
 *
 * Security focus: every write path must be gated behind contractVerified === true.
 * Mock strategy:
 *   - wagmi hooks (useWriteContract, useWaitForTransactionReceipt,
 *     useReadContract, useAccount) → vi.hoisted() + vi.mock()
 *   - @tanstack/react-query (useQueryClient) → vi.hoisted() + vi.mock()
 *   - @/lib/escrow-contract module → vi.hoisted() + vi.mock()
 *   - @/lib/format (parseContractError) → vi.mock() returning identity
 *
 * Each test suite renders the target hook with renderHook, calls the action
 * function, and asserts whether the relevant write mock was or was not called.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Hoisted mocks (must be declared before vi.mock factories reference them) ──

const mocks = vi.hoisted(() => {
  const writeContract = vi.fn()
  const writeApprove  = vi.fn()
  const writeFund     = vi.fn()

  return {
    // Primary writeContract mock – used by useEscrowAction & useCreateTask
    writeContract,
    // Secondary mocks – useFundTask uses two separate useWriteContract instances
    writeApprove,
    writeFund,

    // Call counter: each call to useWriteContract returns the next mock in sequence
    writeContractCallCount: { value: 0 },

    useWriteContract: vi.fn(),
    useWaitForTransactionReceipt: vi.fn(),
    useReadContract: vi.fn(),
    useAccount: vi.fn(),
    invalidateQueries: vi.fn(),
    useQueryClient: vi.fn(),
    parseContractError: vi.fn((e: unknown) => String(e)),
  }
})

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('wagmi', () => ({
  useWriteContract: mocks.useWriteContract,
  useWaitForTransactionReceipt: mocks.useWaitForTransactionReceipt,
  useReadContract: mocks.useReadContract,
  useAccount: mocks.useAccount,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/lib/escrow-contract', () => ({
  CONTRACT_ADDRESS: '0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC' as `0x${string}`,
  TARGET_CHAIN_ID: 5042002,
  isContractDeployed: true,
  getUsdcAddress: () => '0x3600000000000000000000000000000000000000' as `0x${string}`,
}))

vi.mock('@/lib/escrow-abi', () => ({
  ESCROW_ABI: [],
}))

vi.mock('@/lib/format', () => ({
  parseContractError: mocks.parseContractError,
}))

// ── Shared test constants ────────────────────────────────────────────────────

const VALID_TASK_ID    = 1n
const VALID_AMOUNT     = 1_000_000n   // 1 USDC (6 decimals)
const VALID_PROVIDER   = '0x2C2Fa2B5F1E6a84700f3Bb3EEb051Ee45B37c689' as `0x${string}`
const VALID_DEADLINE   = BigInt(Math.floor(Date.now() / 1000) + 86400)
const CONTRACT_ADDRESS = '0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC' as `0x${string}`
const USDC_ADDRESS     = '0x3600000000000000000000000000000000000000' as `0x${string}`
const TARGET_CHAIN_ID  = 5042002

/** Standard no-op wagmi write mock return value */
function makeWriteMock(writeFn: ReturnType<typeof vi.fn>) {
  return {
    writeContract: writeFn,
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  }
}

/** Standard no-op receipt mock return value */
const noReceipt = { isLoading: false, isSuccess: false, error: null }

function setupDefaultMocks() {
  mocks.useWriteContract.mockReturnValue(makeWriteMock(mocks.writeContract))
  mocks.useWaitForTransactionReceipt.mockReturnValue(noReceipt)
  mocks.useReadContract.mockReturnValue({ data: undefined, refetch: vi.fn() })
  mocks.useAccount.mockReturnValue({ address: '0x70B7779b9f6698dc85EcC1F346781709a8356FBF' })
  mocks.useQueryClient.mockReturnValue({ invalidateQueries: mocks.invalidateQueries })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

// ── Imports (after mock setup) ───────────────────────────────────────────────

// Dynamic imports are not needed here because vi.mock is hoisted automatically.
import {
  useSubmitWork,
  useApproveWork,
  useRequestRefund,
  useCreateTask,
  useFundTask,
  useClaimPayment,
} from '@/hooks/useEscrowWrite'

// ── useSubmitWork ─────────────────────────────────────────────────────────────

describe('useSubmitWork', () => {
  describe('contractVerified = false', () => {
    it('T-16a: execute() does not call writeContract', () => {
      const { result } = renderHook(() => useSubmitWork(false))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).not.toHaveBeenCalled()
    })
  })

  describe('contractVerified = true', () => {
    it('T-16b: execute(taskId) calls writeContract with correct args', () => {
      const { result } = renderHook(() => useSubmitWork(true))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACT_ADDRESS,
          functionName: 'submitWork',
          args: [VALID_TASK_ID],
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })
  })
})

// ── useApproveWork ────────────────────────────────────────────────────────────

describe('useApproveWork', () => {
  describe('contractVerified = false', () => {
    it('T-17a: execute() does not call writeContract', () => {
      const { result } = renderHook(() => useApproveWork(false))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).not.toHaveBeenCalled()
    })
  })

  describe('contractVerified = true', () => {
    it('T-17b: execute(taskId) calls writeContract with correct args', () => {
      const { result } = renderHook(() => useApproveWork(true))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'approveWork',
          args: [VALID_TASK_ID],
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })
  })
})

// ── useRequestRefund ──────────────────────────────────────────────────────────

describe('useRequestRefund', () => {
  describe('contractVerified = false', () => {
    it('T-18a: execute() does not call writeContract', () => {
      const { result } = renderHook(() => useRequestRefund(false))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).not.toHaveBeenCalled()
    })
  })

  describe('contractVerified = true', () => {
    it('T-18b: execute(taskId) calls writeContract with correct args', () => {
      const { result } = renderHook(() => useRequestRefund(true))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'requestRefund',
          args: [VALID_TASK_ID],
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })
  })
})

// ── useCreateTask ─────────────────────────────────────────────────────────────

describe('useCreateTask', () => {
  describe('contractVerified = false', () => {
    it('T-19a: execute() does not call writeContract', () => {
      const { result } = renderHook(() => useCreateTask(false))
      act(() => {
        result.current.execute(VALID_PROVIDER, 'test task', VALID_AMOUNT, VALID_DEADLINE)
      })
      expect(mocks.writeContract).not.toHaveBeenCalled()
    })
  })

  describe('contractVerified = true', () => {
    it('T-19b: execute() calls writeContract with correct args', () => {
      const { result } = renderHook(() => useCreateTask(true))
      act(() => {
        result.current.execute(VALID_PROVIDER, 'test task', VALID_AMOUNT, VALID_DEADLINE)
      })
      expect(mocks.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACT_ADDRESS,
          functionName: 'createTask',
          args: [VALID_PROVIDER, 'test task', VALID_AMOUNT, VALID_DEADLINE],
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })
  })
})

// ── useFundTask / approve() ───────────────────────────────────────────────────

describe('useFundTask — approve()', () => {
  /**
   * useFundTask calls useWriteContract TWICE: once for approve, once for fund.
   * We need two separate mocks returned in sequence.
   */
  function setupFundMocks() {
    mocks.useWriteContract
      .mockReturnValueOnce(makeWriteMock(mocks.writeApprove))  // approve slot
      .mockReturnValueOnce(makeWriteMock(mocks.writeFund))     // fund slot
    mocks.useWaitForTransactionReceipt
      .mockReturnValue(noReceipt)
    mocks.useReadContract.mockReturnValue({
      data: 0n,   // zero allowance → needsApproval = true
      refetch: vi.fn(),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAccount.mockReturnValue({ address: '0x70B7779b9f6698dc85EcC1F346781709a8356FBF' })
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: mocks.invalidateQueries })
    setupFundMocks()
  })

  describe('contractVerified = false', () => {
    it('T-20a: approve() does not call writeApprove', () => {
      const { result } = renderHook(() =>
        useFundTask(false, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.approve() })
      expect(mocks.writeApprove).not.toHaveBeenCalled()
    })

    it('T-20b: fund() does not call writeFund', () => {
      const { result } = renderHook(() =>
        useFundTask(false, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.fund() })
      expect(mocks.writeFund).not.toHaveBeenCalled()
    })
  })

  describe('contractVerified = true', () => {
    it('T-21a: approve() calls writeApprove with correct token, spender, amount, chainId', () => {
      const { result } = renderHook(() =>
        useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.approve() })
      expect(mocks.writeApprove).toHaveBeenCalledWith(
        expect.objectContaining({
          address: USDC_ADDRESS,             // token contract
          functionName: 'approve',
          args: [CONTRACT_ADDRESS, VALID_AMOUNT], // spender = escrow, amount = task amount
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })

    it('T-21b: fund() calls writeFund with correct escrow address and taskId', () => {
      const { result } = renderHook(() =>
        useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.fund() })
      expect(mocks.writeFund).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACT_ADDRESS,
          functionName: 'fundTask',
          args: [VALID_TASK_ID],
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })

    it('T-21c: approve() does not call writeApprove when taskAmount is undefined', () => {
      const { result } = renderHook(() =>
        useFundTask(true, VALID_TASK_ID, undefined),
      )
      act(() => { result.current.approve() })
      expect(mocks.writeApprove).not.toHaveBeenCalled()
    })

    it('T-21d: fund() does not call writeFund when taskId is undefined', () => {
      const { result } = renderHook(() =>
        useFundTask(true, undefined, VALID_AMOUNT),
      )
      act(() => { result.current.fund() })
      expect(mocks.writeFund).not.toHaveBeenCalled()
    })

    it('T-21e: approve() spender is CONTRACT_ADDRESS (not USDC address or other)', () => {
      const { result } = renderHook(() =>
        useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.approve() })
      const call = mocks.writeApprove.mock.calls[0]?.[0] as {
        args: [`0x${string}`, bigint]
      } | undefined
      // args[0] is the spender — must be the escrow contract, never USDC address
      expect(call?.args[0]).toBe(CONTRACT_ADDRESS)
      expect(call?.args[0]).not.toBe(USDC_ADDRESS)
    })

    it('T-21f: approve() amount equals taskAmount exactly (not unlimited)', () => {
      const { result } = renderHook(() =>
        useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.approve() })
      const call = mocks.writeApprove.mock.calls[0]?.[0] as {
        args: [`0x${string}`, bigint]
      } | undefined
      expect(call?.args[1]).toBe(VALID_AMOUNT)
    })

    it('T-21g: approve() chainId is TARGET_CHAIN_ID (5042002)', () => {
      const { result } = renderHook(() =>
        useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
      )
      act(() => { result.current.approve() })
      expect(mocks.writeApprove).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: TARGET_CHAIN_ID }),
      )
    })
  })
})

// ── useFundTask — needsApproval / allowance logic ────────────────────────────
//
// NOTE ON approve() vs needsApproval:
//   The approve() function itself does NOT check needsApproval before calling
//   writeApprove. Its guard is: contractVerified && usdcAddress && CONTRACT_ADDRESS
//   && taskAmount !== undefined. needsApproval is a derived boolean the UI reads
//   to decide whether to show the "Approve USDC" button at all. When allowance >=
//   taskAmount the UI hides the button (needsApproval = false) so approve() is
//   never called by a well-behaved UI. These tests verify:
//     a) needsApproval correctly reflects the allowance vs amount comparison.
//     b) approve() called directly still proceeds when its own guards pass
//        (i.e. it does NOT re-check needsApproval — intentional design).
//   The security guarantee is UI-layer: the button is hidden when not needed.

describe('useFundTask — needsApproval / allowance logic', () => {
  function setupFundMocksWithAllowance(allowance: bigint | undefined) {
    vi.clearAllMocks()
    mocks.useAccount.mockReturnValue({ address: '0x70B7779b9f6698dc85EcC1F346781709a8356FBF' })
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: mocks.invalidateQueries })
    mocks.useWriteContract
      .mockReturnValueOnce(makeWriteMock(mocks.writeApprove))
      .mockReturnValueOnce(makeWriteMock(mocks.writeFund))
    mocks.useWaitForTransactionReceipt.mockReturnValue(noReceipt)
    mocks.useReadContract.mockReturnValue({ data: allowance, refetch: vi.fn() })
  }

  // T-23a: sufficient allowance → needsApproval = false
  it('T-23a: allowance >= taskAmount → needsApproval is false', () => {
    setupFundMocksWithAllowance(VALID_AMOUNT) // exact match
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
    )
    expect(result.current.needsApproval).toBe(false)
  })

  it('T-23a-2: allowance > taskAmount (surplus) → needsApproval is false', () => {
    setupFundMocksWithAllowance(VALID_AMOUNT + 1n) // one unit above
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
    )
    expect(result.current.needsApproval).toBe(false)
  })

  // T-23b: insufficient allowance → needsApproval = true
  it('T-23b: allowance < taskAmount → needsApproval is true', () => {
    setupFundMocksWithAllowance(VALID_AMOUNT - 1n) // one unit below
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
    )
    expect(result.current.needsApproval).toBe(true)
  })

  it('T-23b-2: zero allowance → needsApproval is true', () => {
    setupFundMocksWithAllowance(0n)
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
    )
    expect(result.current.needsApproval).toBe(true)
  })

  // T-23c: allowance = undefined (query not yet resolved) → needsApproval = true
  // Implementation: (allowance === undefined || allowance < taskAmount) → true when undefined.
  // This is conservative: the hook treats "unknown allowance" as "needs approval"
  // so the UI shows the Approve button rather than skipping a required step.
  it('T-23c: allowance undefined (unresolved query) → needsApproval is true (conservative)', () => {
    setupFundMocksWithAllowance(undefined)
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
    )
    // Implementation treats undefined as "needs approval" — conservative and correct.
    // Rationale: if we cannot read the allowance, we must not skip the approve step
    // because fundTask will revert on-chain without it.
    expect(result.current.needsApproval).toBe(true)
  })

  // T-23d: contractVerified = false → existing guard still prevents approve()
  it('T-23d: contractVerified = false, sufficient allowance — approve() still blocked by guard', () => {
    setupFundMocksWithAllowance(VALID_AMOUNT) // sufficient — needsApproval = false
    const { result } = renderHook(() =>
      useFundTask(false, VALID_TASK_ID, VALID_AMOUNT),
    )
    // Even with sufficient allowance (needsApproval=false), contractVerified=false
    // means the guard inside approve() returns early before writeApprove is called.
    act(() => { result.current.approve() })
    expect(mocks.writeApprove).not.toHaveBeenCalled()
  })

  // T-23e: allowance comparison uses raw bigint integer, not formatted USDC units.
  // 1 USDC = 1_000_000 (6 decimals). Comparing 999_999n < 1_000_000n must be true.
  it('T-23e: comparison uses raw bigint units (6-decimal integer, not formatted USDC)', () => {
    const oneUsdcRaw = 1_000_000n          // 1.000000 USDC in raw units
    const oneCentLessRaw = 999_999n        // 0.999999 USDC — one micro-unit below
    setupFundMocksWithAllowance(oneCentLessRaw)
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, oneUsdcRaw),
    )
    expect(result.current.needsApproval).toBe(true)
    // Verify the returned allowance value is the raw bigint, not a formatted string
    expect(result.current.allowance).toBe(oneCentLessRaw)
  })

  // T-23f: approve() called directly with sufficient allowance still dispatches
  // writeApprove — approve() does NOT re-check needsApproval internally.
  // The UI layer is responsible for hiding the button when needsApproval=false.
  it('T-23f: approve() dispatches even when allowance is sufficient (guard is UI-layer only)', () => {
    setupFundMocksWithAllowance(VALID_AMOUNT) // sufficient
    const { result } = renderHook(() =>
      useFundTask(true, VALID_TASK_ID, VALID_AMOUNT),
    )
    // needsApproval should be false
    expect(result.current.needsApproval).toBe(false)
    // But approve() called directly still proceeds — its guard does not check needsApproval
    act(() => { result.current.approve() })
    expect(mocks.writeApprove).toHaveBeenCalled()
    // This documents that the approve() guard is: contractVerified + addresses + taskAmount.
    // The needsApproval flag is a UI hint, not an internal gate.
  })
})

// ── useClaimPayment ───────────────────────────────────────────────────────────

describe('useClaimPayment', () => {
  describe('contractVerified = false', () => {
    it('T-24a: execute() does not call writeContract', () => {
      const { result } = renderHook(() => useClaimPayment(false))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).not.toHaveBeenCalled()
    })
  })

  describe('contractVerified = true', () => {
    it('T-24b: execute(taskId) calls writeContract with functionName=claimPayment', () => {
      const { result } = renderHook(() => useClaimPayment(true))
      act(() => { result.current.execute(VALID_TASK_ID) })
      expect(mocks.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: CONTRACT_ADDRESS,
          functionName: 'claimPayment',
          args: [VALID_TASK_ID],
          chainId: TARGET_CHAIN_ID,
        }),
      )
    })

    it('T-24c: execute(taskId) passes the correct taskId argument', () => {
      const otherTaskId = 42n
      const { result } = renderHook(() => useClaimPayment(true))
      act(() => { result.current.execute(otherTaskId) })
      const call = mocks.writeContract.mock.calls[0]?.[0] as { args: bigint[] } | undefined
      expect(call?.args[0]).toBe(otherTaskId)
    })

    it('T-24d: returns isPending, isConfirming, isSuccess, errorMessage, hash, reset', () => {
      const { result } = renderHook(() => useClaimPayment(true))
      expect(result.current).toMatchObject({
        isPending:    false,
        isConfirming: false,
        isSuccess:    false,
        errorMessage: null,
      })
      expect(typeof result.current.execute).toBe('function')
      expect(typeof result.current.reset).toBe('function')
    })
  })
})

// ── Combined: all writes blocked when contractVerified = false ────────────────

describe('All write paths blocked when contractVerified = false', () => {
  function setupFundMocksBlocked() {
    mocks.useWriteContract
      .mockReturnValueOnce(makeWriteMock(mocks.writeApprove))
      .mockReturnValueOnce(makeWriteMock(mocks.writeFund))
    mocks.useWaitForTransactionReceipt.mockReturnValue(noReceipt)
    mocks.useReadContract.mockReturnValue({ data: 0n, refetch: vi.fn() })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAccount.mockReturnValue({ address: '0xABCD' })
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: mocks.invalidateQueries })
    mocks.useWriteContract.mockReturnValue(makeWriteMock(mocks.writeContract))
    mocks.useWaitForTransactionReceipt.mockReturnValue(noReceipt)
    mocks.useReadContract.mockReturnValue({ data: 0n, refetch: vi.fn() })
  })

  it('T-22a: submitWork — writeContract not called', () => {
    const { result } = renderHook(() => useSubmitWork(false))
    act(() => { result.current.execute(1n) })
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('T-22b: approveWork — writeContract not called', () => {
    const { result } = renderHook(() => useApproveWork(false))
    act(() => { result.current.execute(1n) })
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('T-22c: requestRefund — writeContract not called', () => {
    const { result } = renderHook(() => useRequestRefund(false))
    act(() => { result.current.execute(1n) })
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('T-22d: createTask — writeContract not called', () => {
    const { result } = renderHook(() => useCreateTask(false))
    act(() => {
      result.current.execute(VALID_PROVIDER, 'test', VALID_AMOUNT, VALID_DEADLINE)
    })
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('T-22g: claimPayment — writeContract not called', () => {
    const { result } = renderHook(() => useClaimPayment(false))
    act(() => { result.current.execute(1n) })
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })

  it('T-22e: fundTask approve — writeApprove not called', () => {
    vi.clearAllMocks()
    mocks.useAccount.mockReturnValue({ address: '0xABCD' })
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: mocks.invalidateQueries })
    setupFundMocksBlocked()
    const { result } = renderHook(() => useFundTask(false, 1n, VALID_AMOUNT))
    act(() => { result.current.approve() })
    expect(mocks.writeApprove).not.toHaveBeenCalled()
  })

  it('T-22f: fundTask fund — writeFund not called', () => {
    vi.clearAllMocks()
    mocks.useAccount.mockReturnValue({ address: '0xABCD' })
    mocks.useQueryClient.mockReturnValue({ invalidateQueries: mocks.invalidateQueries })
    setupFundMocksBlocked()
    const { result } = renderHook(() => useFundTask(false, 1n, VALID_AMOUNT))
    act(() => { result.current.fund() })
    expect(mocks.writeFund).not.toHaveBeenCalled()
  })
})
