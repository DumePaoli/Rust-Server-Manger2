import { SlidersHorizontal, Server } from "lucide-react";

export default function AppSettings() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">App Settings</h2>
        <p className="text-sm text-gray-500">Configure Rust Manager preferences</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-500">
          <Server size={16} className="text-rust-400" />
          <h3 className="font-semibold text-gray-200">Backend Connection</h3>
        </div>
        <div>
          <label className="label">API URL</label>
          <input
            className="input font-mono text-sm"
            defaultValue="http://localhost:8000"
            readOnly
          />
          <p className="text-xs text-gray-600 mt-1">
            Change via VITE_API_URL environment variable.
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-500">
          <SlidersHorizontal size={16} className="text-rust-400" />
          <h3 className="font-semibold text-gray-200">About</h3>
        </div>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-gray-300 font-mono">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Backend</span>
            <span className="text-gray-300 font-mono">Python / FastAPI</span>
          </div>
          <div className="flex justify-between">
            <span>Frontend</span>
            <span className="text-gray-300 font-mono">React + Vite</span>
          </div>
        </div>
      </div>
    </div>
  );
}
