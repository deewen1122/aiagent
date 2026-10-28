/** Vercel serverless function — GET /api/agent/health
 *
 * Public health check — no auth required.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// arc-studio-allow-onchain-literal
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=30');

  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    status:           'ok',
    agent:            'FinancialDataAgent',
    chain:            'Arc Mainnet (5042)',
    price:            '$0.001 USDC per query',
    agentId:          process.env.VITE_AGENT_ID_MAINNET ?? 'unregistered',
    identityRegistry: IDENTITY_REGISTRY,
  });
}
