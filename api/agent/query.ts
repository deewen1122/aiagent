/**
 * Vercel serverless function — GET|POST /api/agent/query
 *
 * x402 v2 payment gate: every unpaid GET or POST returns HTTP 402 with a
 * payment offer identical to the discovery document at /api/agent/card.
 * A paid POST (X-PAYMENT header present) runs the financial calculation.
 *
 * arc-studio-allow-onchain-literal
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PAYMENT_REQUIREMENT } from './card';

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

  // ── 402 gate ─────────────────────────────────────────────────────────────────
  // Every unpaid GET or POST returns 402 — GET used by Tolly discovery probes,
  // POST used by agents that forgot to attach payment.
  const payment = req.method === 'POST' ? req.headers['x-payment'] : undefined;
  if (!payment) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(402).json({
      x402Version: 2,
      error:       'Payment required',
      accepts:     [PAYMENT_REQUIREMENT],
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
