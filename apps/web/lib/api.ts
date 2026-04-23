import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./auth-store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  withCredentials: true,
});

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const AUTH_BYPASS_ROUTES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
];

let refreshPromise: Promise<string | null> | null = null;

function shouldBypassAuth(url?: string): boolean {
  if (!url) {
    return false;
  }

  return AUTH_BYPASS_ROUTES.some((route) => url.includes(route));
}

function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        clearTokens();
        return null;
      }

      try {
        const { data } = await api.post("/api/auth/refresh", { refreshToken });
        const accessToken = data.accessToken as string | undefined;

        if (!accessToken) {
          clearTokens();
          return null;
        }

        setTokens(accessToken, refreshToken);
        return accessToken;
      } catch {
        clearTokens();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (shouldBypassAuth(config.url)) {
    return config;
  }

  const accessToken = getAccessToken();

  if (accessToken) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization =
      `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    if (shouldBypassAuth(originalRequest.url)) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      clearTokens();
      redirectToLogin();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const nextAccessToken = await refreshAccessToken();

    if (!nextAccessToken) {
      redirectToLogin();
      return Promise.reject(error);
    }

    originalRequest.headers = originalRequest.headers ?? {};
    (originalRequest.headers as Record<string, string>).Authorization =
      `Bearer ${nextAccessToken}`;

    return api(originalRequest);
  },
);

export function authHeader(accessToken: string | null): Record<string, string> {
  if (!accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}
