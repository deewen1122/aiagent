/** Vercel serverless function — GET /api/agent/card
 *
 * Returns the ERC-8004 agent registration card as JSON.
 * CORS is open so ArcID and any external indexer can read it unauthenticated.
 * Reads VITE_* env vars which Vercel injects as plain env vars (not browser-bundled).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';


export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const agentId = process.env.VITE_AGENT_ID_MAINNET ?? 'unregistered';

  // Absolute URL so external indexers (Tolly, ArcID) can probe the endpoint directly
  const host        = (_req.headers['x-forwarded-host'] ?? _req.headers['host'] ?? '') as string;
  const proto       = (_req.headers['x-forwarded-proto'] ?? 'https') as string;
  const baseUrl     = host ? `${proto}://${host}` : 'https://arc-studio-8d53b7238bae4af6bbfb806d.vercel.app';
  const queryUrl    = `${baseUrl}/api/agent/query`;

  const serviceEntry = {
    name:        'FinancialQuery',
    endpoint:    queryUrl,
    description: 'Computes financial metrics (volatility, Sharpe ratio, beta, RSI) for any asset.',
    price:       '0.001',
  };

  const card = {
    id:          agentId !== 'unregistered' ? Number(agentId) : null,
    name:        'FinancialDataAgent',
    description: 'Autonomous AI agent that computes financial metrics for any asset.',
    image:       null,
    x402:        true,
    services:    [serviceEntry],
    items:       [serviceEntry],
  };

  res.status(200).json(card);
}
