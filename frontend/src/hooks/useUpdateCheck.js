import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function useUpdateCheck() {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (force = false) => {
    setChecking(true);
    try {
      const { data } = await axios.get(`${BASE}/api/update/check`, { params: { force } });
      setInfo(data);
    } catch {
      // Network error — silently ignore
    } finally {
      setChecking(false);
    }
  }, []);

  // Check on mount, then every 6 hours
  useEffect(() => {
    check();
    const id = setInterval(() => check(), 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [check]);

  return { info, checking, recheck: () => check(true) };
}
