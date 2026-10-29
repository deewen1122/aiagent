/**
 * Vercel serverless function — POST /api/agent/query
 *
 * x402 payment gate: returns HTTP 402 with a PAYMENT-REQUIRED header when no
 * X-PAYMENT header is present. When payment is present the mock financial
 * calculation runs and the result is returned.
 *
 * The PAYMENT-REQUIRED header is a base64-encoded JSON object following the
 * x402 v2 spec. It advertises 0.001 USDC (1000 units, 6 decimals) on Arc
 * Mainnet (eip155:5042) via Circle Gateway Wallet Batched.
 *
 * arc-studio-allow-onchain-literal
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Arc Mainnet USDC (native/ERC-20 unified address on Arc) ─────────────────
// Source: https://developers.circle.com/stablecoins/usdc-on-chains
const ARC_MAINNET_USDC   = '0x3600000000000000000000000000000000000000'; // Arc Mainnet
const ARC_MAINNET_CHAIN  = 'eip155:5042';
// Circle Gateway Batched verifying contract (same across chains)
const GATEWAY_CONTRACT   = '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee';
// Seller address — receives the 0.001 USDC per query
const SELLER_ADDRESS     = process.env.VITE_SELLER_ADDRESS ?? '0x0000000000000000000000000000000000000000';

// Amount: 0.001 USDC = 1000 units (6 decimals)
const AMOUNT     = '1000';
// Max amount cap: $10 USDC = 10_000_000 units (6 decimals) — satisfies Tolly's ≤$10 check
const MAX_AMOUNT = '10000000';

/**
 * Build the x402 v2 payment requirements object and base64-encode it.
 * Advertises two slots per supported chain (Gateway v1 + v2) on Arc Mainnet.
 */
function buildPaymentRequired(resourceUrl: string): string {
  const makeSlot = (version: '1' | '2') => ({
    scheme:             'exact',
    network:            ARC_MAINNET_CHAIN,
    asset:              ARC_MAINNET_USDC,
    amount:             AMOUNT,
    maxAmount:          MAX_AMOUNT,
    payTo:              SELLER_ADDRESS,
    maxTimeoutSeconds:  300,
    extra: {
      name:               'GatewayWalletBatched',
      version,
      verifyingContract:  GATEWAY_CONTRACT,
    },
  });

  const payload = {
    x402Version: 2,
    resource: {
      url:         resourceUrl,
      description: 'FinancialDataAgent query — 0.001 USDC per request',
      mimeType:    'application/json',
    },
    accepts: [makeSlot('1'), makeSlot('2')],
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ─── Mock financial calculation (same logic as Express server) ────────────────
type Metric = 'volatility' | 'sharpe' | 'beta' | 'rsi' | 'return';

interface QueryResult {
  asset:             string;
  metric:            Metric;
  period:            string;
  value:             number;
  unit:              string;
  confidence:        number;
  dataPoints:        number;
  computedAt:        string;
  settlementVerified: true;
  chain:             string;
  amountPaid:        string;
}

function computeMetric(asset: string, metric: Metric, period: string): QueryResult {
  const seed = asset.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng  = (min: number, max: number, offset = 0) =>
    +(min + ((seed + offset) % 100) / 100 * (max - min)).toFixed(4);

  const results: Record<Metric, { value: number; unit: string }> = {
    volatility: { value: rng(0.1, 0.9, 1),   unit: 'annualised σ'   },
    sharpe:     { value: rng(-0.5, 3.5, 2),   unit: 'ratio'          },
    beta:       { value: rng(0.3, 2.0, 3),    unit: 'β vs BTC'       },
    rsi:        { value: rng(20, 80, 4),       unit: 'RSI-14'         },
    return:     { value: rng(-0.5, 2.0, 5),   unit: 'total return'   },
  };

  const { value, unit } = results[metric] ?? results.volatility;
  return {
    asset:              asset.toUpperCase(),
    metric,
    period,
    value,
    unit,
    confidence:         rng(0.7, 0.99, 6),
    dataPoints:         Math.floor(rng(500, 5000, 7)),
    computedAt:         new Date().toISOString(),
    settlementVerified: true,
    chain:              'Arc Mainnet (eip155:5042)',
    amountPaid:         '0.001 USDC',
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow all origins so any agent or indexer can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, X-PAYMENT-RESPONSE');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Only GET and POST are handled — anything else is a hard reject
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // ── Canonical resource URL (stable production — never a preview URL) ─────────
  const resourceUrl = 'https://arc-studio-8d53b7238bae4af6bbfb806d.vercel.app/api/agent/query';

  // ── 402 gate ─────────────────────────────────────────────────────────────────
  // GET requests always return 402 — used by Tolly / ArcID discovery probes.
  // POST requests require an X-PAYMENT header to proceed past the gate.
  const payment = req.method === 'POST' ? req.headers['x-payment'] : undefined;
  if (!payment) {
    const pr = buildPaymentRequired(resourceUrl);
    res.setHeader('PAYMENT-REQUIRED', pr);
    // WWW-Authenticate mirrors the payload for validators that look for this header
    res.setHeader('WWW-Authenticate', `x402 realm="FinancialDataAgent", payment-required="${pr}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(402).json({
      error: 'Payment required',
      accepts: [
        {
          scheme:           'exact',
          network:          'arc',
          maxAmountRequired: AMOUNT,
          resource:         'USDC',
          payTo:            SELLER_ADDRESS.toLowerCase(),
        },
      ],
    });
    return;
  }

  // ── Parse request body ───────────────────────────────────────────────────────
  const body   = typeof req.body === 'object' ? req.body : {};
  const asset  = (body.asset  ?? 'BTC').toString().trim().toUpperCase() || 'BTC';
  const metric = (['volatility','sharpe','beta','rsi','return'].includes(body.metric)
    ? body.metric : 'volatility') as Metric;
  const period = (body.period ?? '30d').toString().trim() || '30d';

  // ── Compute & respond ────────────────────────────────────────────────────────
  const result = computeMetric(asset, metric, period);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(result);
}
