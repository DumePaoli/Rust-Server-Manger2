import { useEffect, useState } from "react";
import axios from "axios";
import {
  Plus, Trash2, Play, Edit2, Check, X, Clock, MessageSquare, ToggleLeft, ToggleRight,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const INTERVALS = [1, 2, 5, 10, 15, 20, 30, 60, 120];

const COLOR_OPTIONS = [
  { label: "Blanc", value: "", preview: "text-white" },
  { label: "Rouge", value: "#ff4444", preview: "text-red-400" },
  { label: "Vert", value: "#44ff44", preview: "text-green-400" },
  { label: "Jaune", value: "#ffff44", preview: "text-yellow-400" },
  { label: "Bleu", value: "#44aaff", preview: "text-blue-400" },
  { label: "Orange", value: "#ff8844", preview: "text-orange-400" },
];

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <MessageSquare size={40} className="text-surface-500 mb-3" />
      <div className="text-gray-400 font-medium mb-1">Aucun message planifié</div>
      <div className="text-sm text-gray-600 mb-4">
        Les messages automatiques sont envoyés en jeu via <code className="text-gray-500">say</code>
      </div>
      <button className="btn-primary text-sm" onClick={onAdd}>
        <Plus size={14} /> Ajouter un message
      </button>
    </div>
  );
}

function MessageRow({ msg, onToggle, onDelete, onTest, onEdit }) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    await onTest(msg.id);
    setTimeout(() => setTesting(false), 1500);
  };

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
      msg.enabled
        ? "bg-surface-700 border-surface-500"
        : "bg-surface-800 border-surface-600 opacity-60"
    }`}>
      {/* Toggle */}
      <button type="button" onClick={() => onToggle(msg)} className="shrink-0 text-gray-400 hover:text-rust-400 transition-colors">
        {msg.enabled ? <ToggleRight size={22} className="text-rust-400" /> : <ToggleLeft size={22} />}
      </button>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: msg.color || undefined }}
        >
          {msg.text || <span className="text-gray-600 italic">Message vide</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock size={11} className="text-gray-600" />
          <span className="text-xs text-gray-500">
            Toutes les {msg.interval_minutes} min
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          title="Envoyer maintenant"
          className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-surface-600 transition-colors"
        >
          {testing ? <Check size={14} className="text-green-400" /> : <Play size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onEdit(msg)}
          title="Modifier"
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-600 transition-colors"
        >
          <Edit2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(msg.id)}
          title="Supprimer"
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-surface-600 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function MessageForm({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text || "");
  const [interval, setInterval] = useState(initial?.interval_minutes || 10);
  const [color, setColor] = useState(initial?.color || "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({ text: text.trim(), interval_minutes: interval, color, enabled });
  };

  return (
    <form onSubmit={handleSubmit}
      className="bg-surface-700 border border-rust-700/50 rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-300 mb-1">
        {initial ? "Modifier le message" : "Nouveau message"}
      </div>

      {/* Text */}
      <div>
        <label className="label">Texte du message</label>
        <input
          className="input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Bienvenue sur le serveur !"
          autoFocus
          maxLength={250}
        />
        <div className="text-xs text-gray-600 mt-1 text-right">{text.length}/250</div>
      </div>

      {/* Preview */}
      {text && (
        <div className="bg-surface-800 rounded-lg px-3 py-2 text-xs font-mono border border-surface-600">
          <span className="text-gray-500">[Serveur] </span>
          <span style={{ color: color || undefined }}>{text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Interval */}
        <div>
          <label className="label">Intervalle</label>
          <select className="input" value={interval} onChange={e => setInterval(Number(e.target.value))}>
            {INTERVALS.map(v => (
              <option key={v} value={v}>
                {v < 60 ? `${v} min` : `${v / 60}h`}
              </option>
            ))}
          </select>
        </div>

        {/* Color */}
        <div>
          <label className="label">Couleur</label>
          <select className="input" value={color} onChange={e => setColor(e.target.value)}>
            {COLOR_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="msg-enabled" checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          className="w-4 h-4 accent-rust-500" />
        <label htmlFor="msg-enabled" className="text-sm text-gray-300">Activer ce message</label>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
          <X size={13} /> Annuler
        </button>
        <button type="submit" className="btn-primary text-sm" disabled={!text.trim()}>
          <Check size={13} /> {initial ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editMsg, setEditMsg] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/messages`);
      setMessages(data);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (payload) => {
    const { data } = await axios.post(`${BASE}/api/messages`, payload);
    setMessages(m => [...m, data]);
    setShowForm(false);
  };

  const handleEdit = async (payload) => {
    const { data } = await axios.put(`${BASE}/api/messages/${editMsg.id}`, payload);
    setMessages(m => m.map(x => x.id === editMsg.id ? data : x));
    setEditMsg(null);
  };

  const handleToggle = async (msg) => {
    const updated = { ...msg, enabled: !msg.enabled };
    const { data } = await axios.put(`${BASE}/api/messages/${msg.id}`, updated);
    setMessages(m => m.map(x => x.id === msg.id ? data : x));
  };

  const handleDelete = async (id) => {
    await axios.delete(`${BASE}/api/messages/${id}`);
    setMessages(m => m.filter(x => x.id !== id));
  };

  const handleTest = async (id) => {
    await axios.post(`${BASE}/api/messages/${id}/test`);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Messages automatiques</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Envoyés en jeu via <code className="text-gray-400">say</code> pendant que le serveur tourne
          </p>
        </div>
        {messages.length > 0 && !showForm && !editMsg && (
          <button className="btn-primary text-sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>

      {/* Active count badge */}
      {messages.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <div className="text-xs text-gray-500">
            {messages.filter(m => m.enabled).length} actif(s) sur {messages.length}
          </div>
          <div className="flex-1 h-px bg-surface-600" />
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mb-4">
          <MessageForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Message list */}
      {messages.length === 0 && !showForm ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-2">
          {messages.map(msg => (
            editMsg?.id === msg.id ? (
              <MessageForm
                key={msg.id}
                initial={msg}
                onSave={handleEdit}
                onCancel={() => setEditMsg(null)}
              />
            ) : (
              <MessageRow
                key={msg.id}
                msg={msg}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onTest={handleTest}
                onEdit={setEditMsg}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
