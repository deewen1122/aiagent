/**
 * ERC-8004 Agent Registration Script
 *
 * Registers the FinancialDataAgent on the Arc Testnet identity registry.
 * Writes VITE_AGENT_ID to .env after successful registration.
 *
 * Usage:
 *   bun run scripts/register-agent.ts
 *
 * Required env vars:
 *   AGENT_OWNER_PRIVATE_KEY  — hex private key of the agent owner wallet
 *   VITE_SELLER_ADDRESS      — EVM address to receive payment settlements
 */

import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;

const identityAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId',   type: 'uint256', indexed: true  },
      { name: 'agentURI',  type: 'string',  indexed: false },
      { name: 'owner',     type: 'address', indexed: true  },
    ],
  },
] as const;

async function main() {
  const rawKey = process.env.AGENT_OWNER_PRIVATE_KEY;
  if (!rawKey) {
    console.error('[register-agent] ERROR: AGENT_OWNER_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const pk   = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
  const account = privateKeyToAccount(pk as `0x${string}`);
  console.log('[register-agent] Owner wallet:', account.address);

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });

  // Use the /agent/card endpoint as the agentURI — it's served by this same server
  // In production this would be an IPFS URI pointing to an immutable card file.
  // During development we point at our own /api/agent/card endpoint served via Vite proxy.
  const agentURI = 'https://iz8b1a8jcsxcsat7h9m0v.preview.studio.arc.io/api/agent/card';

  console.log('[register-agent] agentURI:', agentURI);
  console.log('[register-agent] Sending registration tx...');

  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi:     identityAbi,
    functionName: 'register',
    args:    [agentURI],
  });

  console.log('[register-agent] Tx hash:', hash);
  console.log('[register-agent] Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('[register-agent] Confirmed in block:', receipt.blockNumber.toString());

  const [event] = parseEventLogs({
    abi:       identityAbi,
    eventName: 'Registered',
    logs:      receipt.logs,
  });

  if (!event) {
    console.error('[register-agent] ERROR: Registered event not found in receipt');
    process.exit(1);
  }

  const agentId = event.args.agentId.toString();
  console.log('[register-agent] Agent ID:', agentId);

  // Persist to .env
  const envPath = join(process.cwd(), '.env');
  let envContents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (envContents.includes('VITE_AGENT_ID=')) {
    envContents = envContents.replace(/VITE_AGENT_ID=.*/g, `VITE_AGENT_ID=${agentId}`);
    writeFileSync(envPath, envContents);
  } else {
    writeFileSync(envPath, envContents + `\nVITE_AGENT_ID=${agentId}\n`);
  }

  console.log(`[register-agent] Done. VITE_AGENT_ID=${agentId} written to .env`);
  console.log(`[register-agent] Explorer: https://explorer.testnet.arc.io/address/${IDENTITY_REGISTRY}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
