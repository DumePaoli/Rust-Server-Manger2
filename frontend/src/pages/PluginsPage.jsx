import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Package, Search, Download, RefreshCw, Trash2,
  RotateCcw, AlertCircle, Check, X, ExternalLink,
  ChevronLeft, ChevronRight, ArrowUpCircle, Layers,
  ShoppingCart, KeyRound, Eye, EyeOff,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "bg-rust-600/20 text-rust-400" : "text-gray-400 hover:text-gray-200 hover:bg-surface-600"
      }`}
    >
      {children}
    </button>
  );
}

function StatusMsg({ msg }) {
  if (!msg) return null;
  return (
    <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border flex items-center gap-2 ${
      msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"
    }`}>
      {msg.ok ? <Check size={14} /> : <X size={14} />} {msg.text}
    </div>
  );
}

// ── Installed tab ────────────────────────────────────────────────────────

function InstalledTab({ msg, setMsg }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState({});
  const [updates, setUpdates] = useState({});
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await axios.get(`${BASE}/api/plugins/installed`);
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleReload = async (name) => {
    setWorking(w => ({ ...w, [name]: "reload" }));
    try {
      await axios.post(`${BASE}/api/plugins/${name}/reload`);
      flash(true, `${name} rechargé.`);
    } catch { flash(false, "Erreur lors du rechargement."); }
    setWorking(w => ({ ...w, [name]: null }));
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const { data: r } = await axios.get(`${BASE}/api/plugins/updates`);
      const map = {};
      for (const u of r.updates ?? []) map[u.name] = u;
      setUpdates(map);
      if ((r.updates ?? []).length === 0) flash(true, "Tous les plugins sont à jour.");
      else flash(false, `${r.updates.length} mise(s) à jour disponible(s).`);
    } catch { flash(false, "Impossible de vérifier les mises à jour."); }
    setChecking(false);
  };

  const handleUpdate = async (name) => {
    setWorking(w => ({ ...w, [name]: "update" }));
    try {
      const { data: r } = await axios.post(`${BASE}/api/plugins/${name}/update`);
      if (r.success) {
        flash(true, r.message);
        setUpdates(u => { const c = { ...u }; delete c[name]; return c; });
        load();
      } else flash(false, r.message);
    } catch { flash(false, "Erreur lors de la mise à jour."); }
    setWorking(w => ({ ...w, [name]: null }));
  };

  const handleRemove = async (name) => {
    if (!confirm(`Supprimer le plugin ${name} ?`)) return;
    setWorking(w => ({ ...w, [name]: "remove" }));
    try {
      const { data: r } = await axios.delete(`${BASE}/api/plugins/${name}`);
      if (r.success) { flash(true, r.message); load(); }
      else flash(false, r.message);
    } catch { flash(false, "Erreur."); }
    setWorking(w => ({ ...w, [name]: null }));
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>;

  if (data?.error) return (
    <div className="card flex items-start gap-3">
      <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-medium text-yellow-300">Configuration manquante</div>
        <div className="text-xs text-gray-400 mt-1">{data.error}</div>
        <div className="text-xs text-gray-500 mt-2">
          Configurez le <strong className="text-gray-400">Server Data Path</strong> dans <em>Server Settings → Advanced</em>.
        </div>
      </div>
    </div>
  );

  const { plugins = [], plugins_dir } = data;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600 font-mono truncate">{plugins_dir}</div>
        <div className="flex gap-2">
          <button onClick={checkUpdates} disabled={checking} className="btn-secondary text-xs py-1.5">
            {checking ? <RefreshCw size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />}
            {checking ? "Vérification…" : "Vérifier MAJ"}
          </button>
          <button onClick={load} className="btn-secondary text-xs py-1.5">
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>
      </div>

      {plugins.length === 0 ? (
        <div className="card flex flex-col items-center py-10 text-center">
          <Package size={28} className="text-gray-600 mb-3" />
          <div className="text-gray-400 font-medium">Aucun plugin installé</div>
          <div className="text-sm text-gray-600 mt-1">Utilisez l'onglet Recherche pour installer des plugins uMod.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {plugins.map(p => (
            <div key={p.name} className="card flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-lg bg-surface-600 flex items-center justify-center shrink-0">
                <Package size={16} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-200">{p.name}</span>
                  {p.version && <span className="text-xs text-gray-500 font-mono">v{p.version}</span>}
                  {updates[p.name] && (
                    <span className="text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">
                      v{updates[p.name].latest_version} dispo
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600">{p.filename}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {updates[p.name] && (
                  <button
                    onClick={() => handleUpdate(p.name)}
                    disabled={!!working[p.name]}
                    className="btn-primary text-xs py-1.5 px-2.5"
                    title="Mettre à jour"
                  >
                    {working[p.name] === "update" ? <RefreshCw size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />}
                    MAJ
                  </button>
                )}
                <button
                  onClick={() => handleReload(p.name)}
                  disabled={!!working[p.name]}
                  className="btn-secondary text-xs py-1.5 px-2.5"
                  title="Recharger le plugin (oxide.reload)"
                >
                  {working[p.name] === "reload" ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Reload
                </button>
                <button
                  onClick={() => handleRemove(p.name)}
                  disabled={!!working[p.name]}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                  title="Supprimer"
                >
                  {working[p.name] === "remove" ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Search tab ───────────────────────────────────────────────────────────

function SearchTab({ msg, setMsg }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState({});

  const doSearch = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/api/plugins/search`, { params: { q, page: p } });
      setResults(data);
    } catch { setResults({ error: "Impossible de contacter uMod.", data: [] }); }
    setLoading(false);
  }, []);

  useEffect(() => { doSearch("", 1); }, [doSearch]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    doSearch(query, 1);
  };

  const handlePage = (p) => {
    setPage(p);
    doSearch(query, p);
  };

  const handleInstall = async (plugin) => {
    const url = plugin.download_url;
    const name = plugin.name;
    if (!url) { setMsg({ ok: false, text: "URL de téléchargement introuvable." }); return; }
    setInstalling(s => ({ ...s, [name]: true }));
    try {
      const { data: r } = await axios.post(`${BASE}/api/plugins/install`, { download_url: url, name });
      setMsg(r.success ? { ok: true, text: r.message } : { ok: false, text: r.message });
    } catch { setMsg({ ok: false, text: "Erreur lors de l'installation." }); }
    setInstalling(s => ({ ...s, [name]: false }));
    setTimeout(() => setMsg(null), 4000);
  };

  const plugins = results?.data ?? [];
  const lastPage = results?.last_page ?? 1;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-9 pr-24"
          placeholder="Rechercher un plugin uMod..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary text-xs py-1.5 px-3">
          {loading ? <RefreshCw size={12} className="animate-spin" /> : "Rechercher"}
        </button>
      </form>

      {results?.error && (
        <div className="card flex items-center gap-2 text-sm text-red-300">
          <AlertCircle size={15} /> {results.error}
        </div>
      )}

      {loading && !results && (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      )}

      {plugins.length > 0 && (
        <div className="space-y-2">
          {plugins.map(p => (
            <div key={p.name} className="card flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-lg bg-surface-600 flex items-center justify-center shrink-0 overflow-hidden">
                {p.icon_url
                  ? <img src={p.icon_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = "none"; }} />
                  : <Package size={16} className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-200">{p.title ?? p.name}</span>
                  {p.version_formatted && <span className="text-xs text-gray-500 font-mono">v{p.version_formatted}</span>}
                  {p.downloads && <span className="text-xs text-gray-600">{Number(p.downloads).toLocaleString()} téléch.</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.description}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-600 transition-colors">
                    <ExternalLink size={13} />
                  </a>
                )}
                <button
                  onClick={() => handleInstall(p)}
                  disabled={installing[p.name] || !p.download_url}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  {installing[p.name] ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                  Installer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => handlePage(Math.max(1, page - 1))} disabled={page <= 1}
            className="btn-secondary p-1.5 disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-gray-400">Page {page} / {lastPage}</span>
          <button onClick={() => handlePage(Math.min(lastPage, page + 1))} disabled={page >= lastPage}
            className="btn-secondary p-1.5 disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Frameworks tab ───────────────────────────────────────────────────────

const FRAMEWORK_META = {
  carbon: {
    label: "Carbon",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/30",
    description: "Framework de modding haute performance pour Rust. Remplace Oxide avec de meilleures performances et une compatibilité Harmony.",
    url: "https://carbonmod.gg",
  },
  oxide: {
    label: "Oxide / uMod",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
    description: "Framework de modding historique pour Rust. Compatible avec la grande majorité des plugins uMod disponibles.",
    url: "https://umod.org",
  },
};

function FrameworkCard({ name, info, onInstall, installing }) {
  const meta = FRAMEWORK_META[name];
  return (
    <div className={`card border ${meta.bg} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-surface-600 flex items-center justify-center shrink-0">
            <Layers size={18} className={meta.color} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
              {info?.installed && (
                <span className="text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded">
                  Installé
                </span>
              )}
            </div>
            {info?.latest_version && (
              <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                {info.installed ? "Dernière version:" : "Disponible:"} {info.latest_version}
              </div>
            )}
          </div>
        </div>
        <a href={meta.url} target="_blank" rel="noreferrer"
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-600 transition-colors shrink-0">
          <ExternalLink size={13} />
        </a>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">{meta.description}</p>

      <button
        onClick={() => onInstall(name)}
        disabled={installing}
        className="btn-primary text-xs py-2 w-full justify-center"
      >
        {installing
          ? <><RefreshCw size={12} className="animate-spin" /> Installation en cours…</>
          : info?.installed
            ? <><ArrowUpCircle size={12} /> Réinstaller / Mettre à jour</>
            : <><Download size={12} /> Installer {meta.label}</>
        }
      </button>
    </div>
  );
}

function FrameworksTab({ msg, setMsg }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await axios.get(`${BASE}/api/frameworks`);
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const handleInstall = async (name) => {
    setInstalling(s => ({ ...s, [name]: true }));
    try {
      const { data: r } = await axios.post(`${BASE}/api/frameworks/${name}/install`);
      flash(r.success, r.message);
      if (r.success) load();
    } catch (err) {
      flash(false, err?.response?.data?.detail || "Erreur lors de l'installation.");
    }
    setInstalling(s => ({ ...s, [name]: false }));
  };

  if (loading) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>;

  const noDir = data && !data.carbon?.server_dir && !data.oxide?.server_dir;

  return (
    <div className="space-y-4">
      {noDir && (
        <div className="card flex items-start gap-3">
          <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-yellow-300">Exécutable serveur non configuré</div>
            <div className="text-xs text-gray-400 mt-1">
              Configurez le <strong className="text-gray-300">Server Executable</strong> dans <em>Server Settings → Advanced</em> pour que le framework soit extrait au bon endroit.
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 leading-relaxed">
        Les frameworks sont extraits dans le dossier de l'exécutable serveur ({data?.carbon?.server_dir
          ? <span className="font-mono text-gray-400">{data.carbon.server_dir}</span>
          : <em>non configuré</em>
        }). Arrêtez le serveur avant d'installer.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {["carbon", "oxide"].map(name => (
          <FrameworkCard
            key={name}
            name={name}
            info={data?.[name]}
            onInstall={handleInstall}
            installing={!!installing[name]}
          />
        ))}
      </div>

      <div className="text-xs text-gray-600 text-center">
        N'installez pas Carbon et Oxide simultanément sur le même serveur.
      </div>
    </div>
  );
}

// ── CodeFling tab ────────────────────────────────────────────────────────

function CodeFlingTab({ msg, setMsg }) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // {has_key, masked}
  const [savingKey, setSavingKey] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState({});

  const loadKeyStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/codefling/config`);
      setKeyStatus(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadKeyStatus(); }, [loadKeyStatus]);

  const saveKey = async (e) => {
    e.preventDefault();
    setSavingKey(true);
    try {
      await axios.put(`${BASE}/api/codefling/config`, { api_key: apiKey });
      setApiKey("");
      setShowKey(false);
      await loadKeyStatus();
      setMsg({ ok: true, text: "Clé API CodeFling enregistrée." });
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ ok: false, text: "Impossible d'enregistrer la clé." });
      setTimeout(() => setMsg(null), 3000);
    }
    setSavingKey(false);
  };

  const doSearch = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/api/codefling/search`, { params: { q, page: p } });
      setResults(data);
    } catch {
      setResults({ error: "Impossible de contacter CodeFling.", results: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (keyStatus?.has_key) doSearch("", 1);
  }, [keyStatus, doSearch]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    doSearch(query, 1);
  };

  const handlePage = (p) => {
    setPage(p);
    doSearch(query, p);
  };

  const handleInstall = async (plugin) => {
    const id = plugin.id;
    const name = (plugin.title || `codefling_${id}`).replace(/[^a-zA-Z0-9_-]/g, "_");
    setInstalling(s => ({ ...s, [id]: true }));
    try {
      const { data: r } = await axios.post(`${BASE}/api/codefling/install`, { plugin_id: id, name });
      setMsg(r.success ? { ok: true, text: r.message } : { ok: false, text: r.message });
    } catch {
      setMsg({ ok: false, text: "Erreur lors de l'installation." });
    }
    setInstalling(s => ({ ...s, [id]: false }));
    setTimeout(() => setMsg(null), 4000);
  };

  const plugins = results?.results ?? [];
  const totalPages = results?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* API key section */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={15} className="text-rust-400" />
          <span className="text-sm font-medium text-gray-200">Clé API CodeFling</span>
          {keyStatus?.has_key && (
            <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded">
              Configurée
            </span>
          )}
        </div>
        {keyStatus?.has_key && (
          <div className="text-xs text-gray-500 font-mono">{keyStatus.api_key}</div>
        )}
        <form onSubmit={saveKey} className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? "text" : "password"}
              className="input pr-9 text-sm font-mono"
              placeholder={keyStatus?.has_key ? "Nouvelle clé (remplace l'actuelle)" : "Entrez votre clé API CodeFling…"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button type="submit" disabled={!apiKey.trim() || savingKey} className="btn-primary text-xs py-1.5 px-3">
            {savingKey ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
            Enregistrer
          </button>
        </form>
        <p className="text-xs text-gray-600">
          Créez une clé API sur{" "}
          <a href="https://codefling.com/account/settings" target="_blank" rel="noreferrer" className="text-rust-400 hover:underline">
            codefling.com → Account → API Access
          </a>
        </p>
      </div>

      {!keyStatus?.has_key ? (
        <div className="card flex flex-col items-center py-10 text-center">
          <ShoppingCart size={28} className="text-gray-600 mb-3" />
          <div className="text-gray-400 font-medium">Clé API requise</div>
          <div className="text-sm text-gray-600 mt-1">Configurez votre clé API CodeFling ci-dessus pour rechercher des plugins.</div>
        </div>
      ) : (
        <>
          <form onSubmit={handleSearch} className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9 pr-24"
              placeholder="Rechercher un plugin CodeFling..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary text-xs py-1.5 px-3">
              {loading ? <RefreshCw size={12} className="animate-spin" /> : "Rechercher"}
            </button>
          </form>

          {results?.error && (
            <div className="card flex items-center gap-2 text-sm text-red-300">
              <AlertCircle size={15} /> {results.error}
            </div>
          )}

          {loading && !results && (
            <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
          )}

          {plugins.length > 0 && (
            <div className="space-y-2">
              {plugins.map(p => (
                <div key={p.id} className="card flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-600 flex items-center justify-center shrink-0 overflow-hidden">
                    {p.primaryScreenshot?.url
                      ? <img src={p.primaryScreenshot.url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = "none"; }} />
                      : <ShoppingCart size={15} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-200">{p.title}</span>
                      {p.version && <span className="text-xs text-gray-500 font-mono">v{p.version}</span>}
                      {p.price && parseFloat(p.price) > 0
                        ? <span className="text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded">€{p.price}</span>
                        : <span className="text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded">Gratuit</span>
                      }
                      {p.downloads != null && <span className="text-xs text-gray-600">{Number(p.downloads).toLocaleString()} téléch.</span>}
                    </div>
                    {p.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-600 transition-colors">
                        <ExternalLink size={13} />
                      </a>
                    )}
                    <button
                      onClick={() => handleInstall(p)}
                      disabled={!!installing[p.id]}
                      className="btn-primary text-xs py-1.5 px-3"
                    >
                      {installing[p.id] ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                      Installer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {plugins.length === 0 && results && !results.error && !loading && (
            <div className="card flex flex-col items-center py-10 text-center">
              <Package size={28} className="text-gray-600 mb-3" />
              <div className="text-gray-400 font-medium">Aucun résultat</div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => handlePage(Math.max(1, page - 1))} disabled={page <= 1}
                className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-gray-400">Page {page} / {totalPages}</span>
              <button onClick={() => handlePage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function PluginsPage() {
  const [tab, setTab] = useState("frameworks");
  const [msg, setMsg] = useState(null);

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Plugins</h2>
        <p className="text-sm text-gray-500 mt-0.5">Gérez vos frameworks et plugins Oxide/Carbon</p>
      </div>

      <StatusMsg msg={msg} />

      <div className="flex gap-1 border-b border-surface-600 pb-1 flex-wrap">
        <TabBtn active={tab === "frameworks"} onClick={() => setTab("frameworks")}>
          Frameworks
        </TabBtn>
        <TabBtn active={tab === "installed"} onClick={() => setTab("installed")}>
          Installés
        </TabBtn>
        <TabBtn active={tab === "search"} onClick={() => setTab("search")}>
          uMod
        </TabBtn>
        <TabBtn active={tab === "codefling"} onClick={() => setTab("codefling")}>
          CodeFling
        </TabBtn>
      </div>

      {tab === "frameworks" && <FrameworksTab  msg={msg} setMsg={setMsg} />}
      {tab === "installed"  && <InstalledTab   msg={msg} setMsg={setMsg} />}
      {tab === "search"     && <SearchTab      msg={msg} setMsg={setMsg} />}
      {tab === "codefling"  && <CodeFlingTab   msg={msg} setMsg={setMsg} />}
    </div>
  );
}
