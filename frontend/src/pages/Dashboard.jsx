import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { startServer, stopServer, restartServer, getConfig } from "../api/client";
import {
  Play, Square, RotateCcw, Cpu, HardDrive, Clock,
  Users, Server, Activity, Terminal, Trash2, Settings,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_POINTS = 40;

const CHART_COLORS = {
  "text-yellow-400": "#facc15",
  "text-purple-400": "#c084fc",
  "text-blue-400":   "#60a5fa",
  "text-rust-400":   "#f97316",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function formatUptime(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function pad(n) { return String(n).padStart(2, "0"); }

function formatCountdown(secs) {
  if (!secs || secs <= 0) return null;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}j ${pad(h)}h ${pad(m)}m`;
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

// ── SVG Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ data, color, max, height = 48, width = 200 }) {
  if (data.length < 2) return <div style={{ height }} />;
  const effectiveMax = max || Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / effectiveMax) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = data[data.length - 1];
  const lastX = width;
  const lastY = height - (last / effectiveMax) * (height - 4) - 2;

  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#grad-${color})`}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color, chart, chartMax }) {
  return (
    <div className="card flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg bg-surface-600 flex items-center justify-center ${color}`}>
            <Icon size={14} />
          </div>
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-gray-100 tabular-nums">{value}</div>
          {sub && <div className="text-xs text-gray-600">{sub}</div>}
        </div>
      </div>
      {chart && chart.length > 1 && (
        <Sparkline data={chart} color={CHART_COLORS[color] || "#888"} max={chartMax} height={36} />
      )}
    </div>
  );
}

// ── Quick link ────────────────────────────────────────────────────────────────

function QuickLink({ to, icon: Icon, label }) {
  return (
    <Link to={to}
      className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-surface-700 border border-surface-600 hover:border-rust-700 hover:bg-surface-600 transition-colors group">
      <Icon size={15} className="text-gray-500 group-hover:text-rust-400 transition-colors" />
      <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">{label}</span>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [status, setStatus] = useState({ running: false, cpu_percent: 0, memory_mb: 0, uptime_seconds: 0, pid: null, started_at: null });
  const [config, setConfig] = useState(null);
  const [players, setPlayers] = useState([]);
  const [wipe, setWipe] = useState(null);
  const [wipeCountdown, setWipeCountdown] = useState(null);
  const [consoleTail, setConsoleTail] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [cpuHistory, setCpuHistory]         = useState([]);
  const [ramHistory, setRamHistory]         = useState([]);
  const [playersHistory, setPlayersHistory] = useState([]);

  const wipeRef = useRef(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/monitor/metrics`);
      if (data.cpu_series?.length)     setCpuHistory(data.cpu_series.slice(-MAX_POINTS));
      if (data.ram_series?.length)     setRamHistory(data.ram_series.slice(-MAX_POINTS));
      if (data.players_series?.length) setPlayersHistory(data.players_series.slice(-MAX_POINTS));
    } catch {}
  }, []);

  // Fetch status every 3s
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/status`);
      setStatus(data);
    } catch { }
  }, []);

  // Fetch players every 10s
  const fetchPlayers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/players`);
      setPlayers(data);
    } catch { }
  }, []);

  // Fetch wipe every 30s
  const fetchWipe = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/wipe/status`);
      setWipe(data);
      setWipeCountdown(data.seconds_until_wipe || null);
    } catch { }
  }, []);

  // Fetch console tail every 5s
  const fetchConsole = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/console/log`);
      setConsoleTail((data.lines || []).slice(-5));
    } catch { }
  }, []);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => { });
    fetchStatus(); fetchPlayers(); fetchWipe(); fetchConsole(); fetchMetrics();
    const intervals = [
      setInterval(fetchStatus, 3000),
      setInterval(fetchPlayers, 10000),
      setInterval(fetchWipe, 30000),
      setInterval(fetchConsole, 5000),
      setInterval(fetchMetrics, 10000),
    ];
    return () => intervals.forEach(clearInterval);
  }, [fetchStatus, fetchPlayers, fetchWipe, fetchConsole, fetchMetrics]);

  // Local wipe countdown tick
  useEffect(() => {
    clearInterval(wipeRef.current);
    if (!wipeCountdown) return;
    wipeRef.current = setInterval(() => setWipeCountdown(c => c > 0 ? c - 1 : 0), 1000);
    return () => clearInterval(wipeRef.current);
  }, [wipeCountdown]);

  const action = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await fn();
      setMsg({ ok: result.success, text: result.message });
      await fetchStatus();
    } catch { setMsg({ ok: false, text: "Erreur." }); }
    setBusy(false);
    setTimeout(() => setMsg(null), 4000);
  };

  const serverName = config?.server_name || "Rust Dedicated Server";
  const maxPlayers = config?.max_players || 100;
  const ramGB = status.memory_mb ? (status.memory_mb / 1024).toFixed(1) : null;

  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-100">{serverName}</h1>
            {status.running ? (
              <span className="badge-online"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Online</span>
            ) : (
              <span className="badge-offline"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Offline</span>
            )}
          </div>
          {status.running && status.started_at && (
            <p className="text-xs text-gray-500 mt-1">
              Démarré le {new Date(status.started_at).toLocaleString("fr-FR")} · PID {status.pid}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!status.running ? (
            <button className="btn-primary" disabled={busy} onClick={() => action(startServer)}>
              <Play size={14} /> Démarrer
            </button>
          ) : (
            <>
              <button className="btn-secondary text-sm" disabled={busy} onClick={() => action(restartServer)}>
                <RotateCcw size={13} /> Restart
              </button>
              <button className="btn-danger text-sm" disabled={busy} onClick={() => action(stopServer)}>
                <Square size={13} /> Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alert */}
      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border ${msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"}`}>
          {msg.text}
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Joueurs"
          value={status.running ? `${players.length}` : "—"}
          sub={status.running ? `sur ${maxPlayers}` : "Serveur arrêté"}
          color="text-rust-400"
          chart={playersHistory}
          chartMax={maxPlayers}
        />
        <StatCard
          icon={Clock} label="Uptime"
          value={status.running ? formatUptime(status.uptime_seconds) : "—"}
          color="text-blue-400"
        />
        <StatCard
          icon={Cpu} label="CPU"
          value={status.running ? `${status.cpu_percent.toFixed(1)}%` : "—"}
          color="text-yellow-400"
          chart={cpuHistory}
          chartMax={100}
        />
        <StatCard
          icon={HardDrive} label="RAM"
          value={status.running && ramGB ? `${ramGB} GB` : "—"}
          sub={status.running && status.memory_mb ? `${status.memory_mb.toFixed(0)} MB` : undefined}
          color="text-purple-400"
          chart={ramHistory}
        />
      </div>

      {/* ── Middle row: Server info + Wipe + Console ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Server info */}
        <div className="card space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Server size={12} /> Infos serveur
          </div>
          {config ? (
            <div className="space-y-2 text-sm">
              {[
                ["Map", `${config.level || "Procedural"} ${config.map_size}`],
                ["Seed", config.map_seed],
                ["Port", config.server_port],
                ["RCON", config.rcon_port],
                ["Identité", config.server_identity],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className="text-gray-300 font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-600">Chargement…</div>
          )}
          <Link to="/settings" className="text-xs text-rust-400 hover:text-rust-300 transition-colors flex items-center gap-1 pt-1">
            <Settings size={10} /> Modifier les paramètres
          </Link>
        </div>

        {/* Next wipe */}
        <div className="card flex flex-col">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Trash2 size={12} /> Prochain wipe
          </div>
          {wipe?.next_wipe && wipeCountdown > 0 ? (
            <div className="flex-1 flex flex-col justify-center text-center">
              <div className="text-2xl font-bold font-mono text-gray-100 tabular-nums">
                {formatCountdown(wipeCountdown)}
              </div>
              <div className={`text-xs mt-2 font-medium ${wipe.wipe_type === "full" ? "text-red-400" : "text-orange-400"}`}>
                {wipe.wipe_type === "full" ? "Full Wipe" : "Map Wipe"}
              </div>
              {wipe.recurrence !== "none" && (
                <div className="text-xs text-gray-600 mt-0.5">
                  {{ weekly: "Hebdomadaire", biweekly: "Bi-hebdo", monthly: "Mensuel" }[wipe.recurrence]}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
              <Trash2 size={24} className="text-surface-500" />
              <div className="text-xs text-gray-600">Aucun wipe planifié</div>
              <Link to="/wipe" className="text-xs text-rust-400 hover:text-rust-300 transition-colors">Planifier →</Link>
            </div>
          )}
        </div>

        {/* Console tail */}
        <div className="card flex flex-col min-h-0">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Terminal size={12} /> Console récente
          </div>
          <div className="flex-1 space-y-1 overflow-hidden">
            {consoleTail.length === 0 ? (
              <div className="text-xs text-gray-600">Aucune sortie console.</div>
            ) : (
              consoleTail.map((line, i) => (
                <div key={i} className="text-xs font-mono text-gray-500 truncate leading-relaxed">
                  {line}
                </div>
              ))
            )}
          </div>
          <Link to="/console" className="text-xs text-rust-400 hover:text-rust-300 transition-colors flex items-center gap-1 pt-2 mt-2 border-t border-surface-600">
            <Terminal size={10} /> Ouvrir la console
          </Link>
        </div>
      </div>

      {/* ── Quick links ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink to="/console" icon={Terminal} label="Console" />
        <QuickLink to="/players" icon={Users} label="Joueurs" />
        <QuickLink to="/wipe" icon={Trash2} label="Wipe Manager" />
        <QuickLink to="/settings" icon={Settings} label="Paramètres" />
      </div>

    </div>
  );
}
