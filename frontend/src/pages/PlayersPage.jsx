import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Users, Search, Shield, LogOut, VolumeX, RefreshCw, MessageSquare, X, Check, Copy,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function formatPlaytime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function PingBadge({ ping }) {
  const color = ping < 60 ? "text-green-400" : ping < 120 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs font-mono ${color}`}>{ping}ms</span>;
}

function ActionModal({ player, action, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const needsReason = action !== "mute";

  const titles = {
    kick: "Kick",
    ban: "Ban",
    mute: "Mute",
    message: "Message",
  };

  const placeholders = {
    kick: "Raison du kick…",
    ban: "Raison du ban…",
    message: "Message à envoyer…",
  };

  const colors = {
    kick: "btn-primary",
    ban: "bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors",
    mute: "btn-primary",
    message: "btn-primary",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-500">
          <div className="font-semibold text-gray-100">
            {titles[action]} — <span className="text-rust-400">{player.name}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-500 font-mono">{player.steamid}</div>
          {needsReason && (
            <input
              className="input"
              placeholder={placeholders[action]}
              value={reason}
              onChange={e => setReason(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onConfirm(reason)}
              autoFocus
            />
          )}
          {action === "mute" && (
            <div className="text-sm text-gray-400">
              Le joueur sera réduit au silence sur le chat serveur.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-500">
          <button className="btn-secondary text-sm" onClick={onClose}>Annuler</button>
          <button className={`${colors[action]} text-sm`} onClick={() => onConfirm(reason)}>
            <Check size={13} /> Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

function CopySteamId({ steamid }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(steamid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copier le SteamID"
      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-300 font-mono transition-colors group/copy"
    >
      <span>{steamid}</span>
      {copied
        ? <Check size={10} className="text-green-400" />
        : <Copy size={10} className="opacity-0 group-hover/copy:opacity-100 transition-opacity" />
      }
    </button>
  );
}

function PlayerRow({ player, onAction }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface-700 border border-surface-600 hover:border-surface-500 transition-colors group">
      {/* Avatar placeholder */}
      <div className="w-9 h-9 rounded-lg bg-surface-600 flex items-center justify-center shrink-0 text-sm font-bold text-gray-400">
        {player.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-200 truncate">{player.name}</div>
        <CopySteamId steamid={player.steamid} />
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500 shrink-0">
        <div className="flex flex-col items-end">
          <span className="text-gray-400">{formatPlaytime(player.playtime_seconds)}</span>
          <span className="text-gray-600">en jeu</span>
        </div>
        <PingBadge ping={player.ping} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onAction(player, "message")}
          title="Envoyer un message"
          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-surface-600 transition-colors"
        >
          <MessageSquare size={14} />
        </button>
        <button
          onClick={() => onAction(player, "mute")}
          title="Mute"
          className="p-1.5 rounded-lg text-gray-500 hover:text-yellow-400 hover:bg-surface-600 transition-colors"
        >
          <VolumeX size={14} />
        </button>
        <button
          onClick={() => onAction(player, "kick")}
          title="Kick"
          className="p-1.5 rounded-lg text-gray-500 hover:text-orange-400 hover:bg-surface-600 transition-colors"
        >
          <LogOut size={14} />
        </button>
        <button
          onClick={() => onAction(player, "ban")}
          title="Ban"
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-surface-600 transition-colors"
        >
          <Shield size={14} />
        </button>
      </div>
    </div>
  );
}

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // { player, action }
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/players`);
      setPlayers(data);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAction = async (player, action, reason) => {
    try {
      if (action === "kick") {
        await axios.post(`${BASE}/api/players/${player.steamid}/kick`, { reason });
      } else if (action === "ban") {
        await axios.post(`${BASE}/api/players/${player.steamid}/ban`, { reason });
        setPlayers(p => p.filter(x => x.steamid !== player.steamid));
      } else if (action === "mute") {
        await axios.post(`${BASE}/api/players/${player.steamid}/mute`);
      } else if (action === "message") {
        await axios.post(`${BASE}/api/players/${player.steamid}/message`, { reason });
      }
      setFeedback({ type: "success", text: `${action} appliqué à ${player.name}` });
    } catch {
      setFeedback({ type: "error", text: "Erreur lors de l'action." });
    }
    setModal(null);
    setTimeout(() => setFeedback(null), 3000);
  };

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.steamid.includes(search)
  );

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Player Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {players.length} joueur{players.length !== 1 ? "s" : ""} connecté{players.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={load}>
          <RefreshCw size={13} /> Rafraîchir
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm font-medium border ${
          feedback.type === "success"
            ? "bg-green-900/40 border-green-800 text-green-300"
            : "bg-red-900/40 border-red-800 text-red-300"
        }`}>{feedback.text}</div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-9"
          placeholder="Rechercher par nom ou SteamID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Players */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw size={18} className="animate-spin text-gray-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Users size={36} className="text-surface-500 mb-3" />
          <div className="text-gray-400 font-medium">
            {search ? "Aucun joueur trouvé" : "Aucun joueur connecté"}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {!search && "Démarre le serveur pour voir les joueurs"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="hidden sm:flex items-center gap-4 px-4 text-xs text-gray-600 font-medium uppercase tracking-wide mb-1">
            <div className="w-9 shrink-0" />
            <div className="flex-1">Joueur</div>
            <div className="w-24 text-right">Temps / Ping</div>
            <div className="w-24 text-right">Actions</div>
          </div>
          {filtered.map(player => (
            <PlayerRow
              key={player.steamid}
              player={player}
              onAction={(p, a) => setModal({ player: p, action: a })}
            />
          ))}
        </div>
      )}

      {/* Action modal */}
      {modal && (
        <ActionModal
          player={modal.player}
          action={modal.action}
          onConfirm={(reason) => handleAction(modal.player, modal.action, reason)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
