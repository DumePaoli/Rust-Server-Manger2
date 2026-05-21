import { Download, FolderOpen, Terminal, CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import { getConfig, saveConfig } from "../api/client";
import { useEffect } from "react";

const STEPS = [
  { id: 1, label: "Set SteamCMD path", desc: "Point to your SteamCMD installation" },
  { id: 2, label: "Choose install directory", desc: "Where the server files will be placed" },
  { id: 3, label: "Download server files", desc: "Using SteamCMD (app 258550)" },
  { id: 4, label: "Configure server", desc: "Set name, port, and map options" },
];

export default function InstallerPage() {
  const [execPath, setExecPath] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getConfig().then((c) => setExecPath(c.server_executable || ""));
  }, []);

  const handleSave = async () => {
    const config = await getConfig();
    await saveConfig({ ...config, server_executable: execPath });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Server Installer</h2>
        <p className="text-sm text-gray-500">Set up your Rust dedicated server</p>
      </div>

      {/* Steps */}
      <div className="card space-y-4">
        <h3 className="font-medium text-gray-200 text-sm">Installation Steps</h3>
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {i === 0 ? (
                <CheckCircle2 size={18} className="text-rust-400" />
              ) : (
                <Circle size={18} className="text-gray-600" />
              )}
            </div>
            <div>
              <div className={`text-sm font-medium ${i === 0 ? "text-gray-200" : "text-gray-500"}`}>
                {step.label}
              </div>
              <div className="text-xs text-gray-600">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Executable path */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-rust-400" />
          <h3 className="font-medium text-gray-200">Server Executable</h3>
        </div>
        <p className="text-sm text-gray-400">
          Point this manager to your <code className="font-mono text-xs bg-surface-600 px-1 py-0.5 rounded text-rust-300">RustDedicated</code> executable.
          Typically found in your SteamCMD install folder.
        </p>
        <div className="flex gap-2">
          <input
            className="input font-mono text-sm flex-1"
            placeholder="/home/steam/steamapps/common/rust_dedicated/RustDedicated"
            value={execPath}
            onChange={(e) => setExecPath(e.target.value)}
          />
          <button
            className="btn-primary shrink-0"
            onClick={handleSave}
          >
            {saved ? <CheckCircle2 size={14} /> : <Download size={14} />}
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          On Windows: <span className="font-mono text-gray-400">C:\steamcmd\steamapps\common\rust_dedicated\RustDedicated.exe</span>
          <br />
          On Linux: <span className="font-mono text-gray-400">/home/steam/steamapps/common/rust_dedicated/RustDedicated</span>
        </p>
      </div>

      {/* SteamCMD install command */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Download size={16} className="text-rust-400" />
          <h3 className="font-medium text-gray-200">Download via SteamCMD</h3>
        </div>
        <p className="text-sm text-gray-400">
          Run this command in SteamCMD to download/update the Rust dedicated server:
        </p>
        <div className="bg-surface-900 rounded-lg p-3 font-mono text-sm text-green-400 border border-surface-500">
          login anonymous<br />
          app_update 258550 validate<br />
          quit
        </div>
        <p className="text-xs text-gray-500">
          App ID 258550 is the Rust Dedicated Server on Steam.
        </p>
      </div>
    </div>
  );
}
