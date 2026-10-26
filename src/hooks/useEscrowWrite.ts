/**
 * useEscrowWrite — write hooks for all AgentBondEscrow state-mutating functions.
 *
 * USDC approval flow (fundTask):
 *   1. Read the employer's current USDC allowance for the escrow contract.
 *   2. If allowance < task.amount, show "Approve USDC" first.
 *   3. On approval confirmation, automatically surface "Fund Task".
 *   4. fundTask calls safeTransferFrom, so allowance must be >= task.amount.
 *
 *   The USDC address comes from getUsdcAddress() (Arc Studio registry, chainId 5042002).
 *   It is never hardcoded here.
 */
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from 'wagmi'
import { erc20Abi } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { ESCROW_ABI } from '@/lib/escrow-abi'
import {
  CONTRACT_ADDRESS,
  TARGET_CHAIN_ID,
  isContractDeployed,
  getUsdcAddress,
} from '@/lib/escrow-contract'
import { parseContractError } from '@/lib/format'

/**
 * Generic single-write hook with pending/confirming/success/error lifecycle.
 * @param contractVerified - must be true (bytecode confirmed on-chain) for writes to proceed.
 */
function useEscrowAction(
  fnName: 'fundTask' | 'submitWork' | 'approveWork' | 'requestRefund' | 'claimPayment',
  contractVerified: boolean,
) {
  const queryClient = useQueryClient()
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: TARGET_CHAIN_ID,
  })

  // Invalidate task reads after confirmation so the list refreshes immediately.
  const prevSuccess = isSuccess
  if (prevSuccess) {
    void queryClient.invalidateQueries()
  }

  const execute = (taskId: bigint) => {
    if (!contractVerified || !isContractDeployed || !CONTRACT_ADDRESS) return
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: fnName,
      args: [taskId],
      chainId: TARGET_CHAIN_ID,
    })
  }

  const errorMessage = writeError
    ? parseContractError(writeError)
    : receiptError
      ? parseContractError(receiptError)
      : null

  return { execute, hash, isPending, isConfirming, isSuccess, errorMessage, reset }
}

// ── Public hooks ─────────────────────────────────────────────────────────────

export function useSubmitWork(contractVerified: boolean)    { return useEscrowAction('submitWork', contractVerified) }
export function useApproveWork(contractVerified: boolean)   { return useEscrowAction('approveWork', contractVerified) }
export function useRequestRefund(contractVerified: boolean) { return useEscrowAction('requestRefund', contractVerified) }
export function useClaimPayment(contractVerified: boolean)  { return useEscrowAction('claimPayment', contractVerified) }

// ── createTask ───────────────────────────────────────────────────────────────

export function useCreateTask(contractVerified: boolean) {
  const queryClient = useQueryClient()
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash,
    chainId: TARGET_CHAIN_ID,
  })

  if (isSuccess) {
    void queryClient.invalidateQueries()
  }

  const execute = (
    provider: `0x${string}`,
    description: string,
    amount: bigint,
    deadline: bigint,
  ) => {
    if (!contractVerified || !isContractDeployed || !CONTRACT_ADDRESS) return
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'createTask',
      args: [provider, description, amount, deadline],
      chainId: TARGET_CHAIN_ID,
    })
  }

  const errorMessage = writeError
    ? parseContractError(writeError)
    : receiptError ? parseContractError(receiptError) : null

  return { execute, hash, isPending, isConfirming, isSuccess, errorMessage, reset }
}

// ── fundTask (with USDC approval flow) ──────────────────────────────────────

export function useFundTask(contractVerified: boolean, taskId: bigint | undefined, taskAmount: bigint | undefined) {
  const { address: walletAddress } = useAccount()
  const queryClient = useQueryClient()
  const usdcAddress = getUsdcAddress()

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: walletAddress && CONTRACT_ADDRESS ? [walletAddress, CONTRACT_ADDRESS] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: {
      enabled: !!walletAddress && contractVerified && isContractDeployed && !!usdcAddress,
      staleTime: 0,
    },
  })

  const needsApproval =
    taskAmount !== undefined &&
    (allowance === undefined || (allowance) < taskAmount)

  // Approve hook
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    error: approveWriteError,
    reset: resetApprove,
  } = useWriteContract()

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveReceiptError,
  } = useWaitForTransactionReceipt({ hash: approveHash, chainId: TARGET_CHAIN_ID })

  if (isApproveSuccess) {
    void refetchAllowance()
    void queryClient.invalidateQueries()
  }

  // Fund hook
  const {
    writeContract: writeFund,
    data: fundHash,
    isPending: isFundPending,
    error: fundWriteError,
    reset: resetFund,
  } = useWriteContract()

  const {
    isLoading: isFundConfirming,
    isSuccess: isFundSuccess,
    error: fundReceiptError,
  } = useWaitForTransactionReceipt({ hash: fundHash, chainId: TARGET_CHAIN_ID })

  if (isFundSuccess) {
    void queryClient.invalidateQueries()
  }

  const approve = () => {
    if (!contractVerified || !usdcAddress || !CONTRACT_ADDRESS || taskAmount === undefined) return
    writeApprove({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, taskAmount],
      chainId: TARGET_CHAIN_ID,
    })
  }

  const fund = () => {
    if (!contractVerified || !isContractDeployed || !CONTRACT_ADDRESS || taskId === undefined) return
    writeFund({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'fundTask',
      args: [taskId],
      chainId: TARGET_CHAIN_ID,
    })
  }

  const approveError = approveWriteError
    ? parseContractError(approveWriteError)
    : approveReceiptError ? parseContractError(approveReceiptError) : null

  const fundError = fundWriteError
    ? parseContractError(fundWriteError)
    : fundReceiptError ? parseContractError(fundReceiptError) : null

  return {
    needsApproval,
    approve,
    fund,
    approveHash,
    fundHash,
    isApprovePending,
    isApproveConfirming,
    isApproveSuccess,
    isFundPending,
    isFundConfirming,
    isFundSuccess,
    approveError,
    fundError,
    resetApprove,
    resetFund,
    allowance: allowance,
  }
}
