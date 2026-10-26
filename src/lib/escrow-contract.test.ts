/**
 * Tests for src/lib/escrow-contract.ts
 *
 * CONTRACT_ADDRESS and isContractDeployed are computed at module-load time from
 * import.meta.env.VITE_CONTRACT_ADDRESS. To test different env values we must:
 *   1. vi.stubEnv() — override import.meta.env for the duration of the test
 *   2. vi.resetModules() — clear the module cache so the next dynamic import
 *      re-evaluates the module with the new env value
 *   3. Dynamic import — re-import the module and read the freshly computed values
 *
 * env cleanup runs in afterEach via vi.unstubAllEnvs().
 *
 * Naming convention matches the plan IDs from the frontend test plan (T-1..T-8).
 */

const ENV_KEY = 'VITE_CONTRACT_ADDRESS'
const VALID_ADDRESS = '0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC'
const ZERO_ADDRESS  = '0x0000000000000000000000000000000000000000'

/**
 * Re-import the module under a specific env value, returning the fresh exports.
 *
 * NOTE on "undefined" env:
 *   Vitest runs inside the Vite dev server which has already injected
 *   import.meta.env.VITE_CONTRACT_ADDRESS from the real .env file via Vite's
 *   define transform. vi.unstubAllEnvs() removes vi.stubEnv overrides but does
 *   NOT remove Vite's original define injection — so calling importWithEnv(undefined)
 *   would re-expose the real sandbox testnet address, not undefined.
 *
 *   The practical equivalent of "env variable not set" is an empty string, which
 *   is what a .env file with `VITE_CONTRACT_ADDRESS=` (no value) produces at
 *   runtime. T-2b and T-8c are therefore written with '' rather than undefined.
 */
async function importWithEnv(value: string) {
  vi.stubEnv(ENV_KEY, value)
  vi.resetModules()
  return import('@/lib/escrow-contract')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// isContractDeployed — format validation
// ---------------------------------------------------------------------------

describe('isContractDeployed — format validation', () => {
  it('T-1: valid 42-character hex address → true', async () => {
    const mod = await importWithEnv(VALID_ADDRESS)
    expect(mod.isContractDeployed).toBe(true)
  })

  it('T-2a: empty string → false', async () => {
    const mod = await importWithEnv('')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-2b: empty string (practical equivalent of unset env) → false', async () => {
    // Vitest cannot fully remove Vite define-injected env values at runtime.
    // An empty string is what a .env file with `VITE_CONTRACT_ADDRESS=` produces
    // and is the correct proxy for "env variable not configured".
    const mod = await importWithEnv('')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-3a: address with 39 hex chars (1 short) → false', async () => {
    const mod = await importWithEnv('0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957C')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-3b: address with 41 hex chars (1 extra) → false', async () => {
    const mod = await importWithEnv('0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CCA')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-3c: address with no 0x prefix → false', async () => {
    const mod = await importWithEnv('49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC12')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-3d: only "0x" with no hex chars → false', async () => {
    const mod = await importWithEnv('0x')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-4: address with non-hex character (G) → false', async () => {
    // Replace last two hex chars with 'GG'
    const bad = VALID_ADDRESS.slice(0, -2) + 'GG'
    const mod = await importWithEnv(bad)
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-5: literal string "undefined" → false', async () => {
    const mod = await importWithEnv('undefined')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-6: literal string "placeholder" → false', async () => {
    const mod = await importWithEnv('placeholder')
    expect(mod.isContractDeployed).toBe(false)
  })

  it('T-7a: zero address has valid format → isContractDeployed is true', async () => {
    // The format check passes for the zero address because it is 0x + 40 hex chars.
    // Bytecode verification (useContractVerification hook) is responsible for
    // detecting that no contract lives at the zero address on-chain.
    // This test documents that intended behaviour — do not change it.
    const mod = await importWithEnv(ZERO_ADDRESS)
    expect(mod.isContractDeployed).toBe(true)
  })

  it('T-7b: zero address — CONTRACT_ADDRESS is defined (not undefined)', async () => {
    const mod = await importWithEnv(ZERO_ADDRESS)
    expect(mod.CONTRACT_ADDRESS).toBe(ZERO_ADDRESS)
  })
})

// ---------------------------------------------------------------------------
// CONTRACT_ADDRESS — value shape
// ---------------------------------------------------------------------------

describe('CONTRACT_ADDRESS — value shape', () => {
  it('T-8a: valid address → CONTRACT_ADDRESS equals the env value', async () => {
    const mod = await importWithEnv(VALID_ADDRESS)
    expect(mod.CONTRACT_ADDRESS).toBe(VALID_ADDRESS)
  })

  it('T-8b: empty string → CONTRACT_ADDRESS is undefined', async () => {
    const mod = await importWithEnv('')
    expect(mod.CONTRACT_ADDRESS).toBeUndefined()
  })

  it('T-8c: empty string (unset env) → CONTRACT_ADDRESS is undefined', async () => {
    const mod = await importWithEnv('')
    expect(mod.CONTRACT_ADDRESS).toBeUndefined()
  })

  it('T-8d: malformed address → CONTRACT_ADDRESS is undefined', async () => {
    const mod = await importWithEnv('0x1234')
    expect(mod.CONTRACT_ADDRESS).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Format check does NOT guarantee on-chain deployment
// ---------------------------------------------------------------------------

describe('format check vs on-chain deployment', () => {
  it('T-9: isContractDeployed=true does NOT mean bytecode exists on-chain', async () => {
    // Any address that passes the regex is marked deployed by this module.
    // An address that has never had a contract deployed at it will also pass.
    // Bytecode verification is the responsibility of useContractVerification.
    // This test asserts that a plausible-looking but undeployed address passes
    // format validation, making the distinction explicit.
    const plausibleButUndeployed = '0xDeAdBeEf00000000000000000000000000000001'
    const mod = await importWithEnv(plausibleButUndeployed)
    expect(mod.isContractDeployed).toBe(true)
    // The comment below is the load-bearing documentation: format !== deployed.
    // useContractVerification must be consulted to determine actual deployment.
  })
})

// ---------------------------------------------------------------------------
// TARGET_CHAIN_ID — static constant
// ---------------------------------------------------------------------------

describe('TARGET_CHAIN_ID', () => {
  it('T-10: TARGET_CHAIN_ID defaults to Arc Testnet chain ID 5042002 when VITE_CHAIN_ID is not set', async () => {
    // In the test runner VITE_CHAIN_ID is not injected by Vite, so chain-config
    // falls back to ARC_TESTNET_CHAIN_ID (5042002). This covers both the testnet
    // build path and the local development fallback.
    const mod = await importWithEnv(VALID_ADDRESS)
    expect(mod.TARGET_CHAIN_ID).toBe(5042002)
  })
})

// ---------------------------------------------------------------------------
// getUsdcDecimals — static fallback
// ---------------------------------------------------------------------------

describe('getUsdcDecimals', () => {
  it('T-11: returns 6 for the configured target chain', async () => {
    const mod = await importWithEnv(VALID_ADDRESS)
    expect(mod.getUsdcDecimals()).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// MAX_DISPLAY_TASKS — static constant
// ---------------------------------------------------------------------------

describe('MAX_DISPLAY_TASKS', () => {
  it('T-12: MAX_DISPLAY_TASKS is 50', async () => {
    const mod = await importWithEnv(VALID_ADDRESS)
    expect(mod.MAX_DISPLAY_TASKS).toBe(50)
  })
})
