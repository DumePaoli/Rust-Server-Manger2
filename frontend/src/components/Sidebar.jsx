import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Settings, Terminal, Package, Users,
  Trash2, MessageSquare, Clock, Download, SlidersHorizontal,
  ArrowUpCircle,
} from "lucide-react";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/console", icon: Terminal, label: "Console" },
  { to: "/players", icon: Users, label: "Players" },
  { to: "/plugins", icon: Package, label: "Plugins" },
  { to: "/wipe", icon: Trash2, label: "Wipe Manager" },
  { to: "/settings", icon: Settings, label: "Server Settings" },
  { divider: true },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
  { to: "/times", icon: Clock, label: "Times" },
  { to: "/discord", icon: MessageSquare, label: "Discord" },
  { divider: true },
  { to: "/app-settings", icon: SlidersHorizontal, label: "App Settings" },
  { to: "/installer", icon: Download, label: "Installer" },
];

export default function Sidebar({ updateInfo, onUpdateClick }) {
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

      {/* Update banner */}
      {hasUpdate && (
        <button
          onClick={onUpdateClick}
          className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-rust-600/15 border border-rust-700/50 text-rust-300 text-xs font-medium hover:bg-rust-600/25 transition-colors"
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
              <span className="flex-1">{item.label}</span>
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
