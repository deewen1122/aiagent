/**
 * ERC-8004 Agent Registration Script
 *
 * Registers the FinancialDataAgent on the Arc identity registry.
 * Supports both Arc Testnet and Arc Mainnet.
 * Writes VITE_AGENT_ID / VITE_AGENT_ID_MAINNET to .env after successful registration.
 *
 * Usage:
 *   bun run scripts/register-agent.ts                   # Arc Testnet (default)
 *   bun run scripts/register-agent.ts --network mainnet # Arc Mainnet (REAL USDC)
 *
 * Required env vars:
 *   AGENT_OWNER_PRIVATE_KEY      — hex private key of the agent owner wallet
 *   VITE_SELLER_ADDRESS          — EVM address to receive payment settlements
 *
 * Optional env vars:
 *   VITE_AGENT_URI               — Override the agentURI (IPFS or HTTPS).
 *                                  For mainnet, use a permanent URI (IPFS recommended).
 */

import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, arc } from 'viem/chains';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// ERC-8004 registry addresses — verified from https://docs.arc.io/arc/references/contract-addresses.md
// arc-studio-allow-onchain-literal
const REGISTRIES = {
  testnet: {
    identity:   '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const,
    reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const,
    explorer:   'https://explorer.testnet.arc.io',
  },
  mainnet: {
    identity:   '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const,
    reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const,
    explorer:   'https://explorer.arc.io',
  },
};

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
      { name: 'agentId',  type: 'uint256', indexed: true  },
      { name: 'agentURI', type: 'string',  indexed: false },
      { name: 'owner',    type: 'address', indexed: true  },
    ],
  },
] as const;

async function main() {
  // ---------------------------------------------------------------------------
  // Network selection
  // ---------------------------------------------------------------------------
  const isMainnet = process.argv.includes('--network') &&
    process.argv[process.argv.indexOf('--network') + 1] === 'mainnet';

  const network  = isMainnet ? 'mainnet' : 'testnet';
  const chain    = isMainnet ? arc : arcTestnet;
  const rpcUrl   = isMainnet ? 'https://rpc.mainnet.arc.io' : undefined;
  const registry = REGISTRIES[network];

  console.log(`[register-agent] Network: ${network.toUpperCase()} (Chain ID: ${chain.id})`);

  if (isMainnet) {
    console.log('[register-agent] WARNING: You are registering on ARC MAINNET.');
    console.log('[register-agent] This transaction uses real USDC for gas (~0.006 USDC).');
    console.log('[register-agent] The agentURI should be a permanent IPFS or HTTPS link.');
    console.log('[register-agent] The NFT minted here is immutable — owner is your private key address.');
    console.log('');
  }

  // ---------------------------------------------------------------------------
  // Env checks
  // ---------------------------------------------------------------------------
  const rawKey = process.env.AGENT_OWNER_PRIVATE_KEY;
  if (!rawKey) {
    console.error('[register-agent] ERROR: AGENT_OWNER_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const pk      = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log('[register-agent] Owner wallet:', account.address);

  // ---------------------------------------------------------------------------
  // agentURI
  // ---------------------------------------------------------------------------
  // Mainnet: strongly prefer a permanent URI (IPFS). The /api/agent/card
  // endpoint is a live HTTP route that can change or go offline.
  // Set VITE_AGENT_URI in .env to override with your own IPFS URI.
  const agentURI = process.env.VITE_AGENT_URI
    ?? (isMainnet
      ? (() => {
          console.warn('[register-agent] VITE_AGENT_URI not set. Falling back to live HTTP card endpoint.');
          console.warn('[register-agent] For production mainnet use, set VITE_AGENT_URI to a permanent IPFS URI.');
          return 'https://iz8b1a8jcsxcsat7h9m0v.preview.studio.arc.io/api/agent/card';
        })()
      : 'https://iz8b1a8jcsxcsat7h9m0v.preview.studio.arc.io/api/agent/card');

  console.log('[register-agent] agentURI:', agentURI);
  console.log('[register-agent] IdentityRegistry:', registry.identity);

  // ---------------------------------------------------------------------------
  // Send registration tx
  // ---------------------------------------------------------------------------
  const transport    = rpcUrl ? http(rpcUrl) : http();
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  console.log('[register-agent] Sending registration tx...');

  const hash = await walletClient.writeContract({
    address:      registry.identity,
    abi:          identityAbi,
    functionName: 'register',
    args:         [agentURI],
  });

  console.log('[register-agent] Tx hash:', hash);
  console.log('[register-agent] Explorer:', `${registry.explorer}/tx/${hash}`);
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
  console.log('[register-agent] Registry explorer:', `${registry.explorer}/address/${registry.identity}`);

  // ---------------------------------------------------------------------------
  // Persist to .env
  // ---------------------------------------------------------------------------
  const envKey  = isMainnet ? 'VITE_AGENT_ID_MAINNET' : 'VITE_AGENT_ID';
  const envPath = join(process.cwd(), '.env');
  let envContents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

  if (envContents.includes(`${envKey}=`)) {
    envContents = envContents.replace(new RegExp(`${envKey}=.*`), `${envKey}=${agentId}`);
    writeFileSync(envPath, envContents);
  } else {
    writeFileSync(envPath, envContents + `\n${envKey}=${agentId}\n`);
  }

  console.log(`[register-agent] Done. ${envKey}=${agentId} written to .env`);
}

main().catch((err) => { console.error(err); process.exit(1); });
