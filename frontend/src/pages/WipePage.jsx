import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  Trash2, Calendar, AlertTriangle, Clock, RefreshCw, Check,
  X, Play, RotateCcw, ChevronDown,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Une seule fois" },
  { value: "weekly", label: "Chaque semaine" },
  { value: "biweekly", label: "Toutes les 2 semaines" },
  { value: "monthly", label: "Chaque mois" },
];

const WIPE_TYPES = [
  { value: "map", label: "Map Wipe", desc: "Supprime les bases et la map. Blueprints conservés.", color: "text-orange-400" },
  { value: "full", label: "Full Wipe (BP + Map)", desc: "Supprime tout : bases, map ET blueprints.", color: "text-red-400" },
];

const WARNING_OPTIONS = [60, 30, 15, 10, 5, 1];

function pad(n) { return String(n).padStart(2, "0"); }

function formatCountdown(secs) {
  if (secs === null || secs === undefined) return null;
  if (secs <= 0) return { d: 0, h: 0, m: 0, s: 0 };
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { d, h, m, s };
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function CountdownBlock({ label, value }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-3xl font-bold font-mono text-gray-100 tabular-nums w-14 text-center">
        {pad(value)}
      </div>
      <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function WipeNowModal({ onConfirm, onClose }) {
  const [type, setType] = useState("map");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-500">
          <div className="flex items-center gap-2 font-semibold text-gray-100">
            <AlertTriangle size={16} className="text-red-400" />
            Wipe Manuel
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-400">Cette action est irréversible.</div>
          <div className="space-y-2">
            {WIPE_TYPES.map(t => (
              <label key={t.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  type === t.value
                    ? "border-rust-600 bg-rust-600/10"
                    : "border-surface-500 hover:border-surface-400"
                }`}>
                <input type="radio" className="mt-0.5 accent-rust-500" name="wtype"
                  value={t.value} checked={type === t.value} onChange={() => setType(t.value)} />
                <div>
                  <div className={`text-sm font-medium ${t.color}`}>{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-500">
          <button className="btn-secondary text-sm" onClick={onClose}>Annuler</button>
          <button
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
            onClick={() => onConfirm(type)}>
            <Trash2 size={13} /> Wiper maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WipePage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showWipeNow, setShowWipeNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [msg, setMsg] = useState(null);
  const [countdown, setCountdown] = useState(null);

  // Schedule form state
  const [nextWipe, setNextWipe] = useState("");
  const [wipeType, setWipeType] = useState("map");
  const [recurrence, setRecurrence] = useState("none");
  const [warnings, setWarnings] = useState([30, 10, 5, 1]);

  const countdownRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/wipe/status`);
      setStatus(data);
      setCountdown(data.seconds_until_wipe);
    } catch { }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Local countdown tick
  useEffect(() => {
    clearInterval(countdownRef.current);
    if (countdown === null || countdown <= 0) return;
    countdownRef.current = setInterval(() => {
      setCountdown(c => (c <= 0 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [countdown]);

  const openSchedule = () => {
    if (status?.next_wipe) {
      // Pre-fill with existing schedule
      const local = new Date(status.next_wipe).toISOString().slice(0, 16);
      setNextWipe(local);
      setWipeType(status.wipe_type || "map");
      setRecurrence(status.recurrence || "none");
      setWarnings(status.warnings || [30, 10, 5, 1]);
    } else {
      // Default: tomorrow same time
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setNextWipe(d.toISOString().slice(0, 16));
      setWipeType("map");
      setRecurrence("none");
      setWarnings([30, 10, 5, 1]);
    }
    setShowSchedule(true);
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      await axios.post(`${BASE}/api/wipe/schedule`, {
        next_wipe: nextWipe ? new Date(nextWipe).toISOString() : null,
        wipe_type: wipeType,
        recurrence,
        warnings,
      });
      setMsg({ type: "success", text: "Wipe planifié enregistré." });
      setShowSchedule(false);
      await load();
    } catch {
      setMsg({ type: "error", text: "Erreur lors de la sauvegarde." });
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 4000);
  };

  const handleCancelSchedule = async () => {
    await axios.delete(`${BASE}/api/wipe/schedule`);
    setMsg({ type: "success", text: "Wipe planifié annulé." });
    setShowSchedule(false);
    setCountdown(null);
    await load();
    setTimeout(() => setMsg(null), 4000);
  };

  const handleWipeNow = async (type) => {
    setShowWipeNow(false);
    setWiping(true);
    try {
      const { data } = await axios.post(`${BASE}/api/wipe/now`, { wipe_type: type });
      if (data.success) {
        setMsg({ type: "success", text: `Wipe terminé — ${data.files_deleted} fichier(s) supprimé(s). Serveur redémarré.` });
      } else {
        setMsg({ type: "error", text: data.error || "Échec du wipe." });
      }
      await load();
    } catch {
      setMsg({ type: "error", text: "Erreur lors du wipe." });
    }
    setWiping(false);
    setTimeout(() => setMsg(null), 6000);
  };

  const toggleWarning = (min) => {
    setWarnings(w => w.includes(min) ? w.filter(x => x !== min) : [...w, min].sort((a, b) => b - a));
  };

  const ct = formatCountdown(countdown);
  const hasSchedule = status?.next_wipe && countdown > 0;

  if (loading) {
    return <div className="p-6 flex items-center justify-center h-full">
      <RefreshCw size={20} className="animate-spin text-gray-500" />
    </div>;
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Wipe Manager</h2>
          <p className="text-sm text-gray-500 mt-0.5">Planifiez et exécutez les wipers de votre serveur</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={openSchedule}>
            <Calendar size={13} /> Planifier
          </button>
          <button
            className="bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            onClick={() => setShowWipeNow(true)}
            disabled={wiping}
          >
            {wiping ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {wiping ? "Wipe en cours…" : "Wipe maintenant"}
          </button>
        </div>
      </div>

      {/* Alert */}
      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border ${
          msg.type === "success"
            ? "bg-green-900/40 border-green-800 text-green-300"
            : "bg-red-900/40 border-red-800 text-red-300"
        }`}>{msg.text}</div>
      )}

      {/* Countdown */}
      <div className={`card text-center py-8 ${hasSchedule ? "border-rust-700/50" : "border-surface-500"}`}>
        {hasSchedule ? (
          <>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-4">Prochain wipe dans</div>
            <div className="flex items-center justify-center gap-3">
              {ct.d > 0 && <><CountdownBlock label="jours" value={ct.d} /><span className="text-2xl text-gray-600 font-bold mb-3">:</span></>}
              <CountdownBlock label="heures" value={ct.h} />
              <span className="text-2xl text-gray-600 font-bold mb-3">:</span>
              <CountdownBlock label="min" value={ct.m} />
              <span className="text-2xl text-gray-600 font-bold mb-3">:</span>
              <CountdownBlock label="sec" value={ct.s} />
            </div>
            <div className="mt-5 space-y-1">
              <div className="text-sm text-gray-400">
                <span className={`font-medium ${status.wipe_type === "full" ? "text-red-400" : "text-orange-400"}`}>
                  {status.wipe_type === "full" ? "Full Wipe (BP + Map)" : "Map Wipe"}
                </span>
                {" — "}{formatDate(status.next_wipe)}
              </div>
              {status.recurrence !== "none" && (
                <div className="text-xs text-gray-600">
                  {RECURRENCE_OPTIONS.find(r => r.value === status.recurrence)?.label}
                </div>
              )}
            </div>
            <button className="mt-4 text-xs text-gray-600 hover:text-red-400 transition-colors flex items-center gap-1 mx-auto"
              onClick={handleCancelSchedule}>
              <X size={11} /> Annuler ce wipe
            </button>
          </>
        ) : (
          <>
            <Clock size={36} className="text-surface-500 mx-auto mb-3" />
            <div className="text-gray-400 font-medium">Aucun wipe planifié</div>
            <div className="text-sm text-gray-600 mt-1">Clique sur "Planifier" pour programmer un wipe automatique</div>
          </>
        )}
      </div>

      {/* Schedule form */}
      {showSchedule && (
        <div className="card border-rust-700/40 space-y-4">
          <div className="font-semibold text-gray-200">Planifier un wipe</div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date et heure</label>
              <input className="input" type="datetime-local"
                value={nextWipe} onChange={e => setNextWipe(e.target.value)} />
            </div>
            <div>
              <label className="label">Récurrence</label>
              <select className="input" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                {RECURRENCE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Wipe type */}
          <div>
            <label className="label">Type de wipe</label>
            <div className="grid grid-cols-2 gap-3">
              {WIPE_TYPES.map(t => (
                <label key={t.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    wipeType === t.value ? "border-rust-600 bg-rust-600/10" : "border-surface-500 hover:border-surface-400"
                  }`}>
                  <input type="radio" className="mt-0.5 accent-rust-500" name="wt"
                    value={t.value} checked={wipeType === t.value} onChange={() => setWipeType(t.value)} />
                  <div>
                    <div className={`text-sm font-medium ${t.color}`}>{t.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Warnings */}
          <div>
            <label className="label">Avertissements en jeu</label>
            <div className="flex flex-wrap gap-2">
              {WARNING_OPTIONS.map(min => (
                <button
                  key={min}
                  type="button"
                  onClick={() => toggleWarning(min)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    warnings.includes(min)
                      ? "bg-rust-600/20 border-rust-600 text-rust-400"
                      : "bg-surface-600 border-surface-500 text-gray-500 hover:border-surface-400"
                  }`}
                >
                  {min < 60 ? `${min} min` : `${min / 60}h`} avant
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-secondary text-sm" onClick={() => setShowSchedule(false)}>
              <X size={13} /> Annuler
            </button>
            <button className="btn-primary text-sm" onClick={handleSaveSchedule} disabled={saving || !nextWipe}>
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Wipe history */}
      <div className="card">
        <h3 className="font-medium text-gray-200 mb-4 flex items-center gap-2">
          <RotateCcw size={14} className="text-gray-500" /> Historique des wipes
        </h3>
        {(status?.history || []).length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">Aucun wipe enregistré.</div>
        ) : (
          <div className="space-y-2">
            {(status.history || []).map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-sm py-2 border-b border-surface-600 last:border-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${entry.type === "full" ? "bg-red-500" : "bg-orange-500"}`} />
                <div className="flex-1 text-gray-400">{formatDate(entry.date)}</div>
                <div className={`text-xs font-medium ${entry.type === "full" ? "text-red-400" : "text-orange-400"}`}>
                  {entry.type === "full" ? "Full Wipe" : "Map Wipe"}
                </div>
                {entry.manual && <span className="text-xs text-gray-600 bg-surface-600 px-1.5 py-0.5 rounded">Manuel</span>}
                <div className="text-xs text-gray-600">{entry.files_deleted} fichier(s)</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showWipeNow && <WipeNowModal onConfirm={handleWipeNow} onClose={() => setShowWipeNow(false)} />}
    </div>
  );
}
