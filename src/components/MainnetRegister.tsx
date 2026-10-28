/**
 * MainnetRegister — in-browser ERC-8004 registration on Arc Mainnet
 *
 * Calls register(agentURI) on the Arc Mainnet IdentityRegistry directly
 * from the user's connected wallet. No private key needed — the wallet signs.
 *
 * WARNING: This sends a real transaction on Arc Mainnet using real USDC for gas.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, ExternalLink, Loader2, AlertTriangle,
  CheckCircle, AlertCircle, Info, RefreshCw
} from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseEventLogs } from 'viem';
import { arc } from 'viem/chains';

// ERC-8004 IdentityRegistry on Arc Mainnet
// Source: https://docs.arc.io/arc/references/contract-addresses.md
// arc-studio-allow-onchain-literal
const MAINNET_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const ARC_MAINNET_EXPLORER = 'https://explorer.arc.io';
const ARC_MAINNET_CHAIN_ID = arc.id; // 5042

const identityAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setAgentURI',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI',  type: 'string'  },
    ],
    outputs: [],
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

export default function MainnetRegister() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Seed from env so already-registered agents show their ID immediately
  const envAgentId = import.meta.env.VITE_AGENT_ID_MAINNET as string | undefined;

  const [agentURI, setAgentURI] = useState('');
  const [mintedId, setMintedId] = useState<string | null>(envAgentId ?? null);
  const [warning, setWarning]   = useState(false);

  const isWrongChain = isConnected && chainId !== ARC_MAINNET_CHAIN_ID;

  // Register write
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  // setAgentURI write (separate hook so both can coexist)
  const [newUri, setNewUri]           = useState('');
  const [uriWarning, setUriWarning]   = useState(false);
  const [showUriPanel, setShowUriPanel] = useState(false);
  const { writeContract: writeSetUri, data: setUriTxHash, isPending: setUriPending, error: setUriError, reset: resetSetUri } = useWriteContract();
  const { isLoading: setUriConfirming, isSuccess: setUriSuccess } = useWaitForTransactionReceipt({ hash: setUriTxHash });

  // Parse agentId from receipt logs when confirmed
  if (isSuccess && receipt && mintedId === null) {
    try {
      const [ev] = parseEventLogs({ abi: identityAbi, eventName: 'Registered', logs: receipt.logs });
      if (ev) setMintedId(ev.args.agentId.toString());
    } catch {
      setMintedId('(see explorer)');
    }
  }

  const handleRegister = () => {
    if (!agentURI.trim()) return;
    setWarning(false);
    setMintedId(null);
    reset();
    writeContract({
      address:      MAINNET_IDENTITY_REGISTRY,
      abi:          identityAbi,
      functionName: 'register',
      args:         [agentURI.trim()],
      chainId:      ARC_MAINNET_CHAIN_ID,
    });
  };

  const handleSetUri = () => {
    if (!newUri.trim() || !mintedId) { setUriWarning(true); return; }
    setUriWarning(false);
    resetSetUri();
    writeSetUri({
      address:      MAINNET_IDENTITY_REGISTRY,
      abi:          identityAbi,
      functionName: 'setAgentURI',
      args:         [BigInt(mintedId), newUri.trim()],
      chainId:      ARC_MAINNET_CHAIN_ID,
    });
  };

  const busy    = isPending    || isConfirming;
  const uriBusy = setUriPending || setUriConfirming;

  return (
    <section
      className="rounded-2xl p-5 border space-y-4"
      style={{ background: 'var(--surface)', borderColor: 'rgba(172,198,233,0.25)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-[var(--accent)]" />
        <h2 className="font-semibold text-sm uppercase tracking-widest text-[var(--muted)]">
          Mint on Arc Mainnet
        </h2>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-mono border"
          style={{ background: 'rgba(186,43,76,0.15)', color: 'var(--danger)', borderColor: 'rgba(186,43,76,0.3)' }}
        >
          MAINNET — real USDC
        </span>
      </div>

      {/* Mainnet warning banner */}
      <div
        className="flex items-start gap-2 rounded-xl p-3 border text-xs"
        style={{ background: 'rgba(186,43,76,0.08)', borderColor: 'rgba(186,43,76,0.25)', color: 'var(--muted)' }}
      >
        <AlertTriangle size={13} className="shrink-0 mt-0.5 text-[var(--danger)]" />
        <span>
          This registers your agent on <strong>Arc Mainnet</strong> and signs a transaction with your
          wallet. Gas costs ~0.006 USDC in real USDC. The NFT and agentURI are permanent.
          Use an <strong>IPFS URI</strong> for the agentURI — an HTTP URL can change or go offline.
        </span>
      </div>

      {/* Registry info */}
      <div className="flex items-center justify-between text-xs rounded-lg px-3 py-2 border border-[var(--border)]" style={{ background: 'var(--surface-muted)' }}>
        <span className="text-[var(--subtle)]">IdentityRegistry</span>
        <a
          href={`${ARC_MAINNET_EXPLORER}/address/${MAINNET_IDENTITY_REGISTRY}`}
          target="_blank" rel="noopener"
          className="font-mono flex items-center gap-1 text-[var(--accent)] hover:underline"
        >
          {MAINNET_IDENTITY_REGISTRY.slice(0, 8)}…{MAINNET_IDENTITY_REGISTRY.slice(-6)}
          <ExternalLink size={10} />
        </a>
      </div>

      {/* agentURI input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-[var(--subtle)] uppercase tracking-widest flex items-center gap-1">
          Agent URI
          <span className="normal-case text-[var(--subtle)]">(IPFS or HTTPS — immutable on-chain)</span>
        </label>
        <input
          type="text"
          value={agentURI}
          onChange={(e) => { setAgentURI(e.target.value); setWarning(false); }}
          placeholder="ipfs://Qm... or https://your-server.com/agent/card"
          disabled={busy || isSuccess}
          className="rounded-lg px-3 py-2 text-sm font-mono border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] disabled:opacity-50"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
        />
        {warning && (
          <p className="text-xs text-[var(--danger)] flex items-center gap-1">
            <AlertCircle size={12} /> Enter an agentURI before registering.
          </p>
        )}
        <p className="text-xs text-[var(--subtle)] flex items-start gap-1">
          <Info size={11} className="shrink-0 mt-0.5" />
          Your live card is at{' '}
          <code className="font-mono">
            https://iz8b1a8jcsxcsat7h9m0v.preview.studio.arc.io/api/agent/card
          </code>
          {' '}— use IPFS for production permanence.
        </p>
      </div>

      {/* Not connected */}
      {!isConnected && (
        <p className="text-xs text-center text-[var(--subtle)] py-1">
          Connect your wallet to register on mainnet.
        </p>
      )}

      {/* Wrong chain — switch button */}
      {isConnected && isWrongChain && (
        <button
          onClick={() => switchChain({ chainId: ARC_MAINNET_CHAIN_ID })}
          disabled={isSwitching}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'rgba(172,198,233,0.15)', color: 'var(--accent)', border: '1px solid rgba(172,198,233,0.3)' }}
        >
          {isSwitching && <Loader2 size={14} className="animate-spin" />}
          Switch to Arc Mainnet
        </button>
      )}

      {/* Register button — only when on correct chain */}
      {isConnected && !isWrongChain && !isSuccess && (
        <button
          onClick={() => {
            if (!agentURI.trim()) { setWarning(true); return; }
            handleRegister();
          }}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--danger)', color: '#fff' }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {isPending    ? 'Confirm in wallet...'          :
           isConfirming ? 'Confirming on Arc Mainnet...'  :
           'Register on Arc Mainnet'}
        </button>
      )}

      {/* Connected wallet */}
      {isConnected && !isWrongChain && address && (
        <p className="text-xs text-[var(--subtle)] text-center">
          Signing as <code className="font-mono">{address.slice(0,6)}…{address.slice(-4)}</code> on Arc Mainnet
        </p>
      )}

      {/* Errors */}
      {writeError && (
        <div className="rounded-xl p-3 border border-[var(--border)] text-xs text-[var(--danger)] flex items-start gap-1.5" style={{ background: 'var(--surface-muted)' }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {writeError.message.includes('user rejected')
            ? 'Transaction cancelled in wallet.'
            : writeError.message.slice(0, 200)}
        </div>
      )}

      {/* Update agentURI panel — shown when an agent is already registered */}
      {mintedId !== null && (
        <div className="border-t border-[var(--border)] pt-3 space-y-3">
          <button
            onClick={() => setShowUriPanel((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          >
            <RefreshCw size={12} />
            {showUriPanel ? 'Hide' : 'Update agentURI on-chain'} — agent #{mintedId}
          </button>

          <AnimatePresence>
            {showUriPanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3"
              >
                <p className="text-xs text-[var(--subtle)]">
                  Point agent #{mintedId} at your permanent production URL (e.g. after deploying to Vercel / Hugging Face).
                  Only the owner wallet can call <code className="font-mono">setAgentURI</code>. Gas ~0.006 USDC.
                </p>
                <input
                  type="text"
                  value={newUri}
                  onChange={(e) => { setNewUri(e.target.value); setUriWarning(false); }}
                  placeholder="https://your-app.vercel.app/api/agent/card"
                  disabled={uriBusy || setUriSuccess}
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] disabled:opacity-50"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                />
                {uriWarning && (
                  <p className="text-xs text-[var(--danger)] flex items-center gap-1">
                    <AlertCircle size={12} /> Enter a new URI first.
                  </p>
                )}
                {!setUriSuccess && isConnected && !isWrongChain && (
                  <button
                    onClick={() => { void handleSetUri(); }}
                    disabled={uriBusy}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'rgba(172,198,233,0.15)', color: 'var(--accent)', border: '1px solid rgba(172,198,233,0.3)' }}
                  >
                    {uriBusy && <Loader2 size={13} className="animate-spin" />}
                    {setUriPending    ? 'Confirm in wallet...'        :
                     setUriConfirming ? 'Confirming...'               :
                     'Update agentURI on Arc Mainnet'}
                  </button>
                )}
                {setUriError && (
                  <p className="text-xs text-[var(--danger)]">
                    {setUriError.message.includes('user rejected') ? 'Cancelled.' : setUriError.message.slice(0, 200)}
                  </p>
                )}
                {setUriSuccess && setUriTxHash && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--success)]">
                    <CheckCircle size={12} />
                    agentURI updated.{' '}
                    <a
                      href={`${ARC_MAINNET_EXPLORER}/tx/${setUriTxHash}`}
                      target="_blank" rel="noopener"
                      className="font-mono underline flex items-center gap-0.5"
                    >
                      View tx <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Success */}
      <AnimatePresence>
        {isSuccess && mintedId !== null && txHash && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 border space-y-3"
            style={{ background: 'rgba(141,216,159,0.07)', borderColor: 'rgba(141,216,159,0.3)' }}
          >
            <div className="flex items-center gap-1.5 text-[var(--success)] text-sm font-semibold">
              <CheckCircle size={15} /> Agent registered on Arc Mainnet
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--subtle)]">Agent ID</span>
                <span className="font-mono text-[var(--ink)]">#{mintedId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--subtle)]">Registry</span>
                <a
                  href={`${ARC_MAINNET_EXPLORER}/address/${MAINNET_IDENTITY_REGISTRY}`}
                  target="_blank" rel="noopener"
                  className="font-mono text-[var(--accent)] flex items-center gap-1 hover:underline"
                >
                  {MAINNET_IDENTITY_REGISTRY.slice(0,8)}… <ExternalLink size={10} />
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--subtle)]">Tx</span>
                <a
                  href={`${ARC_MAINNET_EXPLORER}/tx/${txHash}`}
                  target="_blank" rel="noopener"
                  className="font-mono text-[var(--accent)] flex items-center gap-1 hover:underline"
                >
                  {txHash.slice(0,10)}… <ExternalLink size={10} />
                </a>
              </div>
            </div>
            <p className="text-xs text-[var(--subtle)] border-t border-[var(--border)] pt-2">
              Add <code className="font-mono">VITE_AGENT_ID_MAINNET={mintedId}</code> to your{' '}
              <code className="font-mono">.env</code> and restart the agent server.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
