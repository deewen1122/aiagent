/** Vercel serverless function — GET /api/agent/card
 *
 * Returns an x402 v2 discovery document so Tolly and other x402 indexers
 * can find the payment requirements for /api/agent/query.
 *
 * arc-studio-allow-onchain-literal
 * Seller address and Arc USDC are well-known public constants for this agent.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Stable production URL — never a per-deploy preview URL
const BASE_URL  = 'https://arc-studio-8d53b7238bae4af6bbfb806d.vercel.app'; // arc-studio-allow-onchain-literal
const QUERY_URL = `${BASE_URL}/api/agent/query`;

// arc-studio-allow-onchain-literal
// Arc Mainnet USDC ERC-20 — source: https://developers.circle.com/stablecoins/usdc-on-chains
const ARC_USDC = '0x3600000000000000000000000000000000000000';
const NETWORK  = 'eip155:5042';

// arc-studio-allow-onchain-literal
// Operator/seller wallet — reads from env, falls back to the registered operator address
const SELLER = (
  process.env.VITE_SELLER_ADDRESS ?? '0x29566e53136f50a3f93ceb3d336db89e73c03306'
).toLowerCase();

// Shared payment requirement — identical in discovery and live 402 offer
export const PAYMENT_REQUIREMENT = {
  scheme:            'exact',
  network:           NETWORK,
  asset:             ARC_USDC,
  amount:            '1000',
  payTo:             SELLER,
  maxTimeoutSeconds: 300,
  extra: {
    name:    'USDC',
    version: '2',
  },
};

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache');

  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    x402Version: 2,
    items: [
      {
        resource:    QUERY_URL,
        type:        'http',
        x402Version: 2,
        accepts:     [PAYMENT_REQUIREMENT],
        description: 'Computes volatility, Sharpe ratio, beta, and RSI for any asset.',
        mimeType:    'application/json',
      },
    ],
  });
}
