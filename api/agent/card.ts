/** Vercel serverless function — GET /api/agent/card
 *
 * Returns the ERC-8004 agent registration card as JSON.
 * CORS is open so ArcID and any external indexer can read it unauthenticated.
 * Reads VITE_* env vars which Vercel injects as plain env vars (not browser-bundled).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Arc Mainnet ERC-8004 IdentityRegistry
// Source: https://docs.arc.io/arc/references/contract-addresses.md
// arc-studio-allow-onchain-literal
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const agentId    = process.env.VITE_AGENT_ID_MAINNET ?? 'unregistered';
  const sellerAddr = process.env.VITE_SELLER_ADDRESS   ?? '0x0000000000000000000000000000000000000000';

  const serviceEntry = {
    name:        'FinancialQuery',
    endpoint:    '/api/agent/query',
    description: 'Computes financial metrics (volatility, Sharpe ratio, beta, RSI) for any asset.',
    price:       '0.001',
  };

  const card = {
    name:        'FinancialDataAgent',
    description: 'Autonomous AI agent that computes financial metrics (volatility, Sharpe ratio, beta, RSI) for any asset.',
    image:       null,
    x402:        true,
    services:    [serviceEntry],
    items:       [serviceEntry],
    // ERC-8004 extended fields (preserved for registry indexers)
    type:          'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    active:        true,
    sellerAddress: sellerAddr,
    registrations: agentId !== 'unregistered'
      ? [{ agentId: Number(agentId), agentRegistry: `eip155:5042:${IDENTITY_REGISTRY}` }]
      : [],
  };

  res.status(200).json(card);
}
