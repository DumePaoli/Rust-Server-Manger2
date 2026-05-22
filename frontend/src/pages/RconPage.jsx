import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Terminal, Wifi, WifiOff, Send, Trash2, RefreshCw,
  ChevronRight, AlertCircle, Check,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function StatusBadge({ status }) {
  if (status?.connecting) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-400">
      <RefreshCw size={11} className="animate-spin" /> Connexion…
    </span>
  );
  if (status?.connected) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
      <Wifi size={12} /> Connecté à {status.host}:{status.port}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
      <WifiOff size={12} /> Déconnecté
    </span>
  );
}

function HistoryLine({ entry }) {
  const time = new Date(entry.ts * 1000).toLocaleTimeString();
  if (entry.command) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-rust-400">
          <ChevronRight size={12} className="shrink-0" />
          <span className="font-mono text-xs">{entry.command}</span>
          <span className="ml-auto text-[10px] text-gray-600 shrink-0">{time}</span>
        </div>
        {entry.response && (
          <div className="pl-5 font-mono text-xs text-gray-300 whitespace-pre-wrap break-all leading-relaxed">
            {entry.response}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-gray-600 shrink-0 mt-0.5 font-mono">{time}</span>
      <span className="font-mono text-xs text-gray-400 whitespace-pre-wrap break-all">{entry.response}</span>
    </div>
  );
}

export default function RconPage() {
  const [host, setHost]         = useState("127.0.0.1");
  const [port, setPort]         = useState("28016");
  const [password, setPassword] = useState("");
  const [status, setStatus]     = useState(null);
  const [history, setHistory]   = useState([]);
  const [command, setCommand]   = useState("");
  const [sending, setSending]   = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [flash, setFlash]       = useState(null);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [cmdIdx, setCmdIdx]     = useState(-1);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/rcon/status`);
      setStatus(data);
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/rcon/history`);
      setHistory(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
    const iv = setInterval(loadStatus, 3000);
    return () => clearInterval(iv);
  }, [loadStatus, loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const showFlash = (ok, text) => {
    setFlash({ ok, text });
    setTimeout(() => setFlash(null), 3000);
  };

  const handleConnect = async () => {
    if (!host || !port) return;
    setConnecting(true);
    try {
      const { data } = await axios.post(`${BASE}/api/rcon/connect`, {
        host, port: parseInt(port), password,
      });
      showFlash(data.success, data.message);
      await loadStatus();
    } catch {
      showFlash(false, "Erreur de connexion.");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await axios.post(`${BASE}/api/rcon/disconnect`);
    await loadStatus();
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const cmd = command.trim();
    if (!cmd || sending) return;
    setSending(true);
    setCmdHistory(h => [cmd, ...h.slice(0, 49)]);
    setCmdIdx(-1);
    setCommand("");
    try {
      const { data } = await axios.post(`${BASE}/api/rcon/command`, { command: cmd });
      await loadHistory();
      if (!data.success) showFlash(false, data.response || "Erreur");
    } catch {
      showFlash(false, "Erreur d'envoi.");
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(cmdIdx + 1, cmdHistory.length - 1);
      setCmdIdx(idx);
      setCommand(cmdHistory[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(cmdIdx - 1, -1);
      setCmdIdx(idx);
      setCommand(idx === -1 ? "" : cmdHistory[idx]);
    }
  };

  const handleClear = async () => {
    await axios.delete(`${BASE}/api/rcon/history`);
    setHistory([]);
  };

  const connected = status?.connected;

  return (
    <div className="p-6 max-w-3xl space-y-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Terminal size={18} className="text-rust-400" /> RCON
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Console distante Rust (WebSocket RCON)</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Connection panel */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Hôte</label>
            <input
              className="input text-sm"
              placeholder="127.0.0.1"
              value={host}
              onChange={e => setHost(e.target.value)}
              disabled={connected}
            />
          </div>
          <div>
            <label className="label">Port RCON</label>
            <input
              className="input text-sm font-mono"
              placeholder="28016"
              value={port}
              onChange={e => setPort(e.target.value)}
              disabled={connected}
            />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input
              className="input text-sm"
              type="password"
              placeholder="rcon password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={connected}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting || !host || !port}
              className="btn-primary text-sm py-2"
            >
              {connecting ? <RefreshCw size={13} className="animate-spin" /> : <Wifi size={13} />}
              Connecter
            </button>
          ) : (
            <button onClick={handleDisconnect} className="btn-danger text-sm py-2">
              <WifiOff size={13} /> Déconnecter
            </button>
          )}

          {flash && (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${flash.ok ? "text-green-400" : "text-red-400"}`}>
              {flash.ok ? <Check size={12} /> : <AlertCircle size={12} />}
              {flash.text}
            </span>
          )}
        </div>

        {status?.error && !connected && (
          <div className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> {status.error}
          </div>
        )}
      </div>

      {/* Terminal */}
      <div className="flex-1 card flex flex-col min-h-0 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-500">
          <span className="text-xs font-medium text-gray-400">Historique</span>
          <button onClick={handleClear} className="p-1 rounded text-gray-600 hover:text-gray-300 transition-colors" title="Effacer">
            <Trash2 size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono bg-surface-900/60">
          {history.length === 0 && (
            <div className="text-xs text-gray-600 text-center py-8">
              {connected ? "Envoyez une commande pour commencer." : "Connectez-vous à un serveur RCON."}
            </div>
          )}
          {history.map((entry, i) => <HistoryLine key={i} entry={entry} />)}
          <div ref={bottomRef} />
        </div>

        {/* Command input */}
        <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-surface-500 bg-surface-800">
          <ChevronRight size={14} className="text-rust-400 shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-gray-100 font-mono text-sm placeholder-gray-600 focus:outline-none"
            placeholder={connected ? "Entrez une commande RCON…" : "Non connecté"}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connected || sending}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!connected || !command.trim() || sending}
            className="p-1.5 rounded-lg text-gray-500 hover:text-rust-400 disabled:opacity-30 transition-colors"
          >
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}
