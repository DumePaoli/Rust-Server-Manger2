import { useState } from "react";
import axios from "axios";
import { Download, X, ArrowUpCircle, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function UpdateModal({ info, onClose, onRecheck }) {
  const [state, setState] = useState("idle"); // idle | downloading | done | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const handleUpdate = async () => {
    setState("downloading");
    setProgress(0);

    try {
      await axios.post(`${BASE}/api/update/apply`);

      // Poll progress
      const interval = setInterval(async () => {
        try {
          const { data } = await axios.get(`${BASE}/api/update/progress`);
          setProgress(data.percent ?? 0);
          if (data.done) {
            clearInterval(interval);
            setState("done");
          }
          if (data.error) {
            clearInterval(interval);
            setErrorMsg(data.error);
            setState("error");
          }
        } catch {
          clearInterval(interval);
        }
      }, 400);
    } catch (e) {
      setErrorMsg(e?.response?.data?.message ?? "Erreur inconnue.");
      setState("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-700 border border-surface-500 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-500">
          <div className="flex items-center gap-3">
            <ArrowUpCircle size={20} className="text-rust-400" />
            <span className="font-semibold text-gray-100">Mise à jour disponible</span>
          </div>
          {state === "idle" && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Version badge */}
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">
              Version actuelle : <span className="font-mono text-gray-300">{info.current_version}</span>
            </div>
            <span className="text-gray-600">→</span>
            <div className="text-sm font-medium text-green-400 font-mono">{info.latest_version}</div>
          </div>

          {/* Changelog */}
          {info.changelog && (
            <div className="bg-surface-800 rounded-lg p-4 text-sm text-gray-400 max-h-48 overflow-y-auto border border-surface-500">
              <div className="font-medium text-gray-300 mb-2">Nouveautés :</div>
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">{info.changelog}</pre>
            </div>
          )}

          {/* Download progress */}
          {state === "downloading" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Téléchargement…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-surface-500 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rust-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done */}
          {state === "done" && (
            <div className="flex items-center gap-3 text-green-400 bg-green-900/30 rounded-lg p-3 border border-green-800">
              <CheckCircle2 size={18} />
              <span className="text-sm">Mise à jour appliquée — l'application redémarre…</span>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex items-start gap-3 text-red-400 bg-red-900/30 rounded-lg p-3 border border-red-800">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium mb-0.5">Erreur lors de la mise à jour</div>
                <div className="text-red-400/80 font-mono text-xs">{errorMsg}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {state === "idle" && (
          <div className="flex items-center justify-between p-5 border-t border-surface-500">
            {info.release_url ? (
              <a
                href={info.release_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ExternalLink size={12} />
                Voir sur GitHub
              </a>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button className="btn-secondary text-sm" onClick={onClose}>
                Plus tard
              </button>
              <button className="btn-primary text-sm" onClick={handleUpdate}>
                <Download size={14} />
                Mettre à jour
              </button>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="flex justify-end gap-2 p-5 border-t border-surface-500">
            <button className="btn-secondary text-sm" onClick={onClose}>
              Fermer
            </button>
            <button className="btn-primary text-sm" onClick={handleUpdate}>
              Réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
