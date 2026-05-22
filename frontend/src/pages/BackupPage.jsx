import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Archive, RefreshCw, Play, Trash2, Check, AlertCircle,
  HardDrive, Clock, Settings2,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function fmtDate(iso) {
  return new Date(iso).toLocaleString("fr-FR");
}

function StatusMsg({ msg }) {
  if (!msg) return null;
  return (
    <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border flex items-center gap-2 ${
      msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"
    }`}>
      {msg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
    </div>
  );
}

export default function BackupPage() {
  const [cfg, setCfg]         = useState(null);
  const [backups, setBackups] = useState([]);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState(null);
  const [dirty, setDirty]     = useState(false);

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        axios.get(`${BASE}/api/backup/config`),
        axios.get(`${BASE}/api/backup/list`),
      ]);
      setCfg(c.data);
      setBackups(b.data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll progress while backup running
  useEffect(() => {
    if (!progress?.running) return;
    const iv = setInterval(async () => {
      try {
        const { data } = await axios.get(`${BASE}/api/backup/progress`);
        setProgress(data);
        if (!data.running) {
          load();
          clearInterval(iv);
        }
      } catch {}
    }, 800);
    return () => clearInterval(iv);
  }, [progress?.running, load]);

  const handleSaveConfig = async () => {
    try {
      await axios.put(`${BASE}/api/backup/config`, { data: cfg });
      flash(true, "Configuration sauvegardée.");
      setDirty(false);
    } catch {
      flash(false, "Erreur lors de la sauvegarde.");
    }
  };

  const handleBackupNow = async () => {
    setBusy(true);
    setProgress({ running: true, percent: 0, current_file: "" });
    try {
      const { data } = await axios.post(`${BASE}/api/backup/now`);
      if (!data.success) {
        setProgress(null);
        flash(false, data.message);
      }
    } catch {
      setProgress(null);
      flash(false, "Erreur lors de la sauvegarde.");
    }
    setBusy(false);
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Supprimer ${filename} ?`)) return;
    try {
      const { data } = await axios.delete(`${BASE}/api/backup/${filename}`);
      if (data.success) { flash(true, "Supprimé."); load(); }
      else flash(false, data.message);
    } catch { flash(false, "Erreur."); }
  };

  const set = (key, val) => {
    setCfg(c => ({ ...c, [key]: val }));
    setDirty(true);
  };

  if (!cfg) return (
    <div className="flex justify-center py-16">
      <RefreshCw size={18} className="animate-spin text-gray-500" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Sauvegardes</h2>
        <p className="text-sm text-gray-500 mt-0.5">Backup automatique des fichiers .sav, .map et plugins</p>
      </div>

      <StatusMsg msg={msg} />

      {/* Config */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-500">
          <Settings2 size={15} className="text-rust-400" />
          <h3 className="font-semibold text-gray-200">Configuration</h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-200">Sauvegarde automatique</div>
            <div className="text-xs text-gray-500">Déclenche une backup selon l'intervalle défini</div>
          </div>
          <button
            onClick={() => set("enabled", !cfg.enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? "bg-rust-600" : "bg-surface-400"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? "translate-x-5" : ""}`} />
          </button>
        </div>

        <div>
          <label className="label">Dossier de destination</label>
          <input
            className="input text-sm font-mono"
            value={cfg.backup_dir}
            onChange={e => set("backup_dir", e.target.value)}
            placeholder="C:\RustServerBackups"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Intervalle (heures)</label>
            <input
              className="input text-sm"
              type="number"
              min="1"
              max="168"
              value={cfg.interval_hours}
              onChange={e => set("interval_hours", parseInt(e.target.value) || 6)}
            />
          </div>
          <div>
            <label className="label">Garder les N dernières</label>
            <input
              className="input text-sm"
              type="number"
              min="1"
              max="100"
              value={cfg.keep_last}
              onChange={e => set("keep_last", parseInt(e.target.value) || 10)}
            />
          </div>
        </div>

        {cfg.last_backup && (
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <Clock size={11} /> Dernière sauvegarde : {fmtDate(new Date(cfg.last_backup * 1000).toISOString())}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSaveConfig} disabled={!dirty} className="btn-primary text-sm py-2">
            <Check size={13} /> Sauvegarder
          </button>
          <button
            onClick={handleBackupNow}
            disabled={busy || progress?.running}
            className="btn-secondary text-sm py-2"
          >
            {(busy || progress?.running) ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            Backup maintenant
          </button>
        </div>

        {/* Progress bar */}
        {progress?.running && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-surface-600 overflow-hidden">
              <div
                className="h-full bg-rust-500 transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 truncate font-mono">
              {progress.current_file || "Préparation…"} {progress.percent}%
            </div>
          </div>
        )}
      </div>

      {/* Backup list */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-surface-500">
          <div className="flex items-center gap-2">
            <Archive size={15} className="text-rust-400" />
            <h3 className="font-semibold text-gray-200">Sauvegardes existantes</h3>
          </div>
          <button onClick={load} className="btn-secondary text-xs py-1.5">
            <RefreshCw size={11} /> Actualiser
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <HardDrive size={28} className="text-gray-600 mb-3" />
            <div className="text-sm text-gray-500">Aucune sauvegarde trouvée</div>
            <div className="text-xs text-gray-600 mt-1">Configurez le dossier et lancez une backup manuelle</div>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map(b => (
              <div key={b.filename} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-800 border border-surface-600">
                <Archive size={14} className="text-gray-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-gray-200 truncate">{b.filename}</div>
                  <div className="text-xs text-gray-500">{fmtDate(b.created_at)} · {b.size_mb} MB</div>
                </div>
                <button
                  onClick={() => handleDelete(b.filename)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
