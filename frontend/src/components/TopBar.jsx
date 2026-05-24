import { useServerStatus } from "../hooks/useServerStatus";
import { startServer, stopServer, restartServer } from "../api/client";
import { Play, Square, RotateCcw, Cpu, MemoryStick, Clock } from "lucide-react";
import { useState } from "react";

function formatUptime(seconds) {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function TopBar({ title }) {
  const { status, refresh } = useServerStatus(3000);
  const [busy, setBusy] = useState(false);

  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="h-14 border-b border-surface-600 bg-surface-800 flex items-center justify-between px-6 shrink-0">
      <h1 className="font-semibold text-gray-100">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Stats */}
        {status.running && (
          <div className="flex items-center gap-4 text-xs text-gray-400 mr-2">
            <span className="flex items-center gap-1.5">
              <Clock size={12} />
              {formatUptime(status.uptime_seconds)}
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu size={12} />
              {status.cpu_percent.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1.5">
              <MemoryStick size={12} />
              {status.memory_mb.toFixed(0)} MB
            </span>
          </div>
        )}

        {/* Status badge */}
        {status.running && status.server_ready ? (
          <span className="badge-online">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            En ligne
          </span>
        ) : status.running ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            Démarrage...
          </span>
        ) : (
          <span className="badge-offline">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Hors ligne
          </span>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          {!status.running ? (
            <button
              className="btn-primary text-sm py-1.5"
              disabled={busy}
              onClick={() => action(startServer)}
            >
              <Play size={14} />
              Start
            </button>
          ) : (
            <>
              <button
                className="btn-secondary text-sm py-1.5"
                disabled={busy}
                onClick={() => action(restartServer)}
              >
                <RotateCcw size={14} />
                Restart
              </button>
              <button
                className="btn-danger text-sm py-1.5"
                disabled={busy}
                onClick={() => action(stopServer)}
              >
                <Square size={14} />
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
