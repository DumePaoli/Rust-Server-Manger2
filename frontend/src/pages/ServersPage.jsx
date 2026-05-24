import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Server, Plus, Trash2, Check, Edit2, Play, Square, ChevronRight } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DEFAULTS = {
  server_name: "Mon Serveur Rust",
  server_port: 28015,
  rcon_port: 28016,
  rcon_password: "changeme",
  query_port: 28017,
  max_players: 100,
  level: "Procedural Map",
  map_size: 3500,
  map_seed: 12345,
  server_executable: "",
  server_identity: "rust_server",
  server_data_path: "",
};

function ServerModal({ server, onClose, onSaved }) {
  const isEdit = !!server;
  const [name, setName] = useState(server?.name ?? "");
  const [cfg, setCfg] = useState(
    isEdit
      ? { ...DEFAULTS, ...(server.config ?? {}) }
      : { ...DEFAULTS }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  const handleSave = async () => {
    if (!name.trim()) { setErr("Le nom est requis."); return; }
    setSaving(true);
    setErr("");
    try {
      if (isEdit) {
        await axios.put(`${BASE}/api/servers/${server.id}`, { name, config: cfg });
      } else {
        await axios.post(`${BASE}/api/servers`, { name, config: cfg });
      }
      onSaved();
      onClose();
    } catch {
      setErr("Erreur lors de la sauvegarde.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-600">
          <h2 className="font-semibold text-gray-100">
            {isEdit ? "Modifier le serveur" : "Ajouter un serveur"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {err && (
            <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{err}</div>
          )}

          <div>
            <label className="label">Nom du serveur</label>
            <input className="input" value={name} onChange={e => { setName(e.target.value); set("server_name", e.target.value); }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Port serveur</label>
              <input className="input" type="number" value={cfg.server_port} onChange={e => set("server_port", +e.target.value)} />
            </div>
            <div>
              <label className="label">Port RCON</label>
              <input className="input" type="number" value={cfg.rcon_port} onChange={e => set("rcon_port", +e.target.value)} />
            </div>
            <div>
              <label className="label">Port Query</label>
              <input className="input" type="number" value={cfg.query_port} onChange={e => set("query_port", +e.target.value)} />
            </div>
            <div>
              <label className="label">Max joueurs</label>
              <input className="input" type="number" value={cfg.max_players} onChange={e => set("max_players", +e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Mot de passe RCON</label>
            <input className="input" value={cfg.rcon_password} onChange={e => set("rcon_password", e.target.value)} />
          </div>

          <div>
            <label className="label">Identité du serveur</label>
            <input className="input" value={cfg.server_identity} onChange={e => set("server_identity", e.target.value)} />
          </div>

          <div>
            <label className="label">Exécutable du serveur</label>
            <input className="input font-mono text-xs" placeholder="C:\servers\rust\RustDedicated.exe" value={cfg.server_executable} onChange={e => set("server_executable", e.target.value)} />
          </div>

          <div>
            <label className="label">Dossier de données</label>
            <input className="input font-mono text-xs" placeholder="C:\servers\rust" value={cfg.server_data_path} onChange={e => set("server_data_path", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Taille de la map</label>
              <input className="input" type="number" value={cfg.map_size} onChange={e => set("map_size", +e.target.value)} />
            </div>
            <div>
              <label className="label">Seed</label>
              <input className="input" type="number" value={cfg.map_seed} onChange={e => set("map_seed", +e.target.value)} />
            </div>
            <div>
              <label className="label">Max joueurs</label>
              <input className="input" type="number" value={cfg.max_players} onChange={e => set("max_players", +e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-600">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Sauvegarde…" : isEdit ? "Sauvegarder" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ServersPage() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "add" | serverObj
  const [msg, setMsg] = useState(null);

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/servers`);
      setServers(data.servers ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (id) => {
    try {
      await axios.post(`${BASE}/api/servers/${id}/select`);
      flash(true, "Serveur actif changé.");
      load();
    } catch {
      flash(false, "Erreur lors du changement de serveur.");
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Supprimer "${s.name}" ?`)) return;
    try {
      const { data } = await axios.delete(`${BASE}/api/servers/${s.id}`);
      if (data.success) {
        flash(true, "Serveur supprimé.");
        load();
      } else {
        flash(false, data.message ?? "Erreur.");
      }
    } catch {
      flash(false, "Erreur lors de la suppression.");
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Serveurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez vos profils de serveur Rust</p>
        </div>
        <button className="btn-primary" onClick={() => setModal("add")}>
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border ${msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Chargement…</div>
      ) : servers.length === 0 ? (
        <div className="card text-center py-12">
          <Server size={32} className="mx-auto mb-3 text-surface-500" />
          <div className="text-gray-400 font-medium">Aucun serveur configuré</div>
          <button className="btn-primary mt-4" onClick={() => setModal("add")}>
            <Plus size={14} /> Créer un serveur
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map(s => (
            <div
              key={s.id}
              className={`card flex items-center gap-4 transition-colors ${s.active ? "border-rust-700/60 bg-rust-600/5" : ""}`}
            >
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${s.running && s.server_ready ? "bg-green-400 animate-pulse" : s.running ? "bg-yellow-400 animate-pulse" : "bg-surface-500"}`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-100 truncate">{s.name}</span>
                  {s.active && (
                    <span className="text-[10px] font-semibold bg-rust-600/20 text-rust-400 px-1.5 py-0.5 rounded">
                      ACTIF
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                  <span>Port {s.port}</span>
                  <span className={
                    s.running && s.server_ready ? "text-green-400" :
                    s.running ? "text-yellow-400" : "text-gray-600"
                  }>
                    {s.running && s.server_ready ? "En ligne" : s.running ? "Démarrage..." : "Hors ligne"}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!s.active && (
                  <button
                    onClick={() => handleSelect(s.id)}
                    title="Activer ce serveur"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rust-600/20 text-rust-400 hover:bg-rust-600/30 transition-colors"
                  >
                    <Check size={12} /> Activer
                  </button>
                )}
                <button
                  onClick={() => setModal(s)}
                  title="Modifier"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-600 transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  title="Supprimer"
                  disabled={s.running}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ServerModal
          server={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
