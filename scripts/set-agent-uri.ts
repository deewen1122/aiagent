/**
 * set-agent-uri.ts — update the agentURI for an already-registered ERC-8004 agent
 *
 * Calls setAgentURI(agentId, newURI) on the Arc Mainnet (or Testnet) IdentityRegistry.
 * Run this after deploying to a permanent URL to point the on-chain record at your
 * production endpoint.
 *
 * Usage:
 *   AGENT_OWNER_PRIVATE_KEY=0x... VITE_AGENT_ID_MAINNET=2841 \
 *   NEW_AGENT_URI=https://your-app.vercel.app/api/agent/card \
 *   bun run scripts/set-agent-uri.ts
 *
 * Optional:
 *   NETWORK=mainnet (default) | testnet
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arc, arcTestnet } from 'viem/chains';

// Arc Mainnet ERC-8004 IdentityRegistry
// Source: https://docs.arc.io/arc/references/contract-addresses.md
// arc-studio-allow-onchain-literal
const REGISTRIES = {
  mainnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const,
  testnet: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const,
};

const identityAbi = [
  {
    type: 'function',
    name: 'setAgentURI',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI',  type: 'string'  },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'URIUpdated',
    inputs: [
      { name: 'agentId',    type: 'uint256', indexed: true  },
      { name: 'newURI',     type: 'string',  indexed: false },
      { name: 'updatedBy',  type: 'address', indexed: true  },
    ],
  },
] as const;

async function main() {
  const network   = (process.env.NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
  const rawKey    = process.env.AGENT_OWNER_PRIVATE_KEY;
  const agentIdRaw = network === 'mainnet'
    ? process.env.VITE_AGENT_ID_MAINNET
    : process.env.VITE_AGENT_ID;
  const newURI    = process.env.NEW_AGENT_URI;

  if (!rawKey)    { console.error('[set-agent-uri] AGENT_OWNER_PRIVATE_KEY not set'); process.exit(1); }
  if (!agentIdRaw){ console.error(`[set-agent-uri] VITE_AGENT_ID${network === 'mainnet' ? '_MAINNET' : ''} not set`); process.exit(1); }
  if (!newURI)    { console.error('[set-agent-uri] NEW_AGENT_URI not set'); process.exit(1); }

  const agentId = BigInt(agentIdRaw);
  const pk      = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
  const account = privateKeyToAccount(pk as `0x${string}`);
  const chain   = network === 'mainnet' ? arc : arcTestnet;
  const rpcUrl  = network === 'mainnet' ? 'https://rpc.mainnet.arc.io' : undefined;

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const registry     = REGISTRIES[network];

  console.log(`[set-agent-uri] Network:   ${network} (chain ${chain.id})`);
  console.log(`[set-agent-uri] Registry:  ${registry}`);
  console.log(`[set-agent-uri] Agent ID:  ${agentId}`);
  console.log(`[set-agent-uri] Owner:     ${account.address}`);
  console.log(`[set-agent-uri] New URI:   ${newURI}`);
  console.log('[set-agent-uri] Sending setAgentURI tx...');

  const hash = await walletClient.writeContract({
    address:      registry,
    abi:          identityAbi,
    functionName: 'setAgentURI',
    args:         [agentId, newURI],
  });

  console.log(`[set-agent-uri] Tx hash: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[set-agent-uri] Confirmed in block: ${receipt.blockNumber}`);
  console.log(`[set-agent-uri] Explorer: https://explorer${network === 'testnet' ? '.testnet' : ''}.arc.io/tx/${hash}`);
  console.log('[set-agent-uri] agentURI updated successfully.');
}

main().catch((err) => { console.error(err); process.exit(1); });
