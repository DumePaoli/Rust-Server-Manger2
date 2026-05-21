import { useServerStatus } from "../hooks/useServerStatus";
import { startServer, stopServer, restartServer } from "../api/client";
import {
  Play, Square, RotateCcw, Cpu, HardDrive, Clock,
  Users, Server, Activity, Wifi,
} from "lucide-react";
import { useState } from "react";

function formatUptime(seconds) {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatCard({ icon: Icon, label, value, sub, color = "text-rust-400" }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg bg-surface-600 flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold text-gray-100">{value}</div>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { status, loading, refresh } = useServerStatus(3000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const action = async (fn, label) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      await refresh();
    } catch (e) {
      setMessage({ type: "error", text: "Request failed." });
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Server Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">Monitor and control your Rust server</p>
        </div>

        <div className="flex items-center gap-2">
          {!status.running ? (
            <button className="btn-primary" disabled={busy} onClick={() => action(startServer)}>
              <Play size={15} /> Start Server
            </button>
          ) : (
            <>
              <button className="btn-secondary" disabled={busy} onClick={() => action(restartServer)}>
                <RotateCcw size={15} /> Restart
              </button>
              <button className="btn-danger" disabled={busy} onClick={() => action(stopServer)}>
                <Square size={15} /> Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium border ${
            message.type === "success"
              ? "bg-green-900/40 border-green-800 text-green-300"
              : "bg-red-900/40 border-red-800 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Status hero */}
      <div className="card flex items-center gap-6">
        <div
          className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl ${
            status.running ? "bg-green-900/50 text-green-400" : "bg-surface-600 text-gray-500"
          }`}
        >
          <Server size={32} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-semibold text-gray-100 text-lg">Rust Dedicated Server</span>
            {status.running ? (
              <span className="badge-online">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Online
              </span>
            ) : (
              <span className="badge-offline">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Offline
              </span>
            )}
          </div>
          {status.running ? (
            <p className="text-sm text-gray-400">
              Running since {status.started_at ? new Date(status.started_at).toLocaleString() : "—"} &nbsp;·&nbsp; PID {status.pid}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Server is not running. Click Start to launch it.</p>
          )}
        </div>
        {status.running && (
          <div className="flex items-center gap-1.5 text-green-400">
            <Activity size={14} className="animate-pulse" />
            <span className="text-xs font-medium">Active</span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Clock}
          label="Uptime"
          value={status.running ? formatUptime(status.uptime_seconds) : "--"}
          color="text-blue-400"
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={status.running ? `${status.cpu_percent.toFixed(1)}%` : "--"}
          color="text-yellow-400"
        />
        <StatCard
          icon={HardDrive}
          label="Memory"
          value={status.running ? `${status.memory_mb.toFixed(0)} MB` : "--"}
          color="text-purple-400"
        />
        <StatCard
          icon={Users}
          label="Players"
          value="0 / --"
          sub="Connect via RCON for live count"
          color="text-rust-400"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickCard
          title="Server Settings"
          desc="Configure hostname, port, map size, and more."
          to="/settings"
          icon={Server}
        />
        <QuickCard
          title="Console"
          desc="Send RCON commands and view server output."
          to="/console"
          icon={Activity}
        />
        <QuickCard
          title="Plugins"
          desc="Install and manage Oxide/Carbon plugins."
          to="/plugins"
          icon={Wifi}
        />
      </div>
    </div>
  );
}

function QuickCard({ title, desc, to, icon: Icon }) {
  return (
    <a
      href={to}
      className="card hover:border-rust-600/60 hover:bg-surface-600 transition-colors group cursor-pointer block"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-600 group-hover:bg-rust-600/20 flex items-center justify-center text-rust-400 transition-colors">
          <Icon size={18} />
        </div>
        <div>
          <div className="font-medium text-gray-200 text-sm">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
        </div>
      </div>
    </a>
  );
}
