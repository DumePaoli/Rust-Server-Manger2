import { NavLink } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  LayoutDashboard, Settings, Terminal, Package, Users,
  Trash2, MessageSquare, Clock, Download, SlidersHorizontal,
  ArrowUpCircle, Radio, Archive, ShieldOff, Shield, MessageCircle,
  Server, ChevronDown, Check, UserCheck,
} from "lucide-react";
import { useSettings } from "../contexts/SettingsContext";
import { t } from "../i18n";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/console", icon: Terminal, label: "Console" },
  { to: "/players", icon: Users, label: "Players" },
  { to: "/bans", icon: ShieldOff, label: "Bannissements" },
  { to: "/whitelist", icon: UserCheck, label: "Whitelist" },
  { to: "/plugins", icon: Package, label: "Plugins" },
  { to: "/oxide", icon: Shield, label: "Oxide Perms" },
  { to: "/wipe", icon: Trash2, label: "Wipe Manager" },
  { to: "/settings", icon: Settings, label: "Server Settings" },
  { divider: true },
  { to: "/chat", icon: MessageCircle, label: "Chat Log" },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
  { to: "/times", icon: Clock, label: "Times" },
  { to: "/rcon", icon: Radio, label: "RCON" },
  { to: "/backup", icon: Archive, label: "Sauvegardes" },
  { to: "/discord", icon: MessageSquare, label: "Discord" },
  { divider: true },
  { to: "/servers", icon: Server, label: "Servers" },
  { to: "/app-settings", icon: SlidersHorizontal, label: "App Settings" },
  { to: "/installer", icon: Download, label: "Installer" },
];

function ServerSwitcher() {
  const [servers, setServers] = useState([]);
  const [open, setOpen] = useState(false);
  const active = servers.find(s => s.active);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/servers`);
      setServers(data.servers ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const handleSelect = async (id) => {
    setOpen(false);
    try {
      await axios.post(`${BASE}/api/servers/${id}/select`);
      load();
    } catch {}
  };

  if (servers.length <= 1 && !active) return null;

  return (
    <div className="relative mx-3 mt-2 mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 hover:border-surface-500 transition-colors text-left"
      >
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active?.running ? "bg-green-400 animate-pulse" : "bg-surface-400"}`} />
        <span className="flex-1 text-xs font-medium text-gray-300 truncate">{active?.name ?? "Aucun serveur"}</span>
        <ChevronDown size={12} className={`text-gray-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-500 rounded-xl shadow-xl z-50 overflow-hidden">
          {servers.map(s => (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-600 transition-colors text-left"
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.running ? "bg-green-400" : "bg-surface-400"}`} />
              <span className="flex-1 text-xs text-gray-300 truncate">{s.name}</span>
              {s.active && <Check size={11} className="text-rust-400 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ updateInfo, onUpdateClick }) {
  const { lang } = useSettings();
  const hasUpdate = updateInfo?.available;

  return (
    <aside className="w-60 shrink-0 bg-surface-800 border-r border-surface-600 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-600">
        <div className="w-8 h-8 bg-rust-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">
          R
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm leading-tight">Rust Manager</div>
          <div className="text-xs text-gray-500">v{updateInfo?.current_version ?? "1.0.0"}</div>
        </div>
        {/* Update badge */}
        {hasUpdate && (
          <button
            onClick={onUpdateClick}
            title={`Mise à jour v${updateInfo.latest_version} disponible`}
            className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-rust-600/20 hover:bg-rust-600/40 text-rust-400 transition-colors"
          >
            <ArrowUpCircle size={16} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rust-500 rounded-full border-2 border-surface-800 animate-pulse" />
          </button>
        )}
      </div>

      {/* Server switcher */}
      <ServerSwitcher />

      {/* Update banner */}
      {hasUpdate && (
        <button
          onClick={onUpdateClick}
          className="mx-3 mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-rust-600/15 border border-rust-700/50 text-rust-300 text-xs font-medium hover:bg-rust-600/25 transition-colors"
        >
          <ArrowUpCircle size={13} />
          <span>v{updateInfo.latest_version} disponible !</span>
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV.map((item, i) => {
          if (item.divider) {
            return <div key={i} className="h-px bg-surface-600 my-2 mx-1" />;
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-100 group ${
                  isActive
                    ? "bg-rust-600/20 text-rust-400 font-medium"
                    : "text-gray-400 hover:text-gray-100 hover:bg-surface-600"
                }`
              }
            >
              <item.icon size={16} className="shrink-0" />
              <span className="flex-1">{t(item.label, lang)}</span>
              {item.soon && (
                <span className="text-[10px] font-medium bg-surface-500 text-gray-500 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-surface-600 text-xs text-gray-600">
        Rust Server Manager
      </div>
    </aside>
  );
}
