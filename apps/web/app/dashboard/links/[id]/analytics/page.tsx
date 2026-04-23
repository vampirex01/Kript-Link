"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { api, authHeader } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";

const colors = ["#e85d2a", "#375b46", "#1d4a9f", "#8f6f33", "#7b3d3d"];

async function authedGet<T>(url: string): Promise<T> {
  const token = getAccessToken();
  const response = await api.get(url, { headers: authHeader(token) });
  return response.data as T;
}

export default function LinkAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const [period, setPeriod] = useState("30d");
  const [granularity, setGranularity] = useState("day");

  const from = useMemo(() => {
    const days = period === "all" ? 365 : Number(period.replace("d", ""));
    const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return date.toISOString();
  }, [period]);

  const to = new Date().toISOString();

  const { data: summary } = useSWR(
    `/api/links/${params.id}/analytics?period=${period}`,
    (url) =>
      authedGet<{
        totalClicks: number;
        uniqueClicks: number;
        clicksInPeriod: number;
        topCountry: string | null;
        topReferrer: string | null;
        topDevice: string | null;
        topBrowser: string | null;
        botPercentage: number;
      }>(url),
  );

  const { data: series } = useSWR(
    `/api/links/${params.id}/analytics/timeseries?granularity=${granularity}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    (url) => authedGet<{ data: Array<{ date: string; clicks: number }> }>(url),
  );

  const { data: geo } = useSWR(`/api/links/${params.id}/analytics/geo`, (url) =>
    authedGet<{
      countries: Array<{ country: string; clicks: number }>;
      cities: Array<{ city: string; clicks: number; country: string }>;
    }>(url),
  );

  const { data: referrers } = useSWR(
    `/api/links/${params.id}/analytics/referrers`,
    (url) =>
      authedGet<{
        byDomain: Array<{ domain: string; clicks: number }>;
        byChannel: Array<{ channel: string; clicks: number }>;
      }>(url),
  );

  const { data: devices } = useSWR(
    `/api/links/${params.id}/analytics/devices`,
    (url) =>
      authedGet<{
        deviceType: Array<{
          deviceType: string;
          _count: { deviceType: number };
        }>;
        browser: Array<{ browser: string; _count: { browser: number } }>;
        os: Array<{ os: string; _count: { os: number } }>;
        botSplit: Array<{ isBot: boolean; _count: { isBot: number } }>;
      }>(url),
  );

  const downloadExport = async () => {
    const token = getAccessToken();
    const response = await api.get(
      `/api/links/${params.id}/analytics/export?format=csv&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: authHeader(token),
        responseType: "blob",
      },
    );

    const blobUrl = window.URL.createObjectURL(response.data);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `analytics-${params.id}.csv`;
    anchor.click();
    window.URL.revokeObjectURL(blobUrl);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Analytics</h1>
          <p className="text-sm text-ink/60">
            Performance breakdown for this short link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void downloadExport()}
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <article className="rounded-2xl border border-ink/10 bg-white/85 p-4">
          <p className="text-xs uppercase text-ink/60">Total clicks</p>
          <p className="font-display text-3xl">{summary?.totalClicks ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-ink/10 bg-white/85 p-4">
          <p className="text-xs uppercase text-ink/60">Unique</p>
          <p className="font-display text-3xl">{summary?.uniqueClicks ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-ink/10 bg-white/85 p-4">
          <p className="text-xs uppercase text-ink/60">In period</p>
          <p className="font-display text-3xl">
            {summary?.clicksInPeriod ?? 0}
          </p>
        </article>
        <article className="rounded-2xl border border-ink/10 bg-white/85 p-4">
          <p className="text-xs uppercase text-ink/60">Top country</p>
          <p className="font-display text-3xl">{summary?.topCountry ?? "-"}</p>
        </article>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="rounded-lg border border-ink/20 px-3 py-2"
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="all">all</option>
          </select>
          <select
            value={granularity}
            onChange={(event) => setGranularity(event.target.value)}
            className="rounded-lg border border-ink/20 px-3 py-2"
          >
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
          </select>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8cfbf" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="#e85d2a"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
          <h2 className="font-display text-xl">Top countries</h2>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={geo?.countries.slice(0, 10) ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8cfbf" />
                <XAxis dataKey="country" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="clicks" fill="#375b46" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
          <h2 className="font-display text-xl">Traffic sources</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-ink/10 p-3">
              <p className="text-sm font-semibold text-ink">By channel</p>
              <div className="mt-2 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={referrers?.byChannel ?? []}
                      dataKey="clicks"
                      nameKey="channel"
                      outerRadius={80}
                    >
                      {(referrers?.byChannel ?? []).map((item, index) => (
                        <Cell
                          key={item.channel}
                          fill={colors[index % colors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 space-y-1 text-xs text-ink/70">
                {(referrers?.byChannel ?? []).length === 0 ? (
                  <p>No traffic source data yet</p>
                ) : (
                  (referrers?.byChannel ?? []).map((item) => (
                    <p key={item.channel}>
                      {item.channel}: {item.clicks}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-ink/10 p-3">
              <p className="text-sm font-semibold text-ink">
                Top referrer domains
              </p>
              <div className="mt-2 space-y-1 text-sm text-ink/70">
                {(referrers?.byDomain ?? []).length === 0 ? (
                  <p>No referrer domains yet</p>
                ) : (
                  (referrers?.byDomain ?? []).slice(0, 10).map((item) => (
                    <p key={item.domain}>
                      {item.domain}: {item.clicks}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white/85 p-5">
        <h2 className="font-display text-xl">Device breakdown</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(devices?.deviceType ?? []).map((item) => (
            <div
              key={item.deviceType}
              className="rounded-xl border border-ink/10 p-3"
            >
              <p className="text-xs uppercase text-ink/60">
                {item.deviceType ?? "unknown"}
              </p>
              <p className="font-display text-2xl">{item._count.deviceType}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
