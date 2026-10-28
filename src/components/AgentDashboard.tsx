import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Shield, Zap, ExternalLink, Copy, CheckCircle,
  AlertCircle, Loader2, Terminal, ChevronDown, BarChart2, FlaskConical
} from 'lucide-react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import MainnetRegister from './MainnetRegister';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AgentCard {
  name: string;
  description: string;
  x402Support: boolean;
  x402Price: string;
  active: boolean;
  agentId?: string | number;
  sellerAddress?: string;
  registrations?: { agentId: number; agentRegistry: string }[];
  services?: { name: string; endpoint: string; version: string }[];
}

interface QueryResult {
  asset: string;
  metric: string;
  period: string;
  value: number;
  unit: string;
  confidence: number;
  computedAt: string;
  agentId: string;
  settlementVerified: boolean;
}

type Status = 'idle' | 'paying' | 'computing' | 'success' | 'error' | 'unpaid';
type Mode = 'preview' | 'paid';

const ASSETS  = ['BTC', 'ETH', 'SOL', 'ARC', 'USDC', 'ARB'];
const METRICS = ['volatility', 'return', 'sharpe', 'beta', 'rsi', 'volume'];
const PERIODS = ['7d', '30d', '90d', '1y'];

const ARC_EXPLORER = 'https://explorer.arc.io';
// Arc Mainnet ERC-8004 IdentityRegistry — source: https://docs.arc.io/arc/references/contract-addresses.md
// arc-studio-allow-onchain-literal
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status, mode }: { status: Status; mode: Mode }) {
  const map: Record<Status, { label: string; className: string }> = {
    idle:      { label: mode === 'preview' ? 'Preview' : 'Ready', className: 'bg-[var(--surface-strong)] text-[var(--muted)]' },
    paying:    { label: 'Authorizing', className: 'bg-yellow-900/40 text-yellow-300' },
    computing: { label: 'Computing',   className: 'bg-blue-900/40 text-blue-300'    },
    success:   { label: mode === 'preview' ? 'Done (free)' : 'Settled', className: 'bg-green-900/40 text-[var(--success)]' },
    error:     { label: 'Error',       className: 'bg-red-900/40 text-[var(--danger)]'   },
    unpaid:    { label: '402 Required', className: 'bg-orange-900/40 text-orange-300'   },
  };
  const { label, className } = map[status];
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full tracking-wide uppercase ${className}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={() => { void copy(); }} className="text-[var(--subtle)] hover:text-[var(--ink)] transition-colors">
      {copied ? <CheckCircle size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AgentDashboard() {
  const { address, isConnected } = useAccount();

  const [card, setCard]         = useState<AgentCard | null>(null);
  const [cardError, setCardError] = useState(false);
  const [asset, setAsset]       = useState('BTC');
  const [metric, setMetric]     = useState('volatility');
  const [period, setPeriod]     = useState('30d');
  const [mode, setMode]         = useState<Mode>('preview');
  const [status, setStatus]     = useState<Status>('idle');
  const [result, setResult]     = useState<QueryResult | null>(null);
  const [errMsg, setErrMsg]     = useState('');
  const [rawLog, setRawLog]     = useState<string[]>([]);
  const [showLog, setShowLog]   = useState(false);

  const log = (msg: string) =>
    setRawLog((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // Fetch agent card on mount
  useEffect(() => {
    fetch('/api/agent/card')
      .then((r) => r.json())
      .then((data: AgentCard) => setCard(data))
      .catch(() => setCardError(true));
  }, []);

  const agentId = card?.registrations?.[0]?.agentId;

  // ---------------------------------------------------------------------------
  // Fire a query (preview = free, paid = x402 gated)
  // ---------------------------------------------------------------------------
  const runQuery = async () => {
    if (status === 'paying' || status === 'computing') return;
    setResult(null);
    setErrMsg('');

    if (mode === 'preview') {
      setStatus('computing');
      log(`Preview query (no payment): ${asset} / ${metric} / ${period}`);
      try {
        const resp = await fetch('/api/agent/query-preview', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ asset, metric, period }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json() as QueryResult;
        setResult(data);
        setStatus('success');
        log(`Preview result: ${data.metric}(${data.asset}, ${data.period}) = ${data.value} ${data.unit}`);
      } catch (err) {
        setStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        setErrMsg(msg);
        log(`Error: ${msg}`);
      }
      return;
    }

    // Paid mode — may return 402
    setStatus('paying');
    log(`Initiating x402 query: ${asset} / ${metric} / ${period}`);

    try {
      const first = await fetch('/api/agent/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ asset, metric, period }),
      });

      if (first.status === 402) {
        const payReq = await first.json() as {
          accepts?: { network?: string; maxAmountRequired?: string }[];
          error?:   string;
        };
        log(`402 received — payment required on ${payReq.accepts?.[0]?.network ?? 'Arc Testnet'}`);
        setStatus('unpaid');
        setErrMsg(
          `Payment required: ${payReq.accepts?.[0]?.maxAmountRequired ?? '0.01'} USDC on ${payReq.accepts?.[0]?.network ?? 'Arc Testnet'}. ` +
          `Use the Circle CLI command shown below to pay and retry.`
        );
        return;
      }

      if (!first.ok) {
        const body = await first.text();
        throw new Error(`HTTP ${first.status}: ${body}`);
      }

      setStatus('computing');
      log('Payment verified — computing financial data...');

      const data = await first.json() as QueryResult;
      setResult(data);
      setStatus('success');
      log(`Result: ${data.metric}(${data.asset}, ${data.period}) = ${data.value} ${data.unit}  confidence=${data.confidence}%`);
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setErrMsg(msg);
      log(`Error: ${msg}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="min-h-dvh"
      style={{ background: 'var(--bg-gradient)', color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[var(--accent)]" />
          <span className="display font-semibold tracking-tight text-[var(--ink)]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            FinancialDataAgent
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-strong)] text-[var(--muted)] border border-[var(--border)] font-mono">
            Arc Mainnet
          </span>
        </div>
        <ConnectKitButton />
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Two-column: Agent Card + Query Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Agent Identity Card */}
          <section
            className="rounded-2xl p-5 border border-[var(--border)] space-y-4"
            style={{ background: 'var(--surface)' }}
          >
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-[var(--accent)]" />
              <h2 className="font-semibold text-sm uppercase tracking-widest text-[var(--muted)]">
                ERC-8004 Identity
              </h2>
            </div>

            {cardError && (
              <p className="text-sm text-[var(--danger)]">
                Agent server not reachable. Start it with <code className="mono text-xs">bun run agent:dev</code>.
              </p>
            )}

            {!card && !cardError && (
              <div className="flex items-center gap-2 text-[var(--subtle)] text-sm">
                <Loader2 size={14} className="animate-spin" /> Loading card...
              </div>
            )}

            {card && (
              <>
                <div>
                  <p className="font-semibold text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {card.name}
                  </p>
                  <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                    {card.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <Row label="Agent ID">
                    {agentId !== undefined ? (
                      <a
                        href={`${ARC_EXPLORER}/address/${IDENTITY_REGISTRY}?tokenId=${agentId}`}
                        target="_blank" rel="noopener"
                        className="flex items-center gap-1 text-[var(--accent)] hover:underline font-mono text-xs"
                      >
                        #{agentId} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-[var(--danger)] text-xs font-mono">unregistered</span>
                    )}
                  </Row>

                  <Row label="Registry">
                    <span className="font-mono text-xs text-[var(--subtle)] flex items-center gap-1">
                      {shortAddr(IDENTITY_REGISTRY)}
                      <CopyButton text={IDENTITY_REGISTRY} />
                    </span>
                  </Row>

                  <Row label="Seller">
                    <span className="font-mono text-xs text-[var(--subtle)] flex items-center gap-1">
                      {card.sellerAddress ? shortAddr(card.sellerAddress) : 'not set'}
                      {card.sellerAddress && <CopyButton text={card.sellerAddress} />}
                    </span>
                  </Row>

                  <Row label="x402">
                    <span className="text-xs text-[var(--success)] flex items-center gap-1">
                      <CheckCircle size={12} /> Enabled — {card.x402Price} / query
                    </span>
                  </Row>

                  <Row label="Status">
                    <span className={`text-xs font-mono ${card.active ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {card.active ? 'active' : 'inactive'}
                    </span>
                  </Row>
                </div>

                {card.services && card.services.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--subtle)] uppercase tracking-widest mb-1.5">Services</p>
                    {card.services.map((svc) => (
                      <div key={svc.name} className="flex items-center justify-between rounded-lg px-3 py-2 border border-[var(--border)]" style={{ background: 'var(--surface-muted)' }}>
                        <span className="text-xs font-medium">{svc.name}</span>
                        <span className="font-mono text-xs text-[var(--subtle)]">v{svc.version}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Query Panel */}
          <section
            className="rounded-2xl p-5 border border-[var(--border)] space-y-4"
            style={{ background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-[var(--accent)]" />
                <h2 className="font-semibold text-sm uppercase tracking-widest text-[var(--muted)]">
                  Send Query
                </h2>
              </div>
              <StatusBadge status={status} mode={mode} />
            </div>

            {/* Mode toggle */}
            <div
              className="flex rounded-xl p-0.5 text-xs font-semibold border border-[var(--border)]"
              style={{ background: 'var(--surface-muted)' }}
            >
              {(['preview', 'paid'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setStatus('idle'); setResult(null); setErrMsg(''); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all"
                  style={mode === m
                    ? { background: 'var(--surface-strong)', color: 'var(--ink)' }
                    : { color: 'var(--subtle)' }
                  }
                >
                  {m === 'preview'
                    ? <><FlaskConical size={12} /> Preview (free)</>
                    : <><Zap size={12} /> Live x402 (0.001 USDC)</>
                  }
                </button>
              ))}
            </div>

            {mode === 'preview' && (
              <p className="text-xs text-[var(--subtle)] px-1">
                Preview mode bypasses payment — <code className="font-mono">settlementVerified</code> will be <code className="font-mono">false</code> in the response.
              </p>
            )}

            {/* Asset / Metric / Period selectors */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Asset',  options: ASSETS,  value: asset,  setter: setAsset  },
                { label: 'Metric', options: METRICS, value: metric, setter: setMetric },
                { label: 'Period', options: PERIODS, value: period, setter: setPeriod },
              ].map(({ label, options, value, setter }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--subtle)] uppercase tracking-widest">{label}</label>
                  <div className="relative">
                    <select
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="w-full appearance-none rounded-lg px-3 py-2 text-sm font-mono border border-[var(--border)] pr-7 focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                      style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                    >
                      {options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--subtle)] pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>

            {/* Request JSON preview */}
            <div className="rounded-lg px-3 py-2 border border-[var(--border)] font-mono text-xs text-[var(--muted)]" style={{ background: 'var(--surface-muted)' }}>
              <span className="text-[var(--subtle)]">
                POST {mode === 'preview' ? '/api/agent/query-preview' : '/api/agent/query'}
              </span>
              <br />
              {JSON.stringify({ asset, metric, period }, null, 0)}
            </div>

            <button
              onClick={() => { void runQuery(); }}
              disabled={status === 'paying' || status === 'computing'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {(status === 'paying' || status === 'computing') && <Loader2 size={15} className="animate-spin" />}
              {status === 'paying'    ? 'Authorizing payment...' :
               status === 'computing' ? 'Computing...'           :
               mode === 'preview'     ? 'Run Preview Query (free)'  :
               'Send Query — 0.001 USDC'}
            </button>

            {mode === 'paid' && !isConnected && address === undefined && (
              <p className="text-xs text-center text-[var(--subtle)]">
                Connect your wallet to try the live x402 flow
              </p>
            )}

            {/* Result */}
            <AnimatePresence mode="wait">
              {status === 'success' && result && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl p-4 border border-[var(--border)] space-y-2"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <div className="flex items-center gap-1.5 text-[var(--success)] text-xs font-medium">
                    <CheckCircle size={13} />
                    {result?.settlementVerified
                      ? 'Settlement verified — x402 paid'
                      : 'Preview result — no payment (settlementVerified: false)'}
                  </div>
                  <div
                    className="rounded-lg p-3 font-mono text-xs overflow-x-auto whitespace-pre border border-[var(--border)]"
                    style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </div>
                </motion.div>
              )}

              {(status === 'error' || status === 'unpaid') && errMsg && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl p-4 border border-[var(--border)] space-y-2"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <div className="flex items-start gap-1.5 text-[var(--danger)] text-xs font-medium">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{errMsg}</span>
                  </div>
                  {status === 'unpaid' && (
                    <div
                      className="rounded-lg p-3 font-mono text-xs border border-[var(--border)]"
                      style={{ background: 'var(--bg)', color: 'var(--muted)' }}
                    >
                      {`circle services pay "${window.location.origin}/api/agent/query" \\
  -X POST \\
  --address <your-wallet> \\
  --chain ARC \\
  --max-amount 0.001 \\
  --data '${JSON.stringify({ asset, metric, period })}'`}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Arc Mainnet registration */}
        <MainnetRegister />

        {/* x402 flow explainer */}
        <section
          className="rounded-2xl p-5 border border-[var(--border)]"
          style={{ background: 'var(--surface)' }}
        >
          <h2 className="font-semibold text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
            Payment Flow
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { step: '01', icon: <Terminal size={14} />, title: 'Request',   body: 'Agent sends POST /agent/query without payment header' },
              { step: '02', icon: <AlertCircle size={14} />, title: '402 Returned', body: 'Server returns HTTP 402 with Circle Gateway payment requirements' },
              { step: '03', icon: <Zap size={14} />, title: 'Gateway Auth', body: 'Circle Gateway authorizes 0.001 USDC on Arc Mainnet, adds X-PAYMENT header' },
              { step: '04', icon: <CheckCircle size={14} />, title: 'Response', body: 'Server verifies settlement, executes calculation, returns payload' },
            ].map(({ step, icon, title, body }) => (
              <div key={step} className="flex flex-col gap-2 p-3 rounded-xl border border-[var(--border)]" style={{ background: 'var(--surface-muted)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--subtle)]">{step}</span>
                  <span className="text-[var(--accent)]">{icon}</span>
                </div>
                <p className="font-semibold text-xs">{title}</p>
                <p className="text-xs text-[var(--subtle)] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Activity log */}
        <section
          className="rounded-2xl border border-[var(--border)]"
          style={{ background: 'var(--surface)' }}
        >
          <button
            onClick={() => setShowLog((p) => !p)}
            className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold"
          >
            <div className="flex items-center gap-2 text-[var(--muted)] uppercase tracking-widest text-xs">
              <Activity size={14} className="text-[var(--accent)]" />
              Activity Log
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--subtle)]">{rawLog.length} entries</span>
              <ChevronDown
                size={14}
                className={`text-[var(--subtle)] transition-transform ${showLog ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          <AnimatePresence>
            {showLog && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div
                  className="mx-5 mb-4 rounded-xl p-3 font-mono text-xs space-y-1 max-h-40 overflow-y-auto border border-[var(--border)]"
                  style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}
                >
                  {rawLog.length === 0
                    ? <span className="text-[var(--subtle)]">No activity yet — send a query above.</span>
                    : rawLog.map((line, i) => <div key={i}>{line}</div>)
                  }
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny utility component
// ---------------------------------------------------------------------------
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-none">
      <span className="text-xs text-[var(--subtle)]">{label}</span>
      <span className="text-xs">{children}</span>
    </div>
  );
}
