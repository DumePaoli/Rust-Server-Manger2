import { Package, Search, Download, RefreshCw, ExternalLink } from "lucide-react";

const DEMO_PLUGINS = [
  { name: "Oxide.Ext.Discord", version: "2.0.10", installed: true, desc: "Discord bot integration for your server." },
  { name: "VanishNoPacket", version: "1.8.5", installed: true, desc: "Allows admins to go invisible." },
  { name: "AutoPurge", version: "1.3.2", installed: false, desc: "Automatically removes inactive player data." },
  { name: "Clans", version: "0.3.6", installed: false, desc: "Player clan system with tags and perks." },
  { name: "Kits", version: "3.1.4", installed: true, desc: "Give players starter kits." },
  { name: "Economics", version: "3.8.2", installed: false, desc: "Virtual currency system." },
  { name: "GUIShop", version: "3.9.7", installed: false, desc: "GUI-based in-game shop." },
  { name: "NTeleportation", version: "1.1.23", installed: true, desc: "Advanced teleportation plugin." },
];

export default function PluginsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Plugin Manager</h2>
          <p className="text-sm text-gray-500">Install and manage Oxide/Carbon plugins</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-sm">
            <RefreshCw size={14} />
            Check Updates
          </button>
          <button className="btn-primary text-sm">
            <Download size={14} />
            Install Plugin
          </button>
        </div>
      </div>

      {/* Coming soon notice */}
      <div className="card border-rust-700/50 bg-rust-900/20">
        <div className="flex items-start gap-3">
          <Package size={20} className="text-rust-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-rust-300">Full Plugin Management Coming Soon</div>
            <div className="text-sm text-gray-400 mt-1">
              One-click Oxide/Carbon plugin installation, auto-updates, and uMod integration are in development.
              Below is a preview of what the interface will look like.
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Search plugins..." />
      </div>

      {/* Plugin list */}
      <div className="space-y-2">
        {DEMO_PLUGINS.map((plugin) => (
          <div key={plugin.name} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-600 flex items-center justify-center text-gray-400 shrink-0">
              <Package size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-200 text-sm">{plugin.name}</span>
                <span className="text-xs text-gray-500 font-mono">v{plugin.version}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{plugin.desc}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {plugin.installed ? (
                <>
                  <span className="badge-online text-xs">Installed</span>
                  <button className="btn-secondary text-xs py-1 px-2 opacity-60 cursor-not-allowed" disabled>
                    Update
                  </button>
                  <button className="btn-danger text-xs py-1 px-2 opacity-60 cursor-not-allowed" disabled>
                    Remove
                  </button>
                </>
              ) : (
                <button className="btn-primary text-xs py-1 opacity-60 cursor-not-allowed" disabled>
                  <Download size={12} />
                  Install
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
