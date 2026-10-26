/**
 * Tests for src/hooks/useContractVerification.ts
 *
 * MOCK STRATEGY
 * =============
 * vi.mock() calls are hoisted to the top of the file by Vitest — above all
 * variable declarations. Any variable referenced inside a vi.mock() factory
 * must itself be hoisted via vi.hoisted() or be a literal; otherwise you get
 * "Cannot access '...' before initialization".
 *
 * We use vi.hoisted() to declare the mutable mock state so it is available
 * when the hoisted vi.mock() factories execute.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoisted mock state ───────────────────────────────────────────────────────
// These must be declared with vi.hoisted() so they exist when vi.mock factories
// are evaluated (which happens before any import or const declaration).

const { mockContract, mockWagmi } = vi.hoisted(() => {
  const mockContract = {
    CONTRACT_ADDRESS: '0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC' as `0x${string}` | undefined,
    isContractDeployed: true,
    TARGET_CHAIN_ID: 5042002,
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
    getUsdcAddress: () => '0x3600000000000000000000000000000000000000',
    getUsdcDecimals: () => 6,
    MAX_DISPLAY_TASKS: 50,
  }

  // mockWagmi.getCode is the replaceable function each test controls.
  const mockWagmi = {
    getCode: vi.fn() as (p: { address: `0x${string}`; blockTag: string }) => Promise<string>,
  }

  return { mockContract, mockWagmi }
})

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/escrow-contract', () => mockContract)

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    usePublicClient: vi.fn(() => ({
      getCode: (p: { address: `0x${string}`; blockTag: string }) => mockWagmi.getCode(p),
    })),
  }
})

// ─── Imports (after mock registration) ────────────────────────────────────────
import { useContractVerification } from '@/hooks/useContractVerification'

// ─── Constants ────────────────────────────────────────────────────────────────
const VALID_ADDRESS     = '0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC' as `0x${string}`
const ZERO_ADDRESS_CONST = '0x0000000000000000000000000000000000000000' as `0x${string}`
const BYTECODE_NONEMPTY  = '0x6080604052'
const BYTECODE_EMPTY     = '0x'

// ─── Helper: configure mock contract state ────────────────────────────────────
function setMockAddress(address: `0x${string}` | undefined) {
  mockContract.CONTRACT_ADDRESS = address
  mockContract.isContractDeployed = !!(
    address &&
    /^0x[0-9a-fA-F]{40}$/.test(address)
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useContractVerification', () => {

  beforeEach(() => {
    setMockAddress(VALID_ADDRESS)
    mockWagmi.getCode = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── T-9: Address unavailable / isContractDeployed = false ───────────────────
  describe('T-9: contract address unavailable', () => {
    it('isContractDeployed=false (undefined address) → idle, contractVerified=false', () => {
      setMockAddress(undefined)

      const { result } = renderHook(() => useContractVerification())

      expect(result.current.status).toBe('idle')
      expect(result.current.contractVerified).toBe(false)
      expect(result.current.verifiedAddress).toBeUndefined()
      expect(mockWagmi.getCode).not.toHaveBeenCalled()
    })

    it('malformed address (isContractDeployed=false) → idle, contractVerified=false', () => {
      // Force isContractDeployed=false with a malformed address
      mockContract.CONTRACT_ADDRESS = '0xBAD'
      mockContract.isContractDeployed = false

      const { result } = renderHook(() => useContractVerification())

      expect(result.current.status).toBe('idle')
      expect(result.current.contractVerified).toBe(false)
      expect(mockWagmi.getCode).not.toHaveBeenCalled()
    })
  })

  // ── T-10: Zero address ───────────────────────────────────────────────────────
  describe('T-10: zero address', () => {
    it('zero address → not-deployed, contractVerified=false, getCode not called', () => {
      setMockAddress(ZERO_ADDRESS_CONST)

      const { result } = renderHook(() => useContractVerification())

      expect(result.current.status).toBe('not-deployed')
      expect(result.current.contractVerified).toBe(false)
      expect(mockWagmi.getCode).not.toHaveBeenCalled()
    })
  })

  // ── T-11: publicClient unavailable ──────────────────────────────────────────
  describe('T-11: publicClient unavailable', () => {
    it('usePublicClient returns undefined → getCode never called, contractVerified=false', async () => {
      const wagmi = await import('wagmi')
      vi.mocked(wagmi.usePublicClient).mockReturnValueOnce(undefined)

      const { result } = renderHook(() => useContractVerification())

      // Effect short-circuits when publicClient is undefined.
      // Status stays at the synchronous initial value.
      expect(result.current.contractVerified).toBe(false)
      expect(mockWagmi.getCode).not.toHaveBeenCalled()
    })

    it('usePublicClient returns undefined → status remains "checking" (effect short-circuits, setStatus never called)', async () => {
      // IMPLEMENTATION DETAIL:
      // When publicClient is undefined the useEffect guard returns early without
      // calling setStatus. The initial synchronous value is:
      //   isContractDeployed=true && address != zero  →  'checking'
      // That value is never overwritten, so status stays 'checking' indefinitely.
      // This is intentional: the hook cannot confirm anything without a client,
      // so it remains in the pending state rather than falsely reporting idle/error.
      // The practical effect: contractVerified=false (checking ≠ verified), so
      // all writes remain blocked — the same safety outcome as rpc-error.
      const wagmi = await import('wagmi')
      vi.mocked(wagmi.usePublicClient).mockReturnValueOnce(undefined)

      const { result } = renderHook(() => useContractVerification())

      expect(result.current.status).toBe('checking')
      expect(result.current.contractVerified).toBe(false)
      expect(result.current.verifiedAddress).toBeUndefined()
      expect(mockWagmi.getCode).not.toHaveBeenCalled()
    })

    it('usePublicClient returns undefined → statusMessage reflects the checking state', async () => {
      const wagmi = await import('wagmi')
      vi.mocked(wagmi.usePublicClient).mockReturnValueOnce(undefined)

      const { result } = renderHook(() => useContractVerification())

      // 'checking' status message contains the address prefix
      expect(result.current.statusMessage).toContain('Verifying contract on-chain')
    })
  })

  // ── T-12: Empty bytecode ("0x") ──────────────────────────────────────────────
  describe('T-12: empty bytecode', () => {
    it('getCode returns "0x" → not-deployed, contractVerified=false', async () => {
      mockWagmi.getCode = vi.fn().mockResolvedValue(BYTECODE_EMPTY)

      const { result } = renderHook(() => useContractVerification())

      // Initially checking
      expect(result.current.status).toBe('checking')
      expect(result.current.contractVerified).toBe(false)

      await waitFor(() => {
        expect(result.current.status).toBe('not-deployed')
      })

      expect(result.current.contractVerified).toBe(false)
      expect(result.current.verifiedAddress).toBeUndefined()
      // React StrictMode double-invokes effects; assert called (not once).
      expect(mockWagmi.getCode).toHaveBeenCalled()
      expect(mockWagmi.getCode).toHaveBeenCalledWith({
        address: VALID_ADDRESS,
        blockTag: 'latest',
      })
    })
  })

  // ── T-13: Non-empty bytecode ─────────────────────────────────────────────────
  describe('T-13: bytecode present', () => {
    it('getCode returns bytecode → verified, contractVerified=true', async () => {
      mockWagmi.getCode = vi.fn().mockResolvedValue(BYTECODE_NONEMPTY)

      const { result } = renderHook(() => useContractVerification())

      expect(result.current.status).toBe('checking')

      await waitFor(() => {
        expect(result.current.status).toBe('verified')
      })

      expect(result.current.contractVerified).toBe(true)
      expect(result.current.verifiedAddress).toBe(VALID_ADDRESS)
      expect(mockWagmi.getCode).toHaveBeenCalled()
    })

    it('statusMessage is "Contract verified on-chain." when verified', async () => {
      mockWagmi.getCode = vi.fn().mockResolvedValue(BYTECODE_NONEMPTY)

      const { result } = renderHook(() => useContractVerification())

      await waitFor(() => expect(result.current.status).toBe('verified'))

      expect(result.current.statusMessage).toBe('Contract verified on-chain.')
    })
  })

  // ── T-14: RPC error ──────────────────────────────────────────────────────────
  describe('T-14: RPC error', () => {
    it('getCode rejects → rpc-error, contractVerified=false', async () => {
      mockWagmi.getCode = vi.fn().mockRejectedValue(new Error('network error'))

      const { result } = renderHook(() => useContractVerification())

      expect(result.current.status).toBe('checking')

      await waitFor(() => {
        expect(result.current.status).toBe('rpc-error')
      })

      expect(result.current.contractVerified).toBe(false)
      expect(result.current.verifiedAddress).toBeUndefined()
      expect(mockWagmi.getCode).toHaveBeenCalled()
    })

    it('statusMessage mentions writes disabled on rpc-error', async () => {
      mockWagmi.getCode = vi.fn().mockRejectedValue(new Error('timeout'))

      const { result } = renderHook(() => useContractVerification())

      await waitFor(() => expect(result.current.status).toBe('rpc-error'))

      expect(result.current.statusMessage).toContain('Writes are disabled')
    })
  })

  // ── T-15: Stale result discarded ─────────────────────────────────────────────
  describe('T-15: stale async result discarded', () => {
    it('resolved promise from unmounted instance does not affect a new instance', async () => {
      // First instance: slow getCode that resolves after unmount.
      let resolveFirst!: (value: string) => void
      const slowPromise = new Promise<string>(resolve => { resolveFirst = resolve })
      mockWagmi.getCode = vi.fn().mockReturnValue(slowPromise)

      // Mount, then immediately unmount — cleanup sets cancelled=true.
      const { unmount } = renderHook(() => useContractVerification())
      unmount()

      // Second instance: fast getCode returning empty bytecode.
      mockWagmi.getCode = vi.fn().mockResolvedValue(BYTECODE_EMPTY)
      const { result: result2 } = renderHook(() => useContractVerification())

      await waitFor(() => {
        expect(result2.current.status).toBe('not-deployed')
      })

      // Now resolve the stale promise with a "verified" result.
      // The first hook's cancelled=true means its setStatus is a no-op.
      resolveFirst(BYTECODE_NONEMPTY)
      await new Promise(r => setTimeout(r, 20))

      // Second instance must not have been affected.
      expect(result2.current.status).toBe('not-deployed')
      expect(result2.current.contractVerified).toBe(false)
    })
  })

  // ── Additional: contractVerified gate and statusMessage ──────────────────────
  describe('contractVerified gate assertions', () => {
    it('idle → contractVerified is always false', () => {
      setMockAddress(undefined)
      const { result } = renderHook(() => useContractVerification())
      expect(result.current.contractVerified).toBe(false)
    })

    it('not-deployed (zero address) → contractVerified is always false', () => {
      setMockAddress(ZERO_ADDRESS_CONST)
      const { result } = renderHook(() => useContractVerification())
      expect(result.current.contractVerified).toBe(false)
    })

    it('checking (in-flight) → contractVerified is false', () => {
      // Promise never resolves — simulates in-flight check.
      mockWagmi.getCode = vi.fn().mockReturnValue(new Promise(() => {}))
      const { result } = renderHook(() => useContractVerification())
      expect(result.current.status).toBe('checking')
      expect(result.current.contractVerified).toBe(false)
    })

    it('idle statusMessage describes missing/invalid address', () => {
      setMockAddress(undefined)
      const { result } = renderHook(() => useContractVerification())
      expect(result.current.statusMessage).toContain('not configured')
    })

    it('not-deployed statusMessage mentions VITE_CONTRACT_ADDRESS', () => {
      setMockAddress(ZERO_ADDRESS_CONST)
      const { result } = renderHook(() => useContractVerification())
      expect(result.current.statusMessage).toContain('VITE_CONTRACT_ADDRESS')
    })
  })
})
