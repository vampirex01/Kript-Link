"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Copy } from "lucide-react";
import { api, authHeader } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";

async function authedGet<T>(url: string): Promise<T> {
  const token = getAccessToken();
  const response = await api.get(url, {
    headers: authHeader(token),
  });
  return response.data as T;
}

export default function SettingsPage() {
  const token = getAccessToken();

  const { data: keys, mutate: mutateKeys } = useSWR(
    ["/api/api-keys", token],
    ([url]) =>
      authedGet<{
        keys: Array<{
          id: string;
          label: string;
          scopes: string[];
          createdAt: string;
          lastUsedAt: string | null;
        }>;
      }>(url),
  );

  const { data: domains, mutate: mutateDomains } = useSWR(
    ["/api/domains", token],
    ([url]) =>
      authedGet<{
        domains: Array<{
          id: string;
          domain: string;
          verified: boolean;
          createdAt: string;
        }>;
      }>(url),
  );

  const { data: webhooks, mutate: mutateHooks } = useSWR(
    ["/api/webhooks", token],
    ([url]) =>
      authedGet<{
        webhooks: Array<{
          id: string;
          url: string;
          events: string[];
          createdAt: string;
        }>;
      }>(url),
  );

  const [newKey, setNewKey] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [domainInfo, setDomainInfo] = useState<string | null>(null);

  const scopeOptions = useMemo(
    () => ["links:read", "links:write", "analytics:read", "domains:manage"],
    [],
  );

  const createApiKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "");
    const scopes = scopeOptions.filter((scope) => form.get(scope) === "on");

    if (scopes.length === 0) {
      return;
    }

    const response = await api.post(
      "/api/api-keys",
      {
        label,
        scopes,
      },
      {
        headers: authHeader(token),
      },
    );

    setNewKey(response.data.apiKey as string);
    await mutateKeys();
    event.currentTarget.reset();
  };

  const revokeApiKey = async (id: string) => {
    await api.delete(`/api/api-keys/${id}`, {
      headers: authHeader(token),
    });

    await mutateKeys();
  };

  const addDomain = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const response = await api.post(
      "/api/domains",
      { domain: domainInput },
      {
        headers: authHeader(token),
      },
    );

    setDomainInfo(response.data.instructions as string);
    setDomainInput("");
    await mutateDomains();
  };

  const createWebhook = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const url = String(form.get("url") ?? "");

    await api.post(
      "/api/webhooks",
      { url, events: ["click"] },
      {
        headers: authHeader(token),
      },
    );

    await mutateHooks();
    event.currentTarget.reset();
  };

  const removeDomain = async (id: string) => {
    await api.delete(`/api/domains/${id}`, {
      headers: authHeader(token),
    });

    await mutateDomains();
  };

  const verifyDomain = async (id: string) => {
    await api.post(
      `/api/domains/${id}/verify`,
      {},
      {
        headers: authHeader(token),
      },
    );

    await mutateDomains();
  };

  const removeWebhook = async (id: string) => {
    await api.delete(`/api/webhooks/${id}`, {
      headers: authHeader(token),
    });

    await mutateHooks();
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Settings</h1>
        <p className="text-sm text-ink/60">
          Manage API keys, domains, and webhooks.
        </p>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
        <h2 className="font-display text-2xl">API keys</h2>

        <form
          onSubmit={createApiKey}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input
            name="label"
            required
            placeholder="Key label"
            className="rounded-xl border border-ink/20 px-3 py-2 sm:col-span-2"
          />

          {scopeOptions.map((scope) => (
            <label
              key={scope}
              className="inline-flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm"
            >
              <input type="checkbox" name={scope} />
              {scope}
            </label>
          ))}

          <button
            type="submit"
            className="sm:col-span-2 w-fit rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Create key
          </button>
        </form>

        {newKey ? (
          <div className="mt-4 rounded-xl border border-ember/30 bg-ember/10 p-3">
            <p className="text-sm font-semibold text-ember">
              Copy this key now. You will not see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-white px-2 py-1 text-xs">
                {newKey}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(newKey)}
                className="inline-flex items-center gap-1 rounded border border-ink/20 px-2 py-1 text-xs"
              >
                <Copy size={14} />
                Copy
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {(keys?.keys ?? []).map((key) => (
            <article
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3"
            >
              <div>
                <p className="font-semibold">{key.label}</p>
                <p className="text-xs text-ink/60">
                  Scopes: {key.scopes.join(", ")}
                </p>
                <p className="text-xs text-ink/50">
                  Last used:{" "}
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revokeApiKey(key.id)}
                className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700"
              >
                Revoke
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
        <h2 className="font-display text-2xl">Custom domains</h2>
        <form
          onSubmit={addDomain}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <input
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
            required
            placeholder="yourdomain.com"
            className="w-full max-w-md rounded-xl border border-ink/20 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Add domain
          </button>
        </form>
        {domainInfo ? (
          <p className="mt-3 rounded-lg bg-moss/10 px-3 py-2 text-sm text-moss">
            {domainInfo}
          </p>
        ) : null}

        <div className="mt-4 space-y-2">
          {(domains?.domains ?? []).map((domain) => (
            <article
              key={domain.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3"
            >
              <div>
                <p className="font-semibold">{domain.domain}</p>
                <p
                  className={`text-xs ${domain.verified ? "text-moss" : "text-amber-700"}`}
                >
                  {domain.verified ? "Verified" : "Pending verification"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!domain.verified ? (
                  <button
                    type="button"
                    onClick={() => void verifyDomain(domain.id)}
                    className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm"
                  >
                    Verify
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeDomain(domain.id)}
                  className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
        <h2 className="font-display text-2xl">Webhooks</h2>
        <form
          onSubmit={createWebhook}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <input
            name="url"
            type="url"
            required
            placeholder="https://example.com/webhooks/click"
            className="w-full max-w-lg rounded-xl border border-ink/20 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Add webhook
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {(webhooks?.webhooks ?? []).map((webhook) => (
            <article
              key={webhook.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3"
            >
              <div>
                <p className="font-semibold">{webhook.url}</p>
                <p className="text-xs text-ink/60">
                  Events: {webhook.events.join(", ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removeWebhook(webhook.id)}
                className="rounded-lg border border-red-400 px-3 py-1.5 text-sm text-red-700"
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
