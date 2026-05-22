import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Shield, Users, RefreshCw, AlertCircle, Plus, X,
  ChevronDown, ChevronRight, Check, Trash2,
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

function Flash({ msg }) {
  if (!msg) return null;
  return (
    <div className={`rounded-lg px-3 py-2 text-xs font-medium border flex items-center gap-2 ${
      msg.ok ? "bg-green-900/40 border-green-800 text-green-300" : "bg-red-900/40 border-red-800 text-red-300"
    }`}>
      {msg.ok ? <Check size={12} /> : <AlertCircle size={12} />} {msg.text}
    </div>
  );
}

function ErrorCard({ error }) {
  return (
    <div className="card flex items-start gap-3">
      <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-medium text-yellow-300">Données indisponibles</div>
        <div className="text-xs text-gray-500 mt-1">{error}</div>
      </div>
    </div>
  );
}

// ── Groups tab ────────────────────────────────────────────────────────────

function GroupCard({ name, info, onCmd, onReload }) {
  const [open, setOpen] = useState(false);
  const [newPerm, setNewPerm] = useState("");
  const [newUser, setNewUser] = useState("");
  const [busy, setBusy] = useState(false);

  const cmd = async (command) => {
    setBusy(true);
    await onCmd(command);
    setBusy(false);
    setTimeout(onReload, 1200);
  };

  const grantPerm = async () => {
    if (!newPerm.trim()) return;
    await cmd(`oxide.grant group ${name} ${newPerm.trim()}`);
    setNewPerm("");
  };

  const revokePerm = (perm) => cmd(`oxide.revoke group ${name} ${perm}`);

  const addUser = async () => {
    if (!newUser.trim()) return;
    await cmd(`oxide.addgroup ${newUser.trim()} ${name}`);
    setNewUser("");
  };

  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-600/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-rust-600/20 flex items-center justify-center shrink-0">
          <Shield size={14} className="text-rust-400" />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">{name}</span>
            {info.title !== name && <span className="text-xs text-gray-500">{info.title}</span>}
            <span className="text-xs font-mono bg-surface-600 text-gray-400 px-1.5 py-0.5 rounded">
              rang {info.rank}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {info.perms.length} permission{info.perms.length !== 1 ? "s" : ""}
          </div>
        </div>
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-600">
          {/* Permissions */}
          <div className="pt-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Permissions</div>
            {info.perms.length === 0 ? (
              <div className="text-xs text-gray-600 italic">Aucune permission</div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {info.perms.map(p => (
                  <span key={p} className="inline-flex items-center gap-1 text-xs font-mono bg-surface-700 border border-surface-500 text-gray-300 px-2 py-0.5 rounded-lg">
                    {p}
                    <button onClick={() => revokePerm(p)} disabled={busy}
                      className="text-gray-600 hover:text-red-400 transition-colors ml-0.5">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input className="input text-xs py-1.5 font-mono flex-1" placeholder="plugin.permission"
                value={newPerm} onChange={e => setNewPerm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && grantPerm()} />
              <button onClick={grantPerm} disabled={busy || !newPerm.trim()} className="btn-primary text-xs py-1.5 px-3">
                <Plus size={11} /> Accorder
              </button>
            </div>
          </div>

          {/* Add user to group */}
          <div className="border-t border-surface-600 pt-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ajouter un joueur</div>
            <div className="flex gap-2">
              <input className="input text-xs py-1.5 font-mono flex-1" placeholder="SteamID64"
                value={newUser} onChange={e => setNewUser(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addUser()} />
              <button onClick={addUser} disabled={busy || !newUser.trim()} className="btn-secondary text-xs py-1.5 px-3">
                <Plus size={11} /> Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────

function UserCard({ steamid, info, groups, onCmd, onReload }) {
  const [open, setOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [newPerm, setNewPerm]   = useState("");
  const [busy, setBusy] = useState(false);

  const cmd = async (command) => {
    setBusy(true);
    await onCmd(command);
    setBusy(false);
    setTimeout(onReload, 1200);
  };

  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-600/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-surface-600 flex items-center justify-center shrink-0 text-xs font-bold text-gray-400">
          {info.name[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-200">{info.name}</span>
            <span className="font-mono text-xs text-gray-600">{steamid}</span>
          </div>
          <div className="flex gap-1.5 mt-0.5 flex-wrap">
            {info.groups.map(g => (
              <span key={g} className="text-[10px] font-medium bg-rust-600/20 text-rust-400 px-1.5 py-0.5 rounded">
                {g}
              </span>
            ))}
          </div>
        </div>
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-600">
          {/* Groups */}
          <div className="pt-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Groupes</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {info.groups.map(g => (
                <span key={g} className="inline-flex items-center gap-1 text-xs font-mono bg-surface-700 border border-surface-500 text-gray-300 px-2 py-0.5 rounded-lg">
                  {g}
                  <button onClick={() => cmd(`oxide.removegroup ${steamid} ${g}`)} disabled={busy}
                    className="text-gray-600 hover:text-red-400 transition-colors ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {info.groups.length === 0 && <span className="text-xs text-gray-600 italic">Aucun groupe</span>}
            </div>
            <div className="flex gap-2">
              <select className="input text-xs py-1.5 flex-1"
                value={newGroup} onChange={e => setNewGroup(e.target.value)}>
                <option value="">— Choisir un groupe —</option>
                {(groups || []).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button
                onClick={() => { if (newGroup) { cmd(`oxide.addgroup ${steamid} ${newGroup}`); setNewGroup(""); } }}
                disabled={busy || !newGroup} className="btn-secondary text-xs py-1.5 px-3">
                <Plus size={11} /> Ajouter
              </button>
            </div>
          </div>

          {/* Perms */}
          <div className="border-t border-surface-600 pt-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Permissions directes</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {info.perms.map(p => (
                <span key={p} className="inline-flex items-center gap-1 text-xs font-mono bg-surface-700 border border-surface-500 text-gray-300 px-2 py-0.5 rounded-lg">
                  {p}
                  <button onClick={() => cmd(`oxide.revoke user ${steamid} ${p}`)} disabled={busy}
                    className="text-gray-600 hover:text-red-400 transition-colors ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {info.perms.length === 0 && <span className="text-xs text-gray-600 italic">Aucune</span>}
            </div>
            <div className="flex gap-2">
              <input className="input text-xs py-1.5 font-mono flex-1" placeholder="plugin.permission"
                value={newPerm} onChange={e => setNewPerm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && newPerm.trim() && cmd(`oxide.grant user ${steamid} ${newPerm.trim()}`)} />
              <button
                onClick={() => { if (newPerm.trim()) { cmd(`oxide.grant user ${steamid} ${newPerm.trim()}`); setNewPerm(""); } }}
                disabled={busy || !newPerm.trim()} className="btn-primary text-xs py-1.5 px-3">
                <Plus size={11} /> Accorder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function OxidePage() {
  const [tab, setTab]         = useState("groups");
  const [groupsData, setGroupsData] = useState(null);
  const [usersData, setUsersData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [flash, setFlash]     = useState(null);

  const showFlash = (ok, text) => { setFlash({ ok, text }); setTimeout(() => setFlash(null), 3000); };

  const loadGroups = useCallback(async () => {
    try { const { data } = await axios.get(`${BASE}/api/oxide/groups`); setGroupsData(data); }
    catch { }
  }, []);

  const loadUsers = useCallback(async () => {
    try { const { data } = await axios.get(`${BASE}/api/oxide/users`); setUsersData(data); }
    catch { }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadGroups(), loadUsers()]);
    setLoading(false);
  }, [loadGroups, loadUsers]);

  useEffect(() => { load(); }, [load]);

  const sendCmd = async (command) => {
    try {
      await axios.post(`${BASE}/api/oxide/cmd`, { command });
    } catch {
      showFlash(false, "Erreur — le serveur doit être en cours d'exécution.");
    }
  };

  const groupNames = groupsData?.groups ? Object.keys(groupsData.groups) : [];

  const filteredUsers = usersData?.users
    ? Object.entries(usersData.users).filter(([sid, u]) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return sid.includes(s) || u.name.toLowerCase().includes(s);
      })
    : [];

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Shield size={18} className="text-rust-400" /> Permissions Oxide
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Groupes, permissions et joueurs</p>
        </div>
        <button onClick={load} className="btn-secondary text-xs py-1.5">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      <Flash msg={flash} />

      <div className="flex gap-1 border-b border-surface-600 pb-1">
        <TabBtn active={tab === "groups"} onClick={() => setTab("groups")}>
          <Shield size={13} className="inline mr-1.5" />Groupes ({groupNames.length})
        </TabBtn>
        <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
          <Users size={13} className="inline mr-1.5" />
          Joueurs ({usersData?.users ? Object.keys(usersData.users).length : 0})
        </TabBtn>
      </div>

      {/* Server must be running notice */}
      <div className="text-xs text-gray-600 bg-surface-800 border border-surface-600 rounded-lg px-3 py-2">
        Les modifications sont envoyées via la console. Le serveur doit être <strong className="text-gray-400">en cours d'exécution</strong>.
        Les données sont lues depuis les fichiers Oxide et se raffraîchissent après 1-2s.
      </div>

      {tab === "groups" && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-10"><RefreshCw size={18} className="animate-spin text-gray-500" /></div>
          ) : groupsData?.error ? (
            <ErrorCard error={groupsData.error} />
          ) : groupNames.length === 0 ? (
            <div className="card text-center py-8 text-gray-500 text-sm">Aucun groupe trouvé.</div>
          ) : (
            groupNames.map(name => (
              <GroupCard
                key={name}
                name={name}
                info={groupsData.groups[name]}
                onCmd={sendCmd}
                onReload={loadGroups}
              />
            ))
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-3">
          <div className="relative">
            <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-9 text-sm" placeholder="Rechercher par nom ou SteamID…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><RefreshCw size={18} className="animate-spin text-gray-500" /></div>
          ) : usersData?.error ? (
            <ErrorCard error={usersData.error} />
          ) : filteredUsers.length === 0 ? (
            <div className="card text-center py-8 text-gray-500 text-sm">
              {search ? "Aucun joueur trouvé." : "Aucun joueur dans oxide.users.data."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(([sid, u]) => (
                <UserCard
                  key={sid}
                  steamid={sid}
                  info={u}
                  groups={groupNames}
                  onCmd={sendCmd}
                  onReload={loadUsers}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
