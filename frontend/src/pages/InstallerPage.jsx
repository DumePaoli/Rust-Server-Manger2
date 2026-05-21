import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Download, CheckCircle2, Circle, AlertCircle, RefreshCw,
  Terminal, Wrench, FolderOpen, ChevronRight, Check,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STEPS = [
  { id: 1, title: "SteamCMD", desc: "Localiser ou télécharger SteamCMD" },
  { id: 2, title: "Dossier", desc: "Choisir le répertoire d'installation" },
  { id: 3, title: "Installation", desc: "Télécharger le serveur Rust" },
  { id: 4, title: "Terminé", desc: "Configurer l'application" },
];

function StepIndicator({ current, maxReached }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        const reachable = step.id <= maxReached;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                done ? "bg-green-600 text-white" :
                active ? "bg-rust-600 text-white" :
                reachable ? "bg-surface-500 text-gray-300" :
                "bg-surface-700 text-gray-600"
              }`}>
                {done ? <Check size={14} /> : step.id}
              </div>
              <div className={`text-[10px] mt-1 font-medium ${active ? "text-rust-400" : done ? "text-green-500" : "text-gray-600"}`}>
                {step.title}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 mb-4 mx-1 transition-colors ${done ? "bg-green-600" : "bg-surface-600"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ percent, status }) {
  const color = status === "error" ? "bg-red-500" : status === "done" ? "bg-green-500" : "bg-rust-500";
  return (
    <div className="w-full bg-surface-700 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default function InstallerPage() {
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [status, setStatus] = useState(null);       // /api/installer/status
  const [progress, setProgress] = useState(null);   // /api/installer/progress
  const [steamcmdPath, setSteamcmdPath] = useState("");
  const [steamcmdDir, setSteamcmdDir] = useState("C:\\steamcmd");
  const [serverDir, setServerDir] = useState("C:\\RustServer");
  const [working, setWorking] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const logRef = useRef(null);
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/installer/status`);
      setStatus(data);
      if (data.steamcmd_path) setSteamcmdPath(data.steamcmd_path);
      if (data.default_steamcmd_dir) setSteamcmdDir(data.default_steamcmd_dir);
      if (data.platform !== "win32") {
        setServerDir("/opt/rust_server");
      }
    } catch { /* backend not ready yet */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress?.log?.length]);

  const startPolling = useCallback((intervalMs = 1000) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${BASE}/api/installer/progress`);
        setProgress(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setWorking(false);
        }
      } catch { /* ignore */ }
    }, intervalMs);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const goTo = (n) => {
    setStep(n);
    setMaxReached(m => Math.max(m, n));
  };

  // ── Step 1: SteamCMD ────────────────────────────────────────────────────

  const handleDownloadSteamCMD = async () => {
    setWorking(true);
    setProgress(null);
    try {
      await axios.post(`${BASE}/api/installer/steamcmd/download`, { install_dir: steamcmdDir });
      startPolling(500);
    } catch (e) {
      setWorking(false);
    }
  };

  const handleUseSteamCMD = () => {
    if (!steamcmdPath) return;
    goTo(2);
  };

  // ── Step 3: Install server ───────────────────────────────────────────────

  const handleInstall = async () => {
    setWorking(true);
    setProgress(null);
    try {
      await axios.post(`${BASE}/api/installer/server/install`, {
        steamcmd_path: steamcmdPath,
        server_dir: serverDir,
      });
      startPolling(1500);
    } catch {
      setWorking(false);
    }
  };

  // ── Step 4: Save config ──────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    const sep = status?.platform === "win32" ? "\\" : "/";
    const exeName = status?.platform === "win32" ? "RustDedicated.exe" : "RustDedicated";
    const execPath = serverDir.replace(/[/\\]$/, "") + sep + exeName;
    try {
      const { data: cfg } = await axios.get(`${BASE}/api/config`);
      await axios.put(`${BASE}/api/config`, {
        data: { ...cfg, server_executable: execPath, server_data_path: serverDir },
      });
      setConfigSaved(true);
    } catch { /* ignore */ }
  };

  // ── When SteamCMD download finishes ─────────────────────────────────────
  useEffect(() => {
    if (progress?.status === "done" && step === 1) {
      // Reload status to get newly found steamcmd path
      setTimeout(() => {
        loadStatus().then(() => {
          // find steamcmd in the dir
          const sep = "\\";
          const guessedPath = steamcmdDir.replace(/[/\\]$/, "") + sep + "steamcmd.exe";
          setSteamcmdPath(guessedPath);
        });
      }, 500);
    }
    if (progress?.status === "done" && step === 3) {
      goTo(4);
    }
  }, [progress?.status, step]); // eslint-disable-line

  // ── Render ───────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-100 mb-1">SteamCMD</h3>
        <p className="text-sm text-gray-400">
          SteamCMD est l'outil de Valve pour télécharger les serveurs Steam. Il est nécessaire pour installer le serveur Rust.
        </p>
      </div>

      {/* Detected */}
      {status?.steamcmd_found ? (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-green-900/25 border border-green-800">
          <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-green-300">SteamCMD détecté</div>
            <div className="text-xs text-green-600 font-mono break-all mt-0.5">{status.steamcmd_path}</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-900/20 border border-yellow-800/50">
          <AlertCircle size={16} className="text-yellow-400 shrink-0" />
          <div className="text-sm text-yellow-300">SteamCMD non trouvé sur ce système.</div>
        </div>
      )}

      {/* Manual path */}
      <div>
        <label className="label">Chemin SteamCMD (si déjà installé)</label>
        <input
          className="input font-mono text-xs"
          placeholder={status?.platform === "win32" ? "C:\\steamcmd\\steamcmd.exe" : "/usr/bin/steamcmd"}
          value={steamcmdPath}
          onChange={e => setSteamcmdPath(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 text-gray-500 text-xs">
        <div className="flex-1 h-px bg-surface-600" />
        ou télécharger automatiquement
        <div className="flex-1 h-px bg-surface-600" />
      </div>

      {/* Auto-download */}
      <div className="space-y-2">
        <label className="label">Dossier d'installation SteamCMD</label>
        <input
          className="input font-mono text-xs"
          value={steamcmdDir}
          onChange={e => setSteamcmdDir(e.target.value)}
        />
        <button
          className="btn-secondary text-sm w-full justify-center"
          onClick={handleDownloadSteamCMD}
          disabled={working || !steamcmdDir}
        >
          {working ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
          {working ? "Téléchargement…" : "Télécharger SteamCMD"}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{progress.status === "done" ? "Téléchargement terminé !" : progress.status === "error" ? "Erreur" : "En cours…"}</span>
            <span>{progress.percent}%</span>
          </div>
          <ProgressBar percent={progress.percent} status={progress.status} />
          {progress.log?.length > 0 && (
            <div className="bg-surface-900 rounded-lg p-2 font-mono text-xs text-gray-400 border border-surface-600 space-y-0.5">
              {progress.log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}

      <button
        className="btn-primary w-full justify-center"
        disabled={!steamcmdPath}
        onClick={handleUseSteamCMD}
      >
        Continuer
        <ChevronRight size={14} />
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-100 mb-1">Dossier d'installation</h3>
        <p className="text-sm text-gray-400">
          Choisissez où les fichiers du serveur Rust seront téléchargés. Il faut environ <strong className="text-gray-300">15-20 Go</strong> d'espace libre.
        </p>
      </div>

      <div className="p-3 rounded-lg bg-surface-700 border border-surface-500 space-y-1">
        <div className="text-xs text-gray-500 font-medium">SteamCMD utilisé</div>
        <div className="font-mono text-xs text-gray-300 break-all">{steamcmdPath}</div>
      </div>

      <div>
        <label className="label">Répertoire du serveur Rust</label>
        <input
          className="input font-mono text-sm"
          placeholder={status?.platform === "win32" ? "C:\\RustServer" : "/opt/rust_server"}
          value={serverDir}
          onChange={e => setServerDir(e.target.value)}
        />
        <p className="text-xs text-gray-600 mt-1.5">
          Le dossier sera créé s'il n'existe pas déjà.
        </p>
      </div>

      <div className="flex gap-3">
        <button className="btn-secondary flex-1 justify-center" onClick={() => goTo(1)}>
          Retour
        </button>
        <button
          className="btn-primary flex-1 justify-center"
          disabled={!serverDir.trim()}
          onClick={() => goTo(3)}
        >
          Installer
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-100 mb-1">Installation du serveur Rust</h3>
        <p className="text-sm text-gray-400">
          SteamCMD va télécharger les fichiers du serveur Rust (App ID 258550). Cela peut prendre 20–40 minutes selon votre connexion.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-surface-500 bg-surface-700 divide-y divide-surface-600 text-xs font-mono">
        <div className="flex gap-3 px-3 py-2">
          <span className="text-gray-500 w-20 shrink-0">SteamCMD</span>
          <span className="text-gray-300 break-all">{steamcmdPath}</span>
        </div>
        <div className="flex gap-3 px-3 py-2">
          <span className="text-gray-500 w-20 shrink-0">Dossier</span>
          <span className="text-gray-300 break-all">{serverDir}</span>
        </div>
        <div className="flex gap-3 px-3 py-2">
          <span className="text-gray-500 w-20 shrink-0">App ID</span>
          <span className="text-gray-300">258550 (Rust Dedicated Server)</span>
        </div>
      </div>

      {!progress || progress.status === "idle" ? (
        <div className="space-y-3">
          <button
            className="btn-primary w-full justify-center py-3 text-base"
            onClick={handleInstall}
            disabled={working}
          >
            {working ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
            {working ? "Démarrage…" : "Lancer l'installation"}
          </button>
          <button className="btn-secondary w-full justify-center" onClick={() => goTo(2)}>
            Retour
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-medium">
              {progress.status === "done" ? "Installation terminée !" :
               progress.status === "error" ? "Erreur d'installation" :
               "Installation en cours…"}
            </span>
            <span>{progress.percent}%</span>
          </div>
          <ProgressBar percent={progress.percent} status={progress.status} />

          {/* Log output */}
          <div
            ref={logRef}
            className="bg-surface-900 rounded-lg border border-surface-600 h-64 overflow-y-auto p-3 font-mono text-xs text-gray-400 space-y-0.5"
          >
            {(progress.log || []).map((line, i) => (
              <div key={i} className={
                line.startsWith("─") ? "text-surface-500" :
                line.toLowerCase().includes("error") || line.toLowerCase().includes("erreur") ? "text-red-400" :
                line.toLowerCase().includes("success") || line.toLowerCase().includes("terminé") ? "text-green-400" :
                "text-gray-400"
              }>
                {line || " "}
              </div>
            ))}
            {(progress.status === "installing") && (
              <div className="flex items-center gap-1.5 text-rust-400">
                <RefreshCw size={10} className="animate-spin" />
                <span>En cours…</span>
              </div>
            )}
          </div>

          {progress.status === "error" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Erreur</div>
                <div className="text-xs mt-0.5 text-red-400">{progress.error}</div>
              </div>
            </div>
          )}

          {progress.status === "error" && (
            <button
              className="btn-secondary w-full justify-center"
              onClick={() => { setProgress(null); setWorking(false); }}
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderStep4 = () => {
    const sep = status?.platform === "win32" ? "\\" : "/";
    const exeName = status?.platform === "win32" ? "RustDedicated.exe" : "RustDedicated";
    const execPath = serverDir.replace(/[/\\]$/, "") + sep + exeName;

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-900/40 border border-green-700 flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} className="text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">Installation réussie !</h3>
            <p className="text-sm text-gray-400">Le serveur Rust a été téléchargé avec succès.</p>
          </div>
        </div>

        <div className="rounded-lg border border-green-800/50 bg-green-900/15 p-4 space-y-3">
          <div className="text-xs font-medium text-green-400 uppercase tracking-wide">Récapitulatif</div>
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-gray-500 w-28 shrink-0">Exécutable :</span>
              <span className="font-mono text-xs text-gray-300 break-all">{execPath}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 w-28 shrink-0">Dossier serveur :</span>
              <span className="font-mono text-xs text-gray-300 break-all">{serverDir}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Cliquez sur <strong className="text-gray-200">Configurer automatiquement</strong> pour que l'application utilise ce serveur.
          </p>
          <button
            className="btn-primary w-full justify-center py-3"
            onClick={handleSaveConfig}
            disabled={configSaved}
          >
            {configSaved ? <CheckCircle2 size={15} /> : <Wrench size={15} />}
            {configSaved ? "Configuration sauvegardée !" : "Configurer automatiquement"}
          </button>
          {configSaved && (
            <p className="text-xs text-center text-green-400">
              Rendez-vous dans <strong>Server Settings</strong> pour personnaliser votre serveur, puis démarrez-le depuis le Dashboard.
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Installer le serveur Rust</h2>
        <p className="text-sm text-gray-500 mt-0.5">Téléchargement via SteamCMD (App ID 258550)</p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} maxReached={maxReached} />

      {/* Step card */}
      <div className="card">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>

      {/* Existing server info */}
      {step === 1 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-rust-400" />
            <span className="text-sm font-medium text-gray-300">Serveur déjà installé ?</span>
          </div>
          <p className="text-xs text-gray-500">
            Si vous avez déjà un serveur Rust installé, allez directement dans{" "}
            <strong className="text-gray-400">Server Settings → Advanced</strong> pour renseigner le chemin de l'exécutable.
          </p>
        </div>
      )}
    </div>
  );
}
