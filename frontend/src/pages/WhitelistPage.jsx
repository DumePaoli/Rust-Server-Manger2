import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { UserCheck, Plus, Trash2, RefreshCw, Shield, ShieldOff, AlertCircle } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function WhitelistPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [steamid, setSteamid] = useState("");
  const [name, setName]       = useState("");
  const [adding, setAdding]   = useState(false);
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState({});
  const [msg, setMsg]         = useState(null);

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const [wl, cfg] = await Promise.all([
        axios.get(`${BASE}/api/whitelist`),
        axios.get(`${BASE}/api/config`),
      ]);
      setData(wl.data);
      setEnabled(!!cfg.data.whitelist_enabled);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const { data: r } = await axios.post(`${BASE}/api/whitelist/toggle`);
      setEnabled(r.enabled);
      flash(true, r.enabled ? "Whitelist activée." : "Whitelist désactivée.");
    } catch { flash(false, "Erreur."); }
    setToggling(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!steamid.trim() || steamid.trim().length < 17) {
      flash(false, "SteamID invalide (17 chiffres requis).");
      return;
    }
    setAdding(true);
    try {
      const { data: r } = await axios.post(`${BASE}/api/whitelist`, { steamid: steamid.trim(), name: name.trim() });
      if (r.success) { flash(true, r.message); setSteamid(""); setName(""); load(); }
      else flash(false, r.message);
    } catch { flash(false, "Erreur lors de l'ajout."); }
    setAdding(false);
  };

  const handleRemove = async (sid) => {
    setRemoving(r => ({ ...r, [sid]: true }));
    try {
      const { data: r } = await axios.delete(`${BASE}/api/whitelist/${sid}`);
      if (r.success) { flash(true, r.message); load(); }
      else flash(false, r.message);
    } catch { flash(false, "Erreur."); }
    setRemoving(r => ({ ...r, [sid]: false }));
  };

  const entries = data?.entries ?? [];

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Whitelist</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contrôlez qui peut rejoindre votre serveur</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
            enabled
              ? "bg-green-900/30 border-green-700 text-green-400 hover:bg-green-900/50"
              : "bg-surface-600 border-surface-500 text-gray-400 hover:border-surface-400"
          }`}
        >
          {toggling ? <RefreshCw size={14} className="animate-spin" /> : enabled ? <Shield size={14} /> : <ShieldOff size={14} />}
          {enabled ? "Whitelist activée" : "Whitelist désactivée"}
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border ${
          msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"
        }`}>{msg.text}</div>
      )}

      {data?.error && (
        <div className="card flex items-start gap-3">
          <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-yellow-300">Configuration manquante</div>
            <div className="text-xs text-gray-400 mt-0.5">{data.error}</div>
          </div>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="card space-y-3">
        <div className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Plus size={14} className="text-rust-400" /> Ajouter un joueur
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">SteamID64</label>
            <input
              className="input font-mono"
              placeholder="76561198000000000"
              value={steamid}
              onChange={e => setSteamid(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Nom (optionnel)</label>
            <input
              className="input"
              placeholder="Pseudo Steam"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={adding || !steamid.trim()}>
            {adding ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
            Ajouter
          </button>
        </div>
      </form>

      {/* List */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <UserCheck size={14} className="text-rust-400" />
            Joueurs autorisés
            <span className="text-xs font-normal text-gray-500">({entries.length})</span>
          </div>
          <button onClick={load} className="btn-secondary text-xs py-1.5">
            <RefreshCw size={11} /> Actualiser
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw size={18} className="animate-spin text-gray-500" /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">
            {data?.error ? "Impossible de lire la whitelist." : "Aucun joueur dans la whitelist."}
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map(e => (
              <div key={e.steamid} className="flex items-center gap-3 py-2.5 px-1 border-b border-surface-600 last:border-0">
                <div className="w-7 h-7 rounded-lg bg-surface-600 flex items-center justify-center shrink-0">
                  <UserCheck size={13} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 font-medium">{e.name || e.steamid}</div>
                  {e.name && <div className="text-xs font-mono text-gray-500">{e.steamid}</div>}
                </div>
                <button
                  onClick={() => handleRemove(e.steamid)}
                  disabled={removing[e.steamid]}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                  title="Retirer de la whitelist"
                >
                  {removing[e.steamid] ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {data?.file && (
          <div className="mt-3 pt-3 border-t border-surface-600 text-xs text-gray-600 font-mono truncate">{data.file}</div>
        )}
      </div>
    </div>
  );
}
