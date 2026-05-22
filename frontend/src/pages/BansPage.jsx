import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  ShieldOff, Search, RefreshCw, UserX, UserCheck,
  AlertCircle, Check, X, Plus,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function Flash({ msg }) {
  if (!msg) return null;
  return (
    <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border flex items-center gap-2 ${
      msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"
    }`}>
      {msg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
    </div>
  );
}

function AddBanModal({ onClose, onAdd }) {
  const [steamid, setSteamid] = useState("");
  const [name, setName]       = useState("");
  const [reason, setReason]   = useState("");
  const [busy, setBusy]       = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!steamid.trim()) return;
    setBusy(true);
    await onAdd({ steamid: steamid.trim(), name: name.trim(), reason: reason.trim() });
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
          <h3 className="font-semibold text-gray-100">Ajouter un ban</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label">SteamID64 *</label>
            <input className="input font-mono text-sm" placeholder="76561198XXXXXXXXX"
              value={steamid} onChange={e => setSteamid(e.target.value)} required />
          </div>
          <div>
            <label className="label">Nom du joueur</label>
            <input className="input text-sm" placeholder="Optionnel"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Raison</label>
            <input className="input text-sm" placeholder="Cheating, toxic..."
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2">Annuler</button>
            <button type="submit" disabled={busy || !steamid.trim()} className="btn-danger text-sm py-2">
              {busy ? <RefreshCw size={13} className="animate-spin" /> : <UserX size={13} />}
              Bannir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BansPage() {
  const [data, setData]     = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState({});
  const [msg, setMsg]       = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: d } = await axios.get(`${BASE}/api/bans`); setData(d); }
    catch { }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnban = async (steamid) => {
    if (!confirm(`Débannir ${steamid} ?`)) return;
    setWorking(w => ({ ...w, [steamid]: true }));
    try {
      await axios.delete(`${BASE}/api/bans/${steamid}`);
      flash(true, `${steamid} débanni. Rechargez dans quelques secondes.`);
      setTimeout(load, 2000);
    } catch { flash(false, "Erreur."); }
    setWorking(w => ({ ...w, [steamid]: false }));
  };

  const handleAdd = async (body) => {
    try {
      await axios.post(`${BASE}/api/bans`, body);
      flash(true, `${body.steamid} banni.`);
      setTimeout(load, 2000);
    } catch { flash(false, "Erreur lors du ban."); }
  };

  const filtered = (data?.bans ?? []).filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    return b.steamid.includes(s) || b.name.toLowerCase().includes(s) || b.reason.toLowerCase().includes(s);
  });

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <ShieldOff size={18} className="text-rust-400" /> Bannissements
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.file ? <span className="font-mono text-xs text-gray-600">{data.file}</span> : "Gestion des bans serveur"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary text-xs py-1.5">
            <RefreshCw size={12} /> Actualiser
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-2">
            <Plus size={13} /> Bannir
          </button>
        </div>
      </div>

      <Flash msg={msg} />

      {data?.error && (
        <div className="card flex items-start gap-3">
          <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-yellow-300">Fichier introuvable</div>
            <div className="text-xs text-gray-500 mt-1">{data.error}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9 text-sm" placeholder="Rechercher par SteamID, nom, raison…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw size={18} className="animate-spin text-gray-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center py-10 text-center">
          <ShieldOff size={28} className="text-gray-600 mb-3" />
          <div className="text-gray-400 font-medium">
            {search ? "Aucun résultat" : "Aucun joueur banni"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => (
            <div key={b.steamid} className="card flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-lg bg-red-900/30 flex items-center justify-center shrink-0">
                <UserX size={16} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-200">
                    {b.name || <span className="text-gray-500 italic">Inconnu</span>}
                  </span>
                  <span className="font-mono text-xs text-gray-500">{b.steamid}</span>
                </div>
                {b.reason && (
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    Raison : {b.reason}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleUnban(b.steamid)}
                disabled={working[b.steamid]}
                className="btn-secondary text-xs py-1.5 shrink-0"
              >
                {working[b.steamid]
                  ? <RefreshCw size={11} className="animate-spin" />
                  : <UserCheck size={11} />}
                Débannir
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && data && (
        <div className="text-xs text-gray-600 text-center">
          {filtered.length} ban{filtered.length !== 1 ? "s" : ""}
          {search ? ` sur ${data.bans.length}` : ""}
        </div>
      )}

      {showAdd && <AddBanModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  );
}
