import { Users, Search, Shield, Ban, MessageSquare } from "lucide-react";

export default function PlayersPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Player Manager</h2>
          <p className="text-sm text-gray-500">View and manage connected players</p>
        </div>
      </div>

      {/* Coming soon */}
      <div className="card border-blue-700/50 bg-blue-900/20">
        <div className="flex items-start gap-3">
          <Users size={20} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-blue-300">Player Management Coming Soon</div>
            <div className="text-sm text-gray-400 mt-1">
              Live player list with kick, ban, mute, and message features require RCON integration.
              This will be available in the next update.
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Search players..." disabled />
      </div>

      {/* Empty state */}
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <Users size={40} className="text-gray-600 mb-3" />
        <div className="font-medium text-gray-400">No players connected</div>
        <div className="text-sm text-gray-600 mt-1 max-w-xs">
          Start the server and connect via RCON to see live player data.
        </div>
      </div>

      {/* Action reference */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Shield, label: "Ban Player", desc: "Permanently ban a player by SteamID or name." },
          { icon: Ban, label: "Kick Player", desc: "Disconnect a player from the server." },
          { icon: MessageSquare, label: "Message Player", desc: "Send a private message to a player." },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="card opacity-50">
            <Icon size={18} className="text-rust-400 mb-2" />
            <div className="font-medium text-gray-300 text-sm">{label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
