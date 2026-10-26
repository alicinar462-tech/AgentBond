/**
 * Tests for src/lib/chain-config.ts
 *
 * chain-config reads VITE_CHAIN_ID from import.meta.env at module load time.
 * To test different values we use vi.stubEnv() + vi.resetModules() + dynamic
 * import — the same pattern used in escrow-contract.test.ts.
 */

const CHAIN_ID_KEY    = 'VITE_CHAIN_ID'
const CHAIN_LABEL_KEY = 'VITE_CHAIN_LABEL'

async function importChainConfig(chainId?: string, chainLabel?: string) {
  if (chainId !== undefined) {
    vi.stubEnv(CHAIN_ID_KEY, chainId)
  }
  if (chainLabel !== undefined) {
    vi.stubEnv(CHAIN_LABEL_KEY, chainLabel)
  }
  vi.resetModules()
  return import('@/lib/chain-config')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// TARGET_CHAIN_ID — chain selection
// ---------------------------------------------------------------------------

describe('TARGET_CHAIN_ID', () => {
  it('CC-1: VITE_CHAIN_ID not set → defaults to Arc Testnet (5042002)', async () => {
    const mod = await importChainConfig()
    expect(mod.TARGET_CHAIN_ID).toBe(5042002)
  })

  it('CC-2: VITE_CHAIN_ID=5042002 → Arc Testnet', async () => {
    const mod = await importChainConfig('5042002')
    expect(mod.TARGET_CHAIN_ID).toBe(5042002)
  })

  it('CC-3: VITE_CHAIN_ID=5042 → Arc Mainnet', async () => {
    const mod = await importChainConfig('5042')
    expect(mod.TARGET_CHAIN_ID).toBe(5042)
  })

  it('CC-4: VITE_CHAIN_ID empty string → falls back to Arc Testnet (5042002)', async () => {
    const mod = await importChainConfig('')
    expect(mod.TARGET_CHAIN_ID).toBe(5042002)
  })

  it('CC-5: VITE_CHAIN_ID invalid value → throws at module load', async () => {
    await expect(importChainConfig('1')).rejects.toThrow(
      /VITE_CHAIN_ID="1" is not a supported Arc chain ID/
    )
  })

  it('CC-6: VITE_CHAIN_ID="9999999" (unknown) → throws at module load', async () => {
    await expect(importChainConfig('9999999')).rejects.toThrow(
      /VITE_CHAIN_ID="9999999" is not a supported Arc chain ID/
    )
  })
})

// ---------------------------------------------------------------------------
// arcChain — viem chain object
// ---------------------------------------------------------------------------

describe('arcChain', () => {
  it('CC-7: testnet mode → arcChain.id is 5042002', async () => {
    const mod = await importChainConfig('5042002')
    expect(mod.arcChain.id).toBe(5042002)
  })

  it('CC-8: mainnet mode → arcChain.id is 5042', async () => {
    const mod = await importChainConfig('5042')
    expect(mod.arcChain.id).toBe(5042)
  })

  it('CC-9: fallback → arcChain.id is 5042002', async () => {
    const mod = await importChainConfig()
    expect(mod.arcChain.id).toBe(5042002)
  })
})

// ---------------------------------------------------------------------------
// CHAIN_LABEL — display label
// ---------------------------------------------------------------------------

describe('CHAIN_LABEL', () => {
  it('CC-10: VITE_CHAIN_LABEL set → returns provided label', async () => {
    const mod = await importChainConfig('5042002', 'Arc Testnet')
    expect(mod.CHAIN_LABEL).toBe('Arc Testnet')
  })

  it('CC-11: VITE_CHAIN_LABEL set to mainnet label → returns provided label', async () => {
    const mod = await importChainConfig('5042', 'Arc Mainnet')
    expect(mod.CHAIN_LABEL).toBe('Arc Mainnet')
  })

  it('CC-12: VITE_CHAIN_LABEL not set → falls back to arcChain.name', async () => {
    const mod = await importChainConfig('5042002')
    // arcTestnet.name from viem — should be a non-empty string
    expect(typeof mod.CHAIN_LABEL).toBe('string')
    expect(mod.CHAIN_LABEL.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('CC-13: ARC_TESTNET_CHAIN_ID is 5042002', async () => {
    const mod = await importChainConfig()
    expect(mod.ARC_TESTNET_CHAIN_ID).toBe(5042002)
  })

  it('CC-14: ARC_MAINNET_CHAIN_ID is 5042', async () => {
    const mod = await importChainConfig()
    expect(mod.ARC_MAINNET_CHAIN_ID).toBe(5042)
  })
})
