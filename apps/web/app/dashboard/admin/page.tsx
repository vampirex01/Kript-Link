"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, authHeader } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";
import { useAuth } from "@/lib/use-auth";

interface SignupRequest {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}

async function authedGet<T>(url: string): Promise<T> {
  const token = getAccessToken();
  const response = await api.get(url, {
    headers: authHeader(token),
  });
  return response.data as T;
}

export default function AdminPage() {
  const token = getAccessToken();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, mutate, isLoading } = useSWR(
    ["/api/admin/signup-requests", token],
    ([url]) => authedGet<{ requests: SignupRequest[] }>(url),
  );

  const reviewRequest = async (id: string, action: "approve" | "reject") => {
    setError(null);
    setBusyId(id);

    try {
      await api.patch(
        `/api/admin/signup-requests/${id}`,
        { action },
        {
          headers: authHeader(token),
        },
      );
      await mutate();
    } catch {
      setError("Failed to update signup request");
    } finally {
      setBusyId(null);
    }
  };

  if (isAuthLoading) {
    return (
      <section className="cyber-card rounded-2xl p-5">
        <h1 className="font-display text-3xl text-ink">Admin</h1>
        <p className="mt-2 text-sm text-ink/60">Loading session...</p>
      </section>
    );
  }

  if (user?.role !== "OWNER") {
    return (
      <section className="cyber-card rounded-2xl p-5">
        <h1 className="font-display text-3xl text-ink">Admin</h1>
        <p className="mt-2 text-sm text-red-700">
          Only admin users can access this page.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Signup approvals</h1>
        <p className="text-sm text-ink/60">
          Monitor signup requests and approve or reject account access.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="cyber-card rounded-2xl p-5">
        {isLoading ? (
          <p className="text-sm text-ink/60">Loading requests...</p>
        ) : (data?.requests.length ?? 0) === 0 ? (
          <p className="text-sm text-ink/60">No signup requests yet.</p>
        ) : (
          <div className="space-y-3">
            {(data?.requests ?? []).map((request) => (
              <article
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3"
              >
                <div>
                  <p className="font-semibold text-ink">{request.email}</p>
                  <p className="text-xs text-ink/60">
                    Status: {request.status} | Applied:{" "}
                    {new Date(request.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void reviewRequest(request.id, "approve")}
                    className="rounded-lg border border-moss px-3 py-1.5 text-sm text-moss disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void reviewRequest(request.id, "reject")}
                    className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
