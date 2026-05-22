import { useEffect, useState } from "react";
import axios from "axios";
import { Save, Send, Eye, EyeOff, Check, X, RefreshCw } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const EVENT_META = {
  server_start: { label: "Serveur démarré", emoji: "🟢" },
  server_stop:  { label: "Serveur arrêté",  emoji: "🔴" },
  player_join:  { label: "Joueur connecté", emoji: "👤" },
  player_leave: { label: "Joueur déconnecté", emoji: "🚪" },
  player_ban:   { label: "Joueur banni",    emoji: "🔨" },
  wipe:         { label: "Wipe effectué",   emoji: "💥" },
};

const COLOR_MAP = {
  3066993:  "#2ecc71",  // green
  15158332: "#e74c3c",  // red
  3447003:  "#3498db",  // blue
  9807270:  "#979c9f",  // grey
  10181046: "#9b59b6",  // purple
};

function EmbedPreview({ event, serverName }) {
  const color = COLOR_MAP[event.color] || "#888";
  return (
    <div className="rounded-lg overflow-hidden border border-surface-500 bg-surface-900 text-xs">
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: color }} />
        <div className="p-3 space-y-1">
          <div className="font-semibold text-gray-200">{event.title}</div>
          <div className="text-gray-400 leading-relaxed">{event.message || "—"}</div>
          <div className="text-gray-600 pt-1">{serverName || "Rust Server"}</div>
        </div>
      </div>
    </div>
  );
}

function EventRow({ eventKey, event, onChange }) {
  const meta = EVENT_META[eventKey] || { label: eventKey, emoji: "•" };
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${event.enabled ? "border-surface-500 bg-surface-700" : "border-surface-600 bg-surface-800 opacity-60"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <span className="text-base">{meta.emoji}</span>
        <div className="flex-1 text-sm font-medium text-gray-300">{meta.label}</div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange({ ...event, enabled: !event.enabled }); }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${event.enabled ? "bg-rust-600" : "bg-surface-400"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${event.enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
        </button>
        <span className={`text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-surface-600 pt-3">
          <div>
            <label className="label">Titre</label>
            <input className="input text-sm" value={event.title || ""}
              onChange={e => onChange({ ...event, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Message <span className="text-gray-600 font-normal">(variables: {"{name}"})</span></label>
            <input className="input text-sm" value={event.message || ""}
              onChange={e => onChange({ ...event, message: e.target.value })} />
          </div>
          <div>
            <label className="label">Aperçu</label>
            <EmbedPreview event={event} serverName="" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscordPage() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/discord/config`);
      setConfig(data);
    } catch { }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setConfig(c => ({ ...c, [key]: value }));
  const setEvent = (key, value) => setConfig(c => ({
    ...c, events: { ...c.events, [key]: value }
  }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${BASE}/api/discord/config`, { data: config });
      setMsg({ ok: true, text: "Configuration Discord sauvegardée." });
    } catch {
      setMsg({ ok: false, text: "Erreur lors de la sauvegarde." });
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 4000);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data } = await axios.post(`${BASE}/api/discord/test`, {
        webhook_url: config.webhook_url,
        server_name: config.server_name,
      });
      setMsg(data.success
        ? { ok: true, text: "Message de test envoyé avec succès !" }
        : { ok: false, text: `Erreur : ${data.error || "webhook invalide"}` }
      );
    } catch {
      setMsg({ ok: false, text: "Impossible de joindre le webhook." });
    }
    setTesting(false);
    setTimeout(() => setMsg(null), 5000);
  };

  if (!config) return (
    <div className="p-6 flex items-center justify-center h-full">
      <RefreshCw size={20} className="animate-spin text-gray-500" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Intégration Discord</h2>
          <p className="text-sm text-gray-500 mt-0.5">Recevez des notifications dans votre serveur Discord</p>
        </div>
        <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border flex items-center gap-2 ${
          msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"
        }`}>
          {msg.ok ? <Check size={14} /> : <X size={14} />} {msg.text}
        </div>
      )}

      {/* Webhook config */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-300">Configuration du Webhook</div>
          <button
            type="button"
            onClick={() => set("enabled", !config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? "bg-rust-600" : "bg-surface-400"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <div>
          <label className="label">Webhook URL</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              type={showWebhook ? "text" : "password"}
              value={config.webhook_url || ""}
              onChange={e => set("webhook_url", e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
            />
            <button type="button" onClick={() => setShowWebhook(v => !v)}
              className="btn-secondary px-3">
              {showWebhook ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={handleTest}
              disabled={testing || !config.webhook_url}
            >
              {testing ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              Test
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            Discord → Paramètres du serveur → Intégrations → Webhooks → Nouveau webhook
          </p>
        </div>

        <div>
          <label className="label">Nom du serveur (affiché dans les embeds)</label>
          <input className="input" value={config.server_name || ""}
            onChange={e => set("server_name", e.target.value)}
            placeholder="Mon Serveur Rust" />
        </div>
      </div>

      {/* Events */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-gray-300 mb-3">Événements</div>
        {Object.entries(config.events || {}).map(([key, event]) => (
          <EventRow
            key={key}
            eventKey={key}
            event={event}
            onChange={v => setEvent(key, v)}
          />
        ))}
      </div>
    </div>
  );
}
