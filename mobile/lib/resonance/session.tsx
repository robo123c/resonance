import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { normalizeServerUrl, ResonanceApi } from "./api";
import { clearSession, readStoredSession, saveServerUrl, saveSession } from "./storage";
import type { ResonanceUser } from "./types";

type SessionStatus = "booting" | "disconnected" | "connected" | "authenticated";

interface ResonanceSessionValue {
  status: SessionStatus;
  serverUrl: string | null;
  token: string | null;
  user: ResonanceUser | null;
  api: ResonanceApi | null;
  connect: (serverUrl: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  guest: () => Promise<void>;
  logout: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const ResonanceSessionContext = createContext<ResonanceSessionValue | null>(null);

export function ResonanceSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("booting");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ResonanceUser | null>(null);

  const api = useMemo(() => (serverUrl ? new ResonanceApi(serverUrl, token) : null), [serverUrl, token]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await readStoredSession();
      if (!active) return;

      if (!stored.serverUrl) {
        setStatus("disconnected");
        return;
      }

      setServerUrl(stored.serverUrl);
      if (!stored.token) {
        setStatus("connected");
        return;
      }

      try {
        const refreshedUser = await new ResonanceApi(stored.serverUrl, stored.token).me();
        if (!active) return;
        setToken(stored.token);
        setUser(refreshedUser);
        await saveSession(stored.token, refreshedUser);
        setStatus("authenticated");
      } catch {
        if (!active) return;
        await clearSession();
        setStatus("connected");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const connect = useCallback(async (input: string) => {
    const normalized = normalizeServerUrl(input);
    await new ResonanceApi(normalized).health();
    await saveServerUrl(normalized);
    setServerUrl(normalized);
    setToken(null);
    setUser(null);
    setStatus("connected");
  }, []);

  const acceptLogin = useCallback(async (nextToken: string, nextUser: ResonanceUser) => {
    await saveSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (!serverUrl) throw new Error("Connect to a Resonance server first.");
    const response = await new ResonanceApi(serverUrl).login(username.trim(), password);
    await acceptLogin(response.token, response.user);
  }, [acceptLogin, serverUrl]);

  const guest = useCallback(async () => {
    if (!serverUrl) throw new Error("Connect to a Resonance server first.");
    const response = await new ResonanceApi(serverUrl).guest();
    await acceptLogin(response.token, response.user);
  }, [acceptLogin, serverUrl]);

  const logout = useCallback(async () => {
    if (api) {
      try {
        await api.logout();
      } catch {
        // Local credentials must still be cleared when the server is unavailable.
      }
    }
    await clearSession();
    setToken(null);
    setUser(null);
    setStatus(serverUrl ? "connected" : "disconnected");
  }, [api, serverUrl]);

  const disconnect = useCallback(async () => {
    await clearSession({ includeServer: true });
    setServerUrl(null);
    setToken(null);
    setUser(null);
    setStatus("disconnected");
  }, []);

  const value = useMemo<ResonanceSessionValue>(() => ({
    status,
    serverUrl,
    token,
    user,
    api,
    connect,
    login,
    guest,
    logout,
    disconnect,
  }), [api, connect, disconnect, guest, login, logout, serverUrl, status, token, user]);

  return <ResonanceSessionContext.Provider value={value}>{children}</ResonanceSessionContext.Provider>;
}

export function useResonanceSession() {
  const value = useContext(ResonanceSessionContext);
  if (!value) throw new Error("useResonanceSession must be used inside ResonanceSessionProvider");
  return value;
}
