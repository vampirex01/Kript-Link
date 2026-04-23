"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { api, authHeader } from "./api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./auth-store";

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
  role: string;
  status: string;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCurrentUser = useCallback(async (accessToken: string) => {
    const { data } = await api.get("/api/auth/me", {
      headers: authHeader(accessToken),
    });

    const currentUser = data.user as AuthUser;
    setUser(currentUser);
    return currentUser;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/api/auth/login", { email, password });
    setTokens(data.accessToken, data.refreshToken);
    const authUser = data.user as AuthUser;
    setUser(authUser);
    return authUser;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/api/auth/register", { email, password });

    clearTokens();
    setUser(null);

    return {
      message:
        (data.message as string | undefined) ??
        "Signup request submitted. Awaiting admin approval.",
    };
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();

    if (refreshToken) {
      await api
        .post("/api/auth/logout", { refreshToken })
        .catch(() => undefined);
    }

    clearTokens();
    setUser(null);
    router.push("/login");
  }, [router]);

  const refresh = useCallback(async () => {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      clearTokens();
      setUser(null);
      return false;
    }

    try {
      const { data } = await api.post("/api/auth/refresh", { refreshToken });
      const accessToken = data.accessToken as string;
      const previousRefresh = getRefreshToken();
      if (previousRefresh) {
        setTokens(accessToken, previousRefresh);
      }
      return true;
    } catch {
      clearTokens();
      setUser(null);
      return false;
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const token = getAccessToken();

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        await loadCurrentUser(token);
      } catch {
        const ok = await refresh();
        if (!ok) {
          setUser(null);
        } else {
          const nextToken = getAccessToken();
          if (!nextToken) {
            setUser(null);
          } else {
            try {
              await loadCurrentUser(nextToken);
            } catch {
              clearTokens();
              setUser(null);
            }
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [loadCurrentUser, refresh]);

  const getApiErrorMessage = useCallback((error: unknown) => {
    if (error instanceof AxiosError) {
      const maybeMessage =
        error.response?.data &&
        typeof error.response.data === "object" &&
        "error" in error.response.data
          ? (error.response.data.error as string)
          : null;

      if (maybeMessage) {
        return maybeMessage;
      }
    }

    return null;
  }, []);

  return useMemo(
    () => ({
      user,
      login,
      register,
      logout,
      refresh,
      isLoading,
      getApiErrorMessage,
    }),
    [getApiErrorMessage, isLoading, login, logout, refresh, register, user],
  );
}
