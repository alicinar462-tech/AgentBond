/**
 * useEscrowTasks — reads all tasks from the deployed AgentBondEscrow contract.
 *
 * Refresh strategy:
 *   1. On mount, read `nextTaskId` to know how many tasks exist.
 *   2. Batch-read tasks(1) … tasks(nextTaskId-1) via a single `useReadContracts`
 *      call, capped at the 50 most recent (MAX_DISPLAY_TASKS) to bound RPC load.
 *   3. wagmi re-runs reads when `watch: true` fires a new block (roughly every
 *      2 seconds on Arc Testnet). This keeps the list fresh without manual polling.
 *      The `staleTime` is set to 0 so any newly confirmed block triggers a re-read.
 *   4. After any write (create, fund, submit, approve, refund), callers invalidate
 *      the query via `queryClient.invalidateQueries` so the list refreshes immediately
 *      without waiting for the next block watch interval.
 *
 * No event indexing or off-chain backend is required.
 */
import { useReadContract, useReadContracts } from 'wagmi'
import { useMemo } from 'react'
import { ESCROW_ABI } from '@/lib/escrow-abi'
import { CONTRACT_ADDRESS, TARGET_CHAIN_ID, MAX_DISPLAY_TASKS } from '@/lib/escrow-contract'
import { type Task, TaskState } from '@/lib/types'

/** Read the current nextTaskId from the contract. */
export function useNextTaskId(contractVerified: boolean) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'nextTaskId',
    chainId: TARGET_CHAIN_ID,
    query: {
      enabled: contractVerified,
      staleTime: 0,
      refetchInterval: 4000, // poll every ~4 s as a safety net beyond block watch
    },
  })
}

/** Batch-read up to MAX_DISPLAY_TASKS most-recent tasks. Returns them newest-first. */
export function useEscrowTasks(contractVerified: boolean) {
  const { data: nextIdData, isLoading: idLoading } = useNextTaskId(contractVerified)

  const nextId = typeof nextIdData === 'bigint' ? nextIdData : 0n
  // Build the list of IDs to read: the 50 most recent, newest-first.
  const idsToRead = useMemo<bigint[]>(() => {
    if (nextId <= 1n) return []
    const total = nextId - 1n                           // tasks 1 … nextId-1
    const start = total > BigInt(MAX_DISPLAY_TASKS)
      ? nextId - BigInt(MAX_DISPLAY_TASKS)              // oldest of the window
      : 1n
    const ids: bigint[] = []
    for (let id = nextId - 1n; id >= start; id--) {
      ids.push(id)
    }
    return ids
  }, [nextId])

  const contracts = useMemo(() =>
    idsToRead.map((id) => ({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'tasks' as const,
      args: [id] as [bigint],
      chainId: TARGET_CHAIN_ID,
    })),
    [idsToRead],
  )

  const { data: rawTasks, isLoading: tasksLoading, isError, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: contractVerified && idsToRead.length > 0,
      staleTime: 0,
      refetchInterval: 4000,
    },
  })

  const tasks = useMemo<Task[]>(() => {
    if (!rawTasks) return []
    return rawTasks.flatMap((result, i) => {
      if (result.status !== 'success' || !result.result) return []
      const [employer, provider, description, amount, deadline, submissionTime, stateNum] = result.result as [
        `0x${string}`, `0x${string}`, string, bigint, bigint, bigint, number
      ]
      // Skip zero-address entries (should not happen, but be safe)
      if (employer === '0x0000000000000000000000000000000000000000') return []
      return [{
        id:             idsToRead[i],
        employer,
        provider,
        description,
        amount,
        deadline,
        submissionTime,
        state: stateNum,
      }]
    })
  }, [rawTasks, idsToRead])

  return {
    tasks,
    isLoading: idLoading || (idsToRead.length > 0 && tasksLoading),
    isError,
    refetch,
    totalKnown: nextId > 0n ? Number(nextId) - 1 : 0,
    showing: idsToRead.length,
  }
}

/** Read a single task by ID. */
export function useTask(contractVerified: boolean, taskId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'tasks',
    args: taskId !== undefined ? [taskId] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: {
      enabled: contractVerified && taskId !== undefined,
      staleTime: 0,
    },
  })

  const task = useMemo<Task | null>(() => {
    if (!data || taskId === undefined) return null
    const [employer, provider, description, amount, deadline, submissionTime, stateNum] = data as [
      `0x${string}`, `0x${string}`, string, bigint, bigint, bigint, number
    ]
    if (employer === '0x0000000000000000000000000000000000000000') return null
    return { id: taskId, employer, provider, description, amount, deadline, submissionTime, state: stateNum as TaskState }
  }, [data, taskId])

  return { task, isLoading, refetch }
}
