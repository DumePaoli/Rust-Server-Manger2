import { useEffect, useState } from "react";
import { getConfig, saveConfig } from "../api/client";
import {
  Save, RefreshCw, Eye, EyeOff, Shuffle, X, ExternalLink, Map,
} from "lucide-react";

const TABS = [
  { id: "settings", label: "Server Settings" },
  { id: "network", label: "Server IP/Ports" },
  { id: "convars", label: "ConVars" },
  { id: "advanced", label: "Advanced Settings" },
];

const COMMON_TAGS = [
  "monthly", "biweekly", "weekly", "vanilla", "pve", "softcore",
  "hardcore", "roleplay", "creative", "modded", "minigame", "training",
];

const MAP_TYPES = ["Procedural Map", "Barren", "HapisIsland", "CraggyIsland"];

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-rust-600" : "bg-surface-400"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`} />
    </button>
  );
}

function Field({ label, hint, children, span2 = false }) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-sm font-medium text-gray-300">{label}</div>
        {desc && <div className="text-xs text-gray-500">{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function ServerSettings() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState("settings");
  const [showRcon, setShowRcon] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const load = async () => {
    try { setConfig(await getConfig()); }
    catch { setMsg({ type: "error", text: "Failed to load configuration." }); }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setConfig(c => ({ ...c, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await saveConfig(config);
      setMsg({ type: "success", text: result.message });
    } catch {
      setMsg({ type: "error", text: "Failed to save configuration." });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const randomSeed = () => set("map_seed", Math.floor(Math.random() * 2147483647));

  const addTag = (tag) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const current = config.server_tags || [];
    if (!current.includes(t)) set("server_tags", [...current, t]);
    setTagInput("");
  };

  const removeTag = (tag) =>
    set("server_tags", (config.server_tags || []).filter(t => t !== tag));

  if (!config) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  const rustmapsUrl = `https://rustmaps.com/map/${config.map_size}/${config.map_seed}`;
  const tags = config.server_tags || [];

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-surface-600 bg-surface-800 px-6 pt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-100">
            {config.server_name || "My Rust Server"}
          </h2>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={load}>
              <RefreshCw size={12} /> Reload
            </button>
            <button type="submit" className="btn-primary text-xs" disabled={saving}>
              <Save size={12} /> {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-rust-500 text-rust-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alert banner */}
      {msg && (
        <div className={`mx-6 mt-4 rounded-lg px-4 py-2.5 text-sm font-medium border ${
          msg.type === "success"
            ? "bg-green-900/40 border-green-800 text-green-300"
            : "bg-red-900/40 border-red-800 text-red-300"
        }`}>{msg.text}</div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── SERVER SETTINGS ── */}
        {tab === "settings" && (
          <div className="space-y-5 max-w-5xl">
            {/* Row 1: Name + Description */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name">
                <input className="input" value={config.server_name}
                  onChange={e => set("server_name", e.target.value)}
                  placeholder="My Rust Server" />
              </Field>
              <Field label="Description">
                <input className="input" value={config.server_description}
                  onChange={e => set("server_description", e.target.value)}
                  placeholder="A great Rust server" />
              </Field>
            </div>

            {/* Row 2: Logo + Tags */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Logo URL" hint="1024×512 recommended">
                <input className="input font-mono text-xs" value={config.server_logo_url || ""}
                  onChange={e => set("server_logo_url", e.target.value)}
                  placeholder="https://..." />
              </Field>
              <Field label="Tags">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                      placeholder="Add a tag…"
                    />
                    <select
                      className="input w-32 text-sm"
                      value=""
                      onChange={e => { if (e.target.value) addTag(e.target.value); }}
                    >
                      <option value="">Quick add</option>
                      {COMMON_TAGS.filter(t => !tags.includes(t)).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                        <span key={tag}
                          className="flex items-center gap-1 bg-surface-600 border border-surface-500 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)}
                            className="text-gray-500 hover:text-red-400 transition-colors">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </div>

            {/* Row 3: Web URL + RCON password */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Web URL">
                <input className="input font-mono text-sm" value={config.server_url || ""}
                  onChange={e => set("server_url", e.target.value)}
                  placeholder="https://your-website.com" />
              </Field>
              <Field label="RCON Password">
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono"
                    type={showRcon ? "text" : "password"}
                    value={config.rcon_password}
                    onChange={e => set("rcon_password", e.target.value)}
                  />
                  <button type="button" onClick={() => setShowRcon(v => !v)}
                    className="btn-secondary px-3" title={showRcon ? "Hide" : "Show"}>
                    {showRcon ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
            </div>

            {/* Row 4: Max players + SteamID */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max Players">
                <input className="input" type="number" min={1} max={500}
                  value={config.max_players}
                  onChange={e => set("max_players", Number(e.target.value))} />
              </Field>
              <Field label="Your SteamID (Admin)">
                <input className="input font-mono" value={config.admin_steamid || ""}
                  onChange={e => set("admin_steamid", e.target.value)}
                  placeholder="76561198…" />
              </Field>
            </div>

            {/* Map section: 3 columns */}
            <div className="grid grid-cols-3 gap-4">
              {/* Server Map controls */}
              <div className="bg-surface-700 rounded-xl border border-surface-500 p-4 space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Server Map</div>
                <div>
                  <label className="label">Map Type</label>
                  <select className="input" value={config.level}
                    onChange={e => set("level", e.target.value)}>
                    {MAP_TYPES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Map Size</label>
                  <input className="input" type="number" min={1000} max={6000} step={500}
                    value={config.map_size}
                    onChange={e => set("map_size", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Map Seed</label>
                  <input className="input font-mono" type="number"
                    value={config.map_seed}
                    onChange={e => set("map_seed", Number(e.target.value))} />
                </div>
                <button type="button" onClick={randomSeed}
                  className="w-full btn-secondary text-sm flex items-center justify-center gap-2">
                  <Shuffle size={13} /> Random Seed
                </button>
              </div>

              {/* Map Preview */}
              <div className="bg-surface-700 rounded-xl border border-surface-500 p-4 flex flex-col gap-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Map Preview</div>
                <div className="flex-1 bg-surface-800 rounded-lg flex flex-col items-center justify-center gap-2 p-4 min-h-32">
                  <Map size={32} className="text-surface-500" />
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-400">{config.map_size} × {config.map_size}</div>
                    <div className="text-xs text-gray-600 font-mono mt-0.5">Seed: {config.map_seed}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{config.level}</div>
                  </div>
                </div>
                <a href={rustmapsUrl} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-rust-400 hover:text-rust-300 transition-colors">
                  <ExternalLink size={11} /> Preview on rustmaps.com
                </a>
              </div>

              {/* Custom Map */}
              <div className="bg-surface-700 rounded-xl border border-surface-500 p-4 space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom Map Settings</div>
                <div>
                  <label className="label">Custom Map URL</label>
                  <input className="input font-mono text-xs" value={config.custom_map_url || ""}
                    onChange={e => set("custom_map_url", e.target.value)}
                    placeholder="https://…/map.map" />
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">
                  Paste a direct <code className="text-gray-400">.map</code> file URL to override procedural generation.
                </div>
                {config.custom_map_url && (
                  <div className="text-xs bg-rust-900/30 border border-rust-800/50 rounded-lg px-3 py-2 text-rust-300">
                    Custom map active — Seed and Map Size will be ignored.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SERVER IP/PORTS ── */}
        {tab === "network" && (
          <div className="max-w-xl space-y-4">
            <div className="card grid grid-cols-2 gap-4">
              <Field label="Server IP">
                <input className="input font-mono" value={config.server_ip}
                  onChange={e => set("server_ip", e.target.value)} placeholder="0.0.0.0" />
              </Field>
              <Field label="Server Port">
                <input className="input font-mono" type="number" value={config.server_port}
                  onChange={e => set("server_port", Number(e.target.value))} />
              </Field>
              <Field label="RCON Port">
                <input className="input font-mono" type="number" value={config.rcon_port}
                  onChange={e => set("rcon_port", Number(e.target.value))} />
              </Field>
              <Field label="Query Port">
                <input className="input font-mono" type="number" value={config.query_port || 28017}
                  onChange={e => set("query_port", Number(e.target.value))} />
              </Field>
              <Field label="App Port" hint="Rust+ mobile app">
                <input className="input font-mono" type="number" value={config.app_port || 28082}
                  onChange={e => set("app_port", Number(e.target.value))} />
              </Field>
            </div>
          </div>
        )}

        {/* ── CONVARS ── */}
        {tab === "convars" && (
          <div className="max-w-xl space-y-4">
            <div className="card space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["Gather Rate", "gather_rate", 1.0, 0.5],
                  ["Craft Rate", "craft_rate", 1.0, 0.5],
                  ["Decay Scale", "decay_scale", 1.0, 0.1],
                  ["Save Interval (s)", "save_interval", 600, 60],
                ].map(([label, key, def, step]) => (
                  <Field key={key} label={label}>
                    <input className="input" type="number" step={step} min={0}
                      value={config[key] ?? def}
                      onChange={e => set(key, parseFloat(e.target.value))} />
                  </Field>
                ))}
              </div>
              <div className="border-t border-surface-600 pt-4 space-y-3">
                <ToggleRow label="Radiation" desc="Enable radiation zones"
                  checked={!!config.radiation} onChange={v => set("radiation", v)} />
                <ToggleRow label="PvE Mode" desc="Disable player vs player damage"
                  checked={!!config.pve} onChange={v => set("pve", v)} />
                <ToggleRow label="Hardcore Mode" desc="Reduced UI, permadeath inventory"
                  checked={!!config.hardcore} onChange={v => set("hardcore", v)} />
                <ToggleRow label="Oxide / Carbon" desc="Enable modding framework"
                  checked={!!config.oxide_enabled} onChange={v => set("oxide_enabled", v)} />
              </div>
            </div>
          </div>
        )}

        {/* ── ADVANCED SETTINGS ── */}
        {tab === "advanced" && (
          <div className="max-w-xl space-y-4">
            <div className="card space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Server Executable" span2>
                  <input className="input font-mono text-sm" value={config.server_executable}
                    onChange={e => set("server_executable", e.target.value)}
                    placeholder="C:\RustDedicated\RustDedicated.exe" />
                </Field>
                <Field label="Server Identity">
                  <input className="input font-mono" value={config.server_identity}
                    onChange={e => set("server_identity", e.target.value)} />
                </Field>
              </div>
              <div className="border-t border-surface-600 pt-4 space-y-3">
                <ToggleRow label="Auto Update Server" desc="Update server on startup if needed"
                  checked={!!config.auto_update} onChange={v => set("auto_update", v)} />
                <ToggleRow label="Auto Wipe Map" desc="Wipe map data on next restart"
                  checked={!!config.auto_wipe_map} onChange={v => set("auto_wipe_map", v)} />
                <ToggleRow label="Auto Wipe Blueprints" desc="Wipe blueprint data on next restart"
                  checked={!!config.auto_wipe_blueprints} onChange={v => set("auto_wipe_blueprints", v)} />
              </div>
            </div>

            {/* Launch command preview */}
            <div className="card">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Launch Command Preview
              </div>
              <pre className="text-xs text-gray-400 bg-surface-800 rounded-lg p-3 overflow-x-auto whitespace-pre font-mono leading-relaxed">
{(config.server_executable || "RustDedicated") + " -batchmode \\\n" +
`  +server.ip ${config.server_ip} \\\n` +
`  +server.port ${config.server_port} \\\n` +
`  +server.maxplayers ${config.max_players} \\\n` +
`  +server.hostname "${config.server_name}" \\\n` +
`  +server.identity ${config.server_identity} \\\n` +
(config.custom_map_url
  ? `  +server.levelurl "..." \\\n`
  : `  +server.seed ${config.map_seed} \\\n  +server.worldsize ${config.map_size} \\\n`) +
`  +rcon.port ${config.rcon_port} \\\n` +
`  +rcon.web 1 -nographics`}
              </pre>
            </div>
          </div>
        )}

      </div>
    </form>
  );
}
