import { useState, useEffect } from "react";
import axios from "axios";
import {
  Plus, RefreshCw, Trash2, Edit2, Clock, Terminal,
  Check, X, RotateCcw, ChevronDown,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const WEEKDAYS = [
  { value: "monday",    label: "Lundi" },
  { value: "tuesday",   label: "Mardi" },
  { value: "wednesday", label: "Mercredi" },
  { value: "thursday",  label: "Jeudi" },
  { value: "friday",    label: "Vendredi" },
  { value: "saturday",  label: "Samedi" },
  { value: "sunday",    label: "Dimanche" },
];

const WARN_OPTIONS = [1, 5, 10, 15, 30, 60];

const EMPTY_TASK = {
  name: "",
  type: "restart",
  command: "",
  schedule_type: "daily",
  time: "04:00",
  day: "monday",
  interval_hours: 6,
  warn_minutes: [15, 5, 1],
  enabled: true,
};

function scheduleLabel(task) {
  const { schedule_type, time, day, interval_hours } = task;
  const days = { monday:"Lundi", tuesday:"Mardi", wednesday:"Mercredi", thursday:"Jeudi", friday:"Vendredi", saturday:"Samedi", sunday:"Dimanche" };
  if (schedule_type === "daily")    return `Tous les jours à ${time}`;
  if (schedule_type === "weekly")   return `Chaque ${days[day] ?? day} à ${time}`;
  if (schedule_type === "interval") return `Toutes les ${interval_hours}h`;
  return "—";
}

function formatNextRun(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${value ? "bg-rust-600" : "bg-surface-400"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-4.5" : "translate-x-0.5"}`} />
    </button>
  );
}

function TaskModal({ task: initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? EMPTY_TASK);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleWarn = (w) => {
    const list = form.warn_minutes.includes(w)
      ? form.warn_minutes.filter(x => x !== w)
      : [...form.warn_minutes, w].sort((a, b) => b - a);
    set("warn_minutes", list);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-surface-600 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
          <h3 className="font-semibold text-gray-100">{initial ? "Modifier la tâche" : "Nouvelle tâche"}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="label">Nom</label>
            <input className="input" placeholder="Redémarrage quotidien" value={form.name}
              onChange={e => set("name", e.target.value)} />
          </div>

          {/* Type */}
          <div>
            <label className="label">Type d'action</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "restart", icon: RotateCcw, label: "Redémarrage" },
                { v: "command", icon: Terminal, label: "Commande RCON" },
              ].map(({ v, icon: Icon, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("type", v)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.type === v
                      ? "border-rust-600 bg-rust-600/20 text-rust-400"
                      : "border-surface-500 bg-surface-700 text-gray-400 hover:border-surface-400"
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Command (if type=command) */}
          {form.type === "command" && (
            <div>
              <label className="label">Commande RCON</label>
              <input className="input font-mono text-sm" placeholder="say Bonjour !" value={form.command}
                onChange={e => set("command", e.target.value)} />
            </div>
          )}

          {/* Schedule type */}
          <div>
            <label className="label">Fréquence</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "daily",    label: "Quotidien" },
                { v: "weekly",   label: "Hebdomadaire" },
                { v: "interval", label: "Intervalle" },
              ].map(({ v, label }) => (
                <button key={v} type="button" onClick={() => set("schedule_type", v)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    form.schedule_type === v
                      ? "border-rust-600 bg-rust-600/20 text-rust-400"
                      : "border-surface-500 bg-surface-700 text-gray-400 hover:border-surface-400"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time (daily / weekly) */}
          {(form.schedule_type === "daily" || form.schedule_type === "weekly") && (
            <div className={`grid gap-3 ${form.schedule_type === "weekly" ? "grid-cols-2" : ""}`}>
              {form.schedule_type === "weekly" && (
                <div>
                  <label className="label">Jour</label>
                  <select className="input text-sm" value={form.day} onChange={e => set("day", e.target.value)}>
                    {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Heure</label>
                <input className="input text-sm" type="time" value={form.time}
                  onChange={e => set("time", e.target.value)} />
              </div>
            </div>
          )}

          {/* Interval */}
          {form.schedule_type === "interval" && (
            <div>
              <label className="label">Intervalle (heures)</label>
              <input className="input text-sm" type="number" min="1" max="168" value={form.interval_hours}
                onChange={e => set("interval_hours", parseInt(e.target.value) || 1)} />
            </div>
          )}

          {/* Warnings (restart only) */}
          {form.type === "restart" && (
            <div>
              <label className="label">Avertissements avant redémarrage</label>
              <div className="flex flex-wrap gap-2">
                {WARN_OPTIONS.map(w => {
                  const active = form.warn_minutes.includes(w);
                  return (
                    <button key={w} type="button" onClick={() => toggleWarn(w)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active ? "bg-rust-600/20 border-rust-600 text-rust-400" : "bg-surface-700 border-surface-500 text-gray-500"
                      }`}>
                      {w >= 60 ? `${w / 60}h` : `${w}min`}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-600 mt-1.5">Messages d'avertissement envoyés sur le serveur avant le redémarrage.</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-surface-600">
          <button className="btn-secondary flex-1 justify-center" onClick={onClose}>Annuler</button>
          <button className="btn-primary flex-1 justify-center" onClick={handleSubmit} disabled={saving || !form.name.trim()}>
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, onToggle, onEdit, onDelete }) {
  return (
    <div className={`rounded-xl border transition-colors ${task.enabled ? "border-surface-500 bg-surface-700" : "border-surface-600 bg-surface-800 opacity-60"}`}>
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          task.type === "restart" ? "bg-rust-600/20 text-rust-400" : "bg-blue-600/20 text-blue-400"
        }`}>
          {task.type === "restart" ? <RotateCcw size={16} /> : <Terminal size={16} />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200 truncate">{task.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              task.type === "restart" ? "bg-rust-600/20 text-rust-400" : "bg-blue-600/20 text-blue-400"
            }`}>
              {task.type === "restart" ? "Redémarrage" : "Commande"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-500">{scheduleLabel(task)}</span>
            {task.next_run && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-xs text-gray-600">
                  <span className="text-gray-500">Prochaine : </span>
                  {formatNextRun(task.next_run)}
                </span>
              </>
            )}
          </div>
          {task.type === "command" && task.command && (
            <div className="text-xs font-mono text-gray-600 mt-0.5 truncate">{task.command}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Toggle value={task.enabled} onChange={onToggle} />
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-600 transition-colors">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimesPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "new" | task object

  const load = async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/times`);
      setTasks(data);
    } catch { /* backend not ready */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (modal && modal !== "new") {
      const { data } = await axios.put(`${BASE}/api/times/${modal.id}`, form);
      setTasks(t => t.map(x => x.id === modal.id ? data : x));
    } else {
      const { data } = await axios.post(`${BASE}/api/times`, form);
      setTasks(t => [...t, data]);
    }
    setModal(null);
  };

  const handleToggle = async (id) => {
    const { data } = await axios.post(`${BASE}/api/times/${id}/toggle`);
    setTasks(t => t.map(x => x.id === id ? data : x));
  };

  const handleDelete = async (id) => {
    await axios.delete(`${BASE}/api/times/${id}`);
    setTasks(t => t.filter(x => x.id !== id));
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-full">
      <RefreshCw size={20} className="animate-spin text-gray-500" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Tâches planifiées</h2>
          <p className="text-sm text-gray-500 mt-0.5">Redémarrages automatiques et commandes programmées</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setModal("new")}>
          <Plus size={14} />
          Nouvelle tâche
        </button>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center mb-3">
            <Clock size={22} className="text-gray-600" />
          </div>
          <div className="text-gray-400 font-medium">Aucune tâche planifiée</div>
          <div className="text-sm text-gray-600 mt-1">Créez un redémarrage automatique ou une commande programmée.</div>
          <button className="btn-primary mt-4 text-sm" onClick={() => setModal("new")}>
            <Plus size={13} />
            Créer une tâche
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={() => handleToggle(task.id)}
              onEdit={() => setModal(task)}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
        </div>
      )}

      {/* Info card */}
      <div className="card space-y-2 text-xs text-gray-500">
        <div className="font-medium text-gray-400">Notes</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>Les redémarrages envoient un message d'avertissement sur le serveur avant de s'exécuter.</li>
          <li>Les commandes RCON sont envoyées directement au serveur (ex: <span className="font-mono text-gray-400">say Bonjour !</span>, <span className="font-mono text-gray-400">weather rain</span>).</li>
          <li>Les tâches ne s'exécutent que si le serveur est en cours d'exécution (sauf les redémarrages automatiques).</li>
        </ul>
      </div>

      {/* Modal */}
      {modal && (
        <TaskModal
          task={modal === "new" ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
