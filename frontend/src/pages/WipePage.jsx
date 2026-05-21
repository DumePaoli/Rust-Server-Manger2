import { Trash2, Calendar, AlertTriangle, Clock } from "lucide-react";

export default function WipePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Wipe Manager</h2>
          <p className="text-sm text-gray-500">Schedule and execute server wipes</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary opacity-60 cursor-not-allowed" disabled>
            <Calendar size={14} />
            Schedule Wipe
          </button>
          <button className="btn-danger opacity-60 cursor-not-allowed" disabled>
            <Trash2 size={14} />
            Wipe Now
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="card border-yellow-700/50 bg-yellow-900/20">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-yellow-300">Full Wipe Manager Coming Soon</div>
            <div className="text-sm text-gray-400 mt-1">
              Automated wipe scheduling, blueprint wipes, and wipe history will be available in the next update.
              Map wipes delete player bases and loot. Blueprint wipes additionally reset crafting progress.
            </div>
          </div>
        </div>
      </div>

      {/* Wipe types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 size={16} className="text-orange-400" />
            <span className="font-medium text-gray-200">Map Wipe</span>
          </div>
          <p className="text-sm text-gray-400">
            Wipes all player-built structures, loot, and the map. Player blueprints are preserved.
            Usually done monthly or more frequently.
          </p>
          <div className="mt-4 text-xs text-gray-500 flex items-center gap-1.5">
            <Clock size={12} />
            Last wipe: Never
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 size={16} className="text-red-400" />
            <span className="font-medium text-gray-200">Full Wipe (BP + Map)</span>
          </div>
          <p className="text-sm text-gray-400">
            Complete reset: wipes all structures, loot, AND player blueprints.
            Done at Facepunch's forced monthly wipe.
          </p>
          <div className="mt-4 text-xs text-gray-500 flex items-center gap-1.5">
            <Clock size={12} />
            Last wipe: Never
          </div>
        </div>
      </div>

      {/* Wipe history placeholder */}
      <div className="card">
        <h3 className="font-medium text-gray-200 mb-4">Wipe History</h3>
        <div className="text-center py-8 text-gray-600 text-sm">
          No wipes recorded yet.
        </div>
      </div>
    </div>
  );
}
