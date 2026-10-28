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

  const card = {
    type:        'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name:        'FinancialDataAgent',
    description: 'Autonomous AI agent that computes financial metrics (volatility, Sharpe ratio, beta, RSI) for any asset. Each query costs 0.001 USDC, settled via Circle Gateway Nanopayments on Arc Mainnet.',
    services: [
      {
        name:     'FinancialQuery',
        endpoint: '/api/agent/query',
        version:  '1.0.0',
        schema: {
          request: {
            asset:  'string — ticker symbol e.g. BTC, ETH, SOL',
            metric: 'string — volatility | return | sharpe | beta | volume | price | rsi',
            period: 'string — 7d | 30d | 90d | 1y',
          },
          response: {
            asset:              'string',
            metric:             'string',
            period:             'string',
            value:              'number',
            unit:               'string',
            confidence:         'number 0-100',
            computedAt:         'ISO-8601 timestamp',
            agentId:            'string',
            settlementVerified: 'boolean',
          },
        },
      },
    ],
    x402Support:   true,
    x402Price:     '0.001 USDC',
    active:        true,
    sellerAddress: sellerAddr,
    registrations: agentId !== 'unregistered'
      ? [{ agentId: Number(agentId), agentRegistry: `eip155:5042:${IDENTITY_REGISTRY}` }]
      : [],
    supportedTrust: ['reputation'],
  };

  res.status(200).json(card);
}
