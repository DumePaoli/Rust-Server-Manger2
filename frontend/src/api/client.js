import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE });

export const getStatus = () => api.get("/api/status").then((r) => r.data);
export const startServer = () => api.post("/api/start").then((r) => r.data);
export const stopServer = () => api.post("/api/stop").then((r) => r.data);
export const restartServer = () => api.post("/api/restart").then((r) => r.data);
export const getConfig = () => api.get("/api/config").then((r) => r.data);
export const saveConfig = (data) => api.put("/api/config", { data }).then((r) => r.data);
export const getConsoleLog = () => api.get("/api/console/log").then((r) => r.data);
export const sendCommand = (command) =>
  api.post("/api/console/command", { command }).then((r) => r.data);

export const WS_URL = BASE.replace(/^http/, "ws") + "/ws/console";
