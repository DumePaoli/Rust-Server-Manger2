import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { MessageCircle, Search, Trash2, RefreshCw, Wifi } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString("fr-FR");
}

const COLORS = [
  "text-blue-400", "text-green-400", "text-purple-400",
  "text-yellow-400", "text-pink-400", "text-cyan-400", "text-orange-400",
];
const _colorCache = {};
function nameColor(name) {
  if (!_colorCache[name]) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    _colorCache[name] = COLORS[h % COLORS.length];
  }
  return _colorCache[name];
}

export default function ChatLogPage() {
  const [lines, setLines]   = useState([]);
  const [search, setSearch] = useState("");
  const [live, setLive]     = useState(true);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const prevCount = useRef(0);

  const load = useCallback(async (q = "") => {
    try {
      const { data } = await axios.get(`${BASE}/api/chat/log`, {
        params: { search: q, limit: 200 },
      });
      setLines(data);
    } catch {}
  }, []);

  useEffect(() => {
    load(search);
  }, [search, load]);

  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => load(search), 3000);
    return () => clearInterval(iv);
  }, [live, search, load]);

  useEffect(() => {
    if (lines.length > prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCount.current = lines.length;
  }, [lines.length]);

  const handleClear = async () => {
    if (!confirm("Effacer l'historique du chat ?")) return;
    await axios.delete(`${BASE}/api/chat/log`);
    setLines([]);
  };

  return (
    <div className="p-6 max-w-3xl flex flex-col space-y-5" style={{ height: "calc(100vh - 2rem)" }}>
      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <MessageCircle size={18} className="text-rust-400" /> Logs du chat
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Messages des joueurs détectés dans la console</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive(l => !l)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              live
                ? "bg-green-900/30 border-green-800 text-green-400"
                : "bg-surface-600 border-surface-500 text-gray-400 hover:text-gray-200"
            }`}
          >
            <Wifi size={11} className={live ? "animate-pulse" : ""} />
            {live ? "Live" : "Pause"}
          </button>
          <button onClick={handleClear} className="btn-secondary text-xs py-1.5">
            <Trash2 size={12} /> Effacer
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-9 text-sm"
          placeholder="Filtrer par joueur ou message…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 card p-0 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 bg-surface-900/50">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <MessageCircle size={28} className="text-gray-700 mb-3" />
              <div className="text-sm text-gray-500">
                {search ? "Aucun message trouvé." : "Aucun message de chat capturé."}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Le serveur doit tourner et des joueurs envoyer des messages.
              </div>
            </div>
          ) : (
            lines.map((l, i) => (
              <div key={i} className="flex items-start gap-2.5 group hover:bg-surface-800/40 px-2 py-1 rounded-lg transition-colors">
                <span className="text-[10px] text-gray-600 font-mono shrink-0 mt-0.5 tabular-nums w-14">
                  {fmtTime(l.ts)}
                </span>
                <span className={`text-sm font-semibold shrink-0 ${nameColor(l.name)}`}>
                  {l.name}
                  {l.steamid && (
                    <span className="font-normal text-[10px] text-gray-600 ml-1.5 font-mono">
                      [{l.steamid}]
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-300 min-w-0 break-words">
                  {l.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        <div className="px-4 py-2 border-t border-surface-600 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {lines.length} message{lines.length !== 1 ? "s" : ""}
          </span>
          {live && (
            <span className="flex items-center gap-1.5 text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Mise à jour automatique
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
