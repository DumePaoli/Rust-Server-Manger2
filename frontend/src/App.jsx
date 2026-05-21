import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import ConsolePage from "./pages/ConsolePage";
import ServerSettings from "./pages/ServerSettings";
import PluginsPage from "./pages/PluginsPage";
import PlayersPage from "./pages/PlayersPage";
import WipePage from "./pages/WipePage";
import InstallerPage from "./pages/InstallerPage";
import AppSettings from "./pages/AppSettings";

function ComingSoon({ title }) {
  return (
    <div className="p-6 flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-4xl mb-3">🚧</div>
        <div className="font-semibold text-gray-300">{title}</div>
        <div className="text-sm text-gray-500 mt-1">Coming in a future update</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex w-full min-h-screen bg-surface-900">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/console" element={<ConsolePage />} />
          <Route path="/settings" element={<ServerSettings />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/wipe" element={<WipePage />} />
          <Route path="/installer" element={<InstallerPage />} />
          <Route path="/app-settings" element={<AppSettings />} />
          <Route path="/messages" element={<ComingSoon title="Messages" />} />
          <Route path="/times" element={<ComingSoon title="Times" />} />
          <Route path="/discord" element={<ComingSoon title="Discord Integration" />} />
        </Routes>
      </main>
    </div>
  );
}
