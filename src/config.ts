/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { arcChain } from '@/lib/chain-config'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcChain.id, arcChain.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcChain, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcChain.id]: http(arcChain.rpcUrls.default.http[0]),
    [mainnet.id]:  http(), // ENS resolution uses mainnet
  } as Record<typeof arcChain.id | typeof mainnet.id, ReturnType<typeof http>>,
})
