import { useState, useEffect } from "react";
import axios from "axios";
import { Check, ExternalLink, RefreshCw, Palette, Globe, Info } from "lucide-react";
import { useSettings, THEME_META } from "../contexts/SettingsContext";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-surface-500">
        <Icon size={16} className="text-rust-400" />
        <h3 className="font-semibold text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function AppSettings() {
  const { theme, setTheme, lang, setLang } = useSettings();
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    axios.get(`${BASE}/api/update/check`).then(r => setUpdateInfo(r.data)).catch(() => {});
  }, []);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const { data } = await axios.get(`${BASE}/api/update/check?force=true`);
      setUpdateInfo(data);
    } catch {}
    setChecking(false);
  };

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Réglages</h2>
        <p className="text-sm text-gray-500 mt-0.5">Personnalisez l'apparence et la langue</p>
      </div>

      {/* Couleur d'accent */}
      <Section icon={Palette} title="Thème de couleur">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {THEME_META.map(m => (
            <button
              key={m.key}
              onClick={() => setTheme(m.key)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                theme === m.key
                  ? "border-rust-500 bg-rust-500/10"
                  : "border-surface-500 hover:border-surface-400 bg-surface-700"
              }`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shadow-md"
                style={{ backgroundColor: m.swatch }}
              >
                {theme === m.key && <Check size={14} className="text-white" />}
              </div>
              <span className="text-xs text-gray-300 font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Langue */}
      <Section icon={Globe} title="Langue">
        <div className="flex gap-3">
          {[
            { key: "fr", label: "Français", flag: "🇫🇷" },
            { key: "en", label: "English",  flag: "🇬🇧" },
          ].map(l => (
            <button
              key={l.key}
              onClick={() => setLang(l.key)}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 transition-all ${
                lang === l.key
                  ? "border-rust-500 bg-rust-500/10 text-rust-300"
                  : "border-surface-500 hover:border-surface-400 bg-surface-700 text-gray-300"
              }`}
            >
              <span className="text-xl">{l.flag}</span>
              <span className="text-sm font-medium">{l.label}</span>
              {lang === l.key && <Check size={13} className="ml-1 text-rust-400" />}
            </button>
          ))}
        </div>
      </Section>

      {/* À propos */}
      <Section icon={Info} title="À propos">
        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Version actuelle</span>
            <span className="font-mono text-gray-200">{updateInfo?.current_version ?? "—"}</span>
          </div>
          {updateInfo?.available && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Mise à jour disponible</span>
              <span className="font-mono text-rust-400 font-semibold">v{updateInfo.latest_version}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Backend</span>
            <span className="font-mono text-gray-400 text-xs">Python / FastAPI</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Frontend</span>
            <span className="font-mono text-gray-400 text-xs">React + Vite + Tailwind</span>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={checkUpdate}
            disabled={checking}
            className="btn-secondary text-xs py-1.5"
          >
            {checking ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Vérifier les mises à jour
          </button>
          <a
            href="https://github.com/dumepaoli/rust-server-manger2"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-xs py-1.5"
          >
            <ExternalLink size={12} />
            GitHub
          </a>
        </div>

        {updateInfo && !updateInfo.available && !checking && (
          <p className="text-xs text-green-400 flex items-center gap-1.5">
            <Check size={12} /> Vous utilisez la dernière version.
          </p>
        )}
      </Section>
    </div>
  );
}
