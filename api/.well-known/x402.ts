/**
 * Vercel serverless function — GET /.well-known/x402
 *
 * Standard x402 v2 discovery file. Tolly and other x402 indexers fetch this
 * path from the domain root to enumerate payable services.
 *
 * Schema matches https://agent.tollylabs.com/.well-known/x402
 * arc-studio-allow-onchain-literal
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE_URL  = 'https://arc-studio-8d53b7238bae4af6bbfb806d.vercel.app';
const SELLER    = process.env.VITE_SELLER_ADDRESS as string;
// Arc Mainnet USDC — source: https://developers.circle.com/stablecoins/usdc-on-chains
// arc-studio-allow-onchain-literal
const ARC_USDC  = '0x3600000000000000000000000000000000000000';
const ARC_CHAIN = 'eip155:5042';
// Circle Gateway Batched verifying contract — same across chains
// arc-studio-allow-onchain-literal
const GATEWAY_V2 = '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee';
// 0.001 USDC = 1000 units (6 decimals); $10 max = 10_000_000 units
const AMOUNT     = '1000';
const MAX_AMOUNT = '10000000';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache');

  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const accepts = [
    {
      scheme:            'exact',
      network:           ARC_CHAIN,
      asset:             ARC_USDC,
      amount:            AMOUNT,
      maxAmount:         MAX_AMOUNT,
      payTo:             SELLER,
      maxTimeoutSeconds: 604900,
      extra: {
        name:              'GatewayWalletBatched',
        version:           '2',
        verifyingContract: GATEWAY_V2,
      },
    },
  ];

  const discovery = {
    x402Version: 2,
    payTo:       SELLER,
    items: [
      {
        resource:    `${BASE_URL}/api/agent/query`,
        type:        'http',
        x402Version: 2,
        accepts,
        lastUpdated: new Date().toISOString(),
        description: 'Computes financial metrics (volatility, Sharpe ratio, beta, RSI) for any asset. POST with { asset, metric, period }.',
        mimeType:    'application/json',
        serviceName: 'FinancialDataAgent',
        tags:        ['finance', 'arc', 'usdc', 'metrics'],
        extensions: {
          bazaar: {
            info: {
              input: {
                type:     'http',
                method:   'POST',
                bodyType: 'json',
                body: { asset: 'ETH', metric: 'volatility', period: '30d' },
              },
              output: {
                type:    'json',
                example: { asset: 'ETH', metric: 'volatility', value: 0.42, unit: 'annualised σ' },
              },
            },
          },
        },
      },
    ],
  };

  res.status(200).json(discovery);
}
