import { useState, useEffect, useCallback } from "react";
import { getStatus } from "../api/client";

export function useServerStatus(intervalMs = 3000) {
  const [status, setStatus] = useState({
    running: false,
    pid: null,
    uptime_seconds: 0,
    cpu_percent: 0,
    memory_mb: 0,
    started_at: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getStatus();
      setStatus(data);
    } catch {
      setStatus((prev) => ({ ...prev, running: false }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { status, loading, refresh };
}
