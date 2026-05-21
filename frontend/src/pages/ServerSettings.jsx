import { useEffect, useState } from "react";
import { getConfig, saveConfig } from "../api/client";
import { Save, RefreshCw, Server, Network, Map, Shield, Wrench } from "lucide-react";

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-surface-500">
        <Icon size={16} className="text-rust-400" />
        <h3 className="font-semibold text-gray-200">{title}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-rust-600" : "bg-surface-400"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function ServerSettings() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const data = await getConfig();
      setConfig(data);
    } catch {
      setMsg({ type: "error", text: "Failed to load configuration." });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

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

  if (!config) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Server Settings</h2>
          <p className="text-sm text-gray-500">Configure your Rust server parameters</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={load}>
            <RefreshCw size={14} />
            Reload
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            <Save size={14} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium border ${
            msg.type === "success"
              ? "bg-green-900/40 border-green-800 text-green-300"
              : "bg-red-900/40 border-red-800 text-red-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* General */}
      <Section title="General" icon={Server}>
        <Field label="Server Name">
          <input
            className="input"
            value={config.server_name}
            onChange={(e) => set("server_name", e.target.value)}
            placeholder="My Rust Server"
          />
        </Field>
        <Field label="Server Description">
          <input
            className="input"
            value={config.server_description}
            onChange={(e) => set("server_description", e.target.value)}
            placeholder="A great Rust server"
          />
        </Field>
        <Field label="Server Identity">
          <input
            className="input font-mono"
            value={config.server_identity}
            onChange={(e) => set("server_identity", e.target.value)}
            placeholder="rust_server"
          />
        </Field>
        <Field label="Server Executable Path">
          <input
            className="input font-mono text-sm"
            value={config.server_executable}
            onChange={(e) => set("server_executable", e.target.value)}
            placeholder="/path/to/RustDedicated"
          />
        </Field>
      </Section>

      {/* Network */}
      <Section title="Network" icon={Network}>
        <Field label="Server IP">
          <input
            className="input font-mono"
            value={config.server_ip}
            onChange={(e) => set("server_ip", e.target.value)}
            placeholder="0.0.0.0"
          />
        </Field>
        <Field label="Server Port">
          <input
            className="input font-mono"
            type="number"
            value={config.server_port}
            onChange={(e) => set("server_port", Number(e.target.value))}
          />
        </Field>
        <Field label="RCON Port">
          <input
            className="input font-mono"
            type="number"
            value={config.rcon_port}
            onChange={(e) => set("rcon_port", Number(e.target.value))}
          />
        </Field>
        <Field label="RCON Password">
          <input
            className="input font-mono"
            type="password"
            value={config.rcon_password}
            onChange={(e) => set("rcon_password", e.target.value)}
          />
        </Field>
        <Field label="Max Players">
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            value={config.max_players}
            onChange={(e) => set("max_players", Number(e.target.value))}
          />
        </Field>
      </Section>

      {/* Map */}
      <Section title="Map & World" icon={Map}>
        <Field label="Map Size">
          <input
            className="input"
            type="number"
            min={1000}
            max={6000}
            step={500}
            value={config.map_size}
            onChange={(e) => set("map_size", Number(e.target.value))}
          />
        </Field>
        <Field label="Map Seed">
          <input
            className="input font-mono"
            type="number"
            value={config.map_seed}
            onChange={(e) => set("map_seed", Number(e.target.value))}
          />
        </Field>
        <Field label="Level">
          <select
            className="input"
            value={config.level}
            onChange={(e) => set("level", e.target.value)}
          >
            <option>Procedural Map</option>
            <option>Barren</option>
            <option>HapisIsland</option>
            <option>CraggyIsland</option>
          </select>
        </Field>
        <Field label="Save Interval (seconds)">
          <input
            className="input"
            type="number"
            min={60}
            value={config.save_interval}
            onChange={(e) => set("save_interval", Number(e.target.value))}
          />
        </Field>
      </Section>

      {/* Gameplay */}
      <Section title="Gameplay" icon={Shield}>
        <div className="flex items-center justify-between col-span-2 md:col-span-1">
          <div>
            <div className="text-sm font-medium text-gray-300">Radiation</div>
            <div className="text-xs text-gray-500">Enable radiation zones</div>
          </div>
          <Toggle checked={config.radiation} onChange={(v) => set("radiation", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-300">PvE Mode</div>
            <div className="text-xs text-gray-500">Disable player vs player damage</div>
          </div>
          <Toggle checked={config.pve} onChange={(v) => set("pve", v)} />
        </div>
        <Field label="Decay Scale">
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            max="10"
            value={config.decay_scale}
            onChange={(e) => set("decay_scale", parseFloat(e.target.value))}
          />
        </Field>
      </Section>

      {/* Plugins */}
      <Section title="Plugins" icon={Wrench}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-300">Oxide/Carbon Enabled</div>
            <div className="text-xs text-gray-500">Enable modding framework</div>
          </div>
          <Toggle checked={config.oxide_enabled} onChange={(v) => set("oxide_enabled", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-300">Auto Update Server</div>
            <div className="text-xs text-gray-500">Update on start if needed</div>
          </div>
          <Toggle checked={config.auto_update} onChange={(v) => set("auto_update", v)} />
        </div>
      </Section>
    </form>
  );
}
