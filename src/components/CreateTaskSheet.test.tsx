/**
 * Tests for src/components/CreateTaskSheet.tsx
 *
 * IMPLEMENTATION NOTE (T-25):
 * canSubmit (line 70) includes contractVerified:
 *   contractVerified && isConnected && providerValid && amountValid && ...
 *
 * The submit button is therefore DISABLED when contractVerified=false,
 * providing visual and interaction-level protection in addition to the
 * hook-layer guard inside useCreateTask (useEscrowWrite.ts line 110).
 *
 * Both layers enforce the same invariant: no write transaction is initiated
 * unless the AgentBond contract has been verified on the target chain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateTaskSheet } from './CreateTaskSheet'

// ── Hoisted mock variables ────────────────────────────────────────────────────
const mockExecute = vi.hoisted(() => vi.fn())
const mockReset   = vi.hoisted(() => vi.fn())

// Wagmi useAccount state — mutated per test
const mockAccount = vi.hoisted(() => ({
  address:     '0x70B7779b9f6698dc85EcC1F346781709a8356FBF' as `0x${string}` | undefined,
  isConnected: true,
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/useEscrowWrite', () => ({
  useCreateTask: vi.fn(() => ({
    execute:      mockExecute,
    hash:         undefined,
    isPending:    false,
    isConfirming: false,
    isSuccess:    false,
    errorMessage: null,
    reset:        mockReset,
  })),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useAccount: vi.fn(() => ({
      address:     mockAccount.address,
      isConnected: mockAccount.isConnected,
    })),
  }
})

// ConnectKitButton is not rendered in these tests but imported transitively
vi.mock('connectkit', () => ({
  ConnectKitButton: vi.fn(() => null),
}))

// framer-motion — render children immediately without animation
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      ...actual.motion,
      div: ({ children, onClick, className }: React.HTMLAttributes<HTMLDivElement>) => (
        <div onClick={onClick} className={className}>{children}</div>
      ),
    },
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PROVIDER  = '0x2C2Fa2B5F1E6a84700f3Bb3EEb051Ee45B37c689'
const VALID_AMOUNT    = '1'
// A datetime-local string 7 days in the future
function futureDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  // datetime-local format: YYYY-MM-DDThh:mm
  return d.toISOString().slice(0, 16)
}

function renderSheet(contractVerified: boolean) {
  return render(
    <CreateTaskSheet
      open={true}
      onClose={vi.fn()}
      contractVerified={contractVerified}
    />
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  // Provider address
  const providerInput = screen.getByPlaceholderText('0x…')
  await user.clear(providerInput)
  await user.type(providerInput, VALID_PROVIDER)

  // Description (optional but filled for clarity)
  const descInput = screen.getByPlaceholderText(/describe the work/i)
  await user.clear(descInput)
  await user.type(descInput, 'Test task description')

  // Amount
  const amountInput = screen.getByPlaceholderText('0.00')
  await user.clear(amountInput)
  await user.type(amountInput, VALID_AMOUNT)

  // Deadline — set to a future value via fireEvent (datetime-local is tricky with userEvent)
  const deadlineInput = screen.getByDisplayValue(/T\d{2}:\d{2}$/)
  fireEvent.change(deadlineInput, { target: { value: futureDeadline() } })
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('CreateTaskSheet', () => {
  beforeEach(() => {
    mockExecute.mockClear()
    mockReset.mockClear()
    mockAccount.address     = '0x70B7779b9f6698dc85EcC1F346781709a8356FBF'
    mockAccount.isConnected = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── T-25: contractVerified = false ──────────────────────────────────────────
  describe('T-25: contractVerified = false', () => {
    it('submit button is disabled when contractVerified=false, even if form is otherwise valid', async () => {
      // canSubmit now includes contractVerified (CreateTaskSheet.tsx line 70)
      // so the button must be disabled whenever contractVerified=false.
      const user = userEvent.setup()
      renderSheet(false)
      await fillValidForm(user)
      const submitBtn = screen.getByRole('button', { name: /create task/i })
      expect(submitBtn).toBeDisabled()
    })

    it('execute() is not called when contractVerified=false (button disabled prevents dispatch)', async () => {
      const user = userEvent.setup()
      renderSheet(false)
      await fillValidForm(user)
      const submitBtn = screen.getByRole('button', { name: /create task/i })
      expect(submitBtn).toBeDisabled()
      await user.click(submitBtn) // disabled button — click is ignored
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('contractVerified is part of canSubmit: true + valid form enables button, false disables it', async () => {
      // Behavioural test: same form, same wallet, only contractVerified differs.
      const user = userEvent.setup()

      // --- false: button must be disabled ---
      const { unmount } = renderSheet(false)
      await fillValidForm(user)
      expect(screen.getByRole('button', { name: /create task/i })).toBeDisabled()
      unmount()

      // --- true: button must be enabled ---
      renderSheet(true)
      await fillValidForm(user)
      expect(screen.getByRole('button', { name: /create task/i })).not.toBeDisabled()
    })
  })

  // ── T-30: pending / confirming states block re-submission ──────────────────
  //
  // MOCK STRATEGY NOTE:
  // vi.mock() factory runs at module load time and sets the default return value.
  // To override per-test we use vi.mocked(useCreateTask).mockImplementation()
  // BEFORE rendering, so every call within that render gets the overridden value.
  // mockReturnValueOnce alone is insufficient because React may call the hook
  // multiple times during render (StrictMode, re-renders triggered by fillValidForm).
  describe('T-30: isPending / isConfirming prevent double-submit', () => {
    it('submit button is disabled when isPending=true', async () => {
      // canSubmit includes !isPending (CreateTaskSheet.tsx line 70)
      const { useCreateTask } = await import('@/hooks/useEscrowWrite')
      vi.mocked(useCreateTask).mockImplementation(() => ({
        execute:      mockExecute,
        hash:         '0xabc',
        isPending:    true,
        isConfirming: false,
        isSuccess:    false,
        errorMessage: null,
        reset:        mockReset,
      }))

      const user = userEvent.setup()
      renderSheet(true)
      await fillValidForm(user)

      // canSubmit = false because !isPending is false → button disabled
      // Button label is "Confirm…" when isPending=true (CreateTaskSheet.tsx line 247)
      const submitBtn = screen.getByRole('button', { name: /confirm/i })
      expect(submitBtn).toBeDisabled()
    })

    it('execute() is not called when user attempts submission during isPending=true', async () => {
      const { useCreateTask } = await import('@/hooks/useEscrowWrite')
      vi.mocked(useCreateTask).mockImplementation(() => ({
        execute:      mockExecute,
        hash:         '0xabc',
        isPending:    true,
        isConfirming: false,
        isSuccess:    false,
        errorMessage: null,
        reset:        mockReset,
      }))

      const user = userEvent.setup()
      renderSheet(true)
      await fillValidForm(user)

      const submitBtn = screen.getByRole('button', { name: /confirm/i })
      expect(submitBtn).toBeDisabled()
      await user.click(submitBtn) // disabled — browser ignores click
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('submit button is disabled when isConfirming=true', async () => {
      // canSubmit includes !isConfirming (CreateTaskSheet.tsx line 70)
      const { useCreateTask } = await import('@/hooks/useEscrowWrite')
      vi.mocked(useCreateTask).mockImplementation(() => ({
        execute:      mockExecute,
        hash:         '0xdef',
        isPending:    false,
        isConfirming: true,
        isSuccess:    false,
        errorMessage: null,
        reset:        mockReset,
      }))

      const user = userEvent.setup()
      renderSheet(true)
      await fillValidForm(user)

      // canSubmit = false because !isConfirming is false → button disabled
      // Button label is "Creating…" when isConfirming=true (CreateTaskSheet.tsx line 248)
      const submitBtn = screen.getByRole('button', { name: /creating/i })
      expect(submitBtn).toBeDisabled()
    })
  })

  // ── T-26: wallet disconnected ───────────────────────────────────────────────
  describe('T-26: wallet disconnected', () => {
    it('submit button shows "Connect wallet first" and is disabled', () => {
      mockAccount.isConnected = false
      mockAccount.address     = undefined
      renderSheet(true)
      const submitBtn = screen.getByRole('button', { name: /connect wallet first/i })
      expect(submitBtn).toBeDisabled()
    })

    it('execute() is not called when wallet is disconnected', async () => {
      mockAccount.isConnected = false
      mockAccount.address     = undefined
      const user = userEvent.setup()
      renderSheet(true)
      // canSubmit is false (isConnected=false) so the button is disabled and
      // handleSubmit returns early before execute() is called
      const submitBtn = screen.getByRole('button', { name: /connect wallet first/i })
      expect(submitBtn).toBeDisabled()
      // Attempt programmatic click — disabled button ignores it
      await user.click(submitBtn)
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  // ── T-27: valid submission ──────────────────────────────────────────────────
  describe('T-27: contractVerified = true, wallet connected, form valid', () => {
    it('execute() is called with provider, description, parsedAmount, deadlineUnix', async () => {
      const user = userEvent.setup()
      renderSheet(true)
      await fillValidForm(user)
      const submitBtn = screen.getByRole('button', { name: /create task/i })
      expect(submitBtn).not.toBeDisabled()
      await user.click(submitBtn)
      expect(mockExecute).toHaveBeenCalledOnce()
      const [calledProvider, calledDescription, calledAmount, calledDeadline] = mockExecute.mock.calls[0] as [string, string, bigint, bigint]
      expect(calledProvider.toLowerCase()).toBe(VALID_PROVIDER.toLowerCase())
      expect(calledDescription).toBe('Test task description')
      expect(calledAmount).toBe(1_000_000n)   // 1 USDC at 6 decimals
      expect(calledDeadline).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)))
    })
  })

  // ── T-28: invalid form fields ───────────────────────────────────────────────
  describe('T-28: invalid form fields prevent execute()', () => {
    it('execute() not called when provider address is invalid', async () => {
      const user = userEvent.setup()
      renderSheet(true)
      // Fill valid fields except provider
      const providerInput = screen.getByPlaceholderText('0x…')
      await user.type(providerInput, '0xINVALID')
      const amountInput = screen.getByPlaceholderText('0.00')
      await user.type(amountInput, VALID_AMOUNT)
      const deadlineInput = screen.getByDisplayValue(/T\d{2}:\d{2}$/)
      fireEvent.change(deadlineInput, { target: { value: futureDeadline() } })

      const submitBtn = screen.getByRole('button', { name: /create task/i })
      expect(submitBtn).toBeDisabled()   // canSubmit=false (providerValid=false)
      await user.click(submitBtn)
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('execute() not called when amount is zero', async () => {
      const user = userEvent.setup()
      renderSheet(true)
      const providerInput = screen.getByPlaceholderText('0x…')
      await user.type(providerInput, VALID_PROVIDER)
      const amountInput = screen.getByPlaceholderText('0.00')
      await user.type(amountInput, '0')
      const deadlineInput = screen.getByDisplayValue(/T\d{2}:\d{2}$/)
      fireEvent.change(deadlineInput, { target: { value: futureDeadline() } })

      const submitBtn = screen.getByRole('button', { name: /create task/i })
      expect(submitBtn).toBeDisabled()   // amountValid=false (parsedAmount=0n)
      await user.click(submitBtn)
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('execute() not called when amount field is empty', async () => {
      const user = userEvent.setup()
      renderSheet(true)
      const providerInput = screen.getByPlaceholderText('0x…')
      await user.type(providerInput, VALID_PROVIDER)
      // Do not fill amount — leave empty
      const deadlineInput = screen.getByDisplayValue(/T\d{2}:\d{2}$/)
      fireEvent.change(deadlineInput, { target: { value: futureDeadline() } })

      const submitBtn = screen.getByRole('button', { name: /create task/i })
      expect(submitBtn).toBeDisabled()   // amountValid=false
      await user.click(submitBtn)
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  // ── T-29: dialog rendering ──────────────────────────────────────────────────
  describe('T-29: dialog rendering', () => {
    it('renders form when open=true', () => {
      renderSheet(true)
      expect(screen.getByRole('heading', { name: /new escrow task/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('0x…')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    })

    it('does not render when open=false', () => {
      render(<CreateTaskSheet open={false} onClose={vi.fn()} contractVerified={true} />)
      expect(screen.queryByRole('heading', { name: /new escrow task/i })).not.toBeInTheDocument()
    })

    it('shows self-escrow warning when provider matches connected wallet', async () => {
      const user = userEvent.setup()
      renderSheet(true)
      const providerInput = screen.getByPlaceholderText('0x…')
      // Type the connected wallet address as provider
      await user.type(providerInput, '0x70B7779b9f6698dc85EcC1F346781709a8356FBF')
      await waitFor(() => {
        expect(screen.getByText(/self-escrow/i)).toBeInTheDocument()
      })
    })
  })
})
