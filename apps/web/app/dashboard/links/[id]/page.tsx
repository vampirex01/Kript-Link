"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Trash2 } from "lucide-react";
import { api, authHeader } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";

const fetcher = async ([url, token]: [string, string | null]) => {
  const { data } = await api.get(url, {
    headers: authHeader(token),
  });
  return data as {
    link: {
      id: string;
      title: string | null;
      slug: string;
      customDomainId: string | null;
      shortUrl: string;
      destinationUrl: string;
      active: boolean;
      expiresAt: string | null;
      maxClicks: number | null;
    };
    geoRules: Array<{
      countryCode: string | null;
      deviceType: string | null;
      language: string | null;
      redirectUrl: string;
      priority: number;
    }>;
    customDomains: Array<{
      id: string;
      domain: string;
      verified: boolean;
      createdAt: string;
    }>;
  };
};

export default function EditLinkPage() {
  const params = useParams<{ id: string }>();
  const token = getAccessToken();
  const router = useRouter();

  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const path = useMemo(() => `/api/links/${params.id}`, [params.id]);
  const { data, isLoading, mutate } = useSWR([path, token], fetcher);

  const [ruleDraft, setRuleDraft] = useState({
    countryCode: "",
    deviceType: "",
    language: "",
    redirectUrl: "",
    priority: "0",
  });

  if (isLoading || !data) {
    return <p>Loading link details...</p>;
  }

  const onSave: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setSaveState("saving");
    setErrorMessage(null);

    const form = new FormData(event.currentTarget);

    try {
      await api.patch(
        `/api/links/${params.id}`,
        {
          title: String(form.get("title") ?? ""),
          destinationUrl: String(form.get("destinationUrl") ?? ""),
          slug: String(form.get("slug") ?? ""),
          customDomainId: form.get("customDomainId")
            ? String(form.get("customDomainId"))
            : null,
          active: String(form.get("active") ?? "on") === "on",
          expiresAt: form.get("expiresAt")
            ? new Date(String(form.get("expiresAt"))).toISOString()
            : null,
          maxClicks: form.get("maxClicks")
            ? Number(form.get("maxClicks"))
            : null,
          password: form.get("password")
            ? String(form.get("password"))
            : undefined,
        },
        {
          headers: authHeader(token),
        },
      );

      setSaveState("saved");
      void mutate();
    } catch {
      setSaveState("error");
      setErrorMessage("Failed to update link");
    }
  };

  const onDelete = async () => {
    try {
      await api.delete(`/api/links/${params.id}`, {
        headers: authHeader(token),
      });
      router.push("/dashboard");
    } catch {
      setErrorMessage("Failed to delete link");
    }
  };

  const onReplaceGeoRules = async () => {
    try {
      const existing = data.geoRules;
      const next = [
        ...existing,
        {
          countryCode: ruleDraft.countryCode || null,
          deviceType: ruleDraft.deviceType || null,
          language: ruleDraft.language || null,
          redirectUrl: ruleDraft.redirectUrl,
          priority: Number(ruleDraft.priority || "0"),
        },
      ];

      await api.put(`/api/links/${params.id}/geo-rules`, next, {
        headers: authHeader(token),
      });

      setRuleDraft({
        countryCode: "",
        deviceType: "",
        language: "",
        redirectUrl: "",
        priority: "0",
      });

      void mutate();
    } catch {
      setErrorMessage("Failed to update geo rules");
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Edit link</h1>
        <p className="text-sm text-ink/60">
          Update destination, controls, and routing rules.
        </p>
      </div>

      <form onSubmit={onSave} className="cyber-card grid gap-5 rounded-2xl p-5">
        <div>
          <label className="text-sm font-medium">Title</label>
          <input
            name="title"
            defaultValue={data.link.title ?? ""}
            className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Slug</label>
          <input
            name="slug"
            defaultValue={data.link.slug}
            className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
          />
          <p className="mt-1 text-xs text-ink/60">
            Current URL: {data.link.shortUrl}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Short domain</label>
          <select
            name="customDomainId"
            defaultValue={data.link.customDomainId ?? ""}
            className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
          >
            <option value="">Default domain</option>
            {data.customDomains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.domain}
                {domain.verified ? "" : " (pending verification)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Destination URL</label>
          <input
            name="destinationUrl"
            defaultValue={data.link.destinationUrl}
            className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Expiry</label>
            <input
              type="datetime-local"
              name="expiresAt"
              defaultValue={
                data.link.expiresAt
                  ? new Date(data.link.expiresAt).toISOString().slice(0, 16)
                  : ""
              }
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Max clicks</label>
            <input
              type="number"
              name="maxClicks"
              defaultValue={data.link.maxClicks ?? ""}
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">
            Set new password (optional)
          </label>
          <input
            type="password"
            name="password"
            className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="active"
            defaultChecked={data.link.active}
          />
          Link is active
        </label>

        <button
          type="submit"
          disabled={saveState === "saving"}
          className="w-fit rounded-xl bg-ink px-4 py-2.5 font-semibold text-white"
        >
          {saveState === "saving" ? "Saving..." : "Save changes"}
        </button>

        {saveState === "saved" ? (
          <p className="text-sm text-moss">Changes saved.</p>
        ) : null}
        {errorMessage ? (
          <p className="text-sm text-red-600">{errorMessage}</p>
        ) : null}
      </form>

      <section className="cyber-card rounded-2xl p-5">
        <h2 className="font-display text-2xl">Geo rules</h2>
        <p className="text-sm text-ink/60">
          Define destination overrides by country, device, and language.
        </p>

        <div className="mt-4 space-y-2">
          {data.geoRules.map((rule) => (
            <div
              key={`${rule.redirectUrl}-${rule.priority}`}
              className="rounded-xl border border-ink/10 p-3 text-sm"
            >
              <p>
                {rule.countryCode ?? "*"} / {rule.deviceType ?? "*"} /{" "}
                {rule.language ?? "*"} {"->"} {rule.redirectUrl}
              </p>
              <p className="text-xs text-ink/60">Priority: {rule.priority}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            value={ruleDraft.countryCode}
            onChange={(event) =>
              setRuleDraft((value) => ({
                ...value,
                countryCode: event.target.value,
              }))
            }
            placeholder="Country (BD)"
            className="rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={ruleDraft.deviceType}
            onChange={(event) =>
              setRuleDraft((value) => ({
                ...value,
                deviceType: event.target.value,
              }))
            }
            placeholder="Device"
            className="rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={ruleDraft.language}
            onChange={(event) =>
              setRuleDraft((value) => ({
                ...value,
                language: event.target.value,
              }))
            }
            placeholder="Language"
            className="rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={ruleDraft.redirectUrl}
            onChange={(event) =>
              setRuleDraft((value) => ({
                ...value,
                redirectUrl: event.target.value,
              }))
            }
            placeholder="https://..."
            className="rounded-lg border border-ink/20 px-3 py-2"
          />
          <input
            value={ruleDraft.priority}
            onChange={(event) =>
              setRuleDraft((value) => ({
                ...value,
                priority: event.target.value,
              }))
            }
            placeholder="Priority"
            type="number"
            className="rounded-lg border border-ink/20 px-3 py-2"
          />
        </div>

        <button
          type="button"
          onClick={() => void onReplaceGeoRules()}
          className="mt-3 rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold"
        >
          Add rule
        </button>
      </section>

      <section className="rounded-2xl border border-red-300 bg-red-50 p-5">
        <h2 className="font-display text-xl text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-red-700/80">
          Disable link permanently while preserving analytics.
        </p>
        <button
          type="button"
          onClick={() => void onDelete()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          <Trash2 size={16} />
          Delete link
        </button>
      </section>
    </section>
  );
}
