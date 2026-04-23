"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api, authHeader } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";
import { NewLinkModal } from "@/components/new-link-modal";
import type { LinkListResponse } from "@/types/api";

const fetcher = async ([url, token]: [string, string | null]) => {
  const response = await api.get(url, {
    headers: authHeader(token),
  });
  return response.data as LinkListResponse;
};

const overviewFetcher = async ([url, token]: [string, string | null]) => {
  const response = await api.get(url, {
    headers: authHeader(token),
  });

  return response.data as {
    clicksToday: number;
    clicksThisMonth: number;
    topCountries: Array<{ country: string; clicks: number }>;
  };
};

export default function DashboardPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("created");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      status,
      sort,
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    return `/api/links?${params.toString()}`;
  }, [page, search, sort, status]);

  const token = getAccessToken();
  const { data, error, isLoading, mutate } = useSWR([query, token], fetcher);
  const { data: overview } = useSWR(
    ["/api/account/analytics/overview", token],
    overviewFetcher,
  );

  return (
    <section>
      <div className="stagger-in mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Your links</h1>
          <p className="text-sm text-ink/60">
            Create, manage, and track link performance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 font-semibold text-ink shadow transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_26px_rgba(0,245,255,0.35)]"
        >
          <Plus size={18} />
          New Link
        </button>
      </div>

      <div className="cyber-card mb-4 grid grid-cols-1 gap-3 rounded-2xl p-4 sm:grid-cols-4">
        <input
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Search by title, URL, or slug"
          className="rounded-lg border border-ink/20 px-3 py-2 sm:col-span-2"
        />

        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          className="rounded-lg border border-ink/20 px-3 py-2"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="expired">Expired/Disabled</option>
        </select>

        <select
          value={sort}
          onChange={(event) => {
            setPage(1);
            setSort(event.target.value);
          }}
          className="rounded-lg border border-ink/20 px-3 py-2"
        >
          <option value="created">Newest</option>
          <option value="clicks">Most clicks</option>
        </select>
      </div>

      <section className="cyber-card mb-4 rounded-2xl p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <article className="cyber-card rounded-xl p-3">
            <p className="text-xs uppercase tracking-wide text-ink/50">
              Clicks today
            </p>
            <p className="font-display text-3xl text-ink">
              {overview?.clicksToday ?? 0}
            </p>
          </article>

          <article className="cyber-card rounded-xl p-3">
            <p className="text-xs uppercase tracking-wide text-ink/50">
              Clicks this month
            </p>
            <p className="font-display text-3xl text-ink">
              {overview?.clicksThisMonth ?? 0}
            </p>
          </article>

          <article className="cyber-card rounded-xl p-3">
            <p className="text-xs uppercase tracking-wide text-ink/50">
              Top 5 countries
            </p>
            <div className="mt-2 space-y-1 text-sm text-ink/70">
              {(overview?.topCountries ?? []).length === 0 ? (
                <p>No country data yet</p>
              ) : (
                (overview?.topCountries ?? []).map((item) => (
                  <p key={item.country}>
                    {item.country}: {item.clicks}
                  </p>
                ))
              )}
            </div>
          </article>
        </div>
      </section>

      {isLoading ? <p>Loading links...</p> : null}
      {error ? <p className="text-red-600">Failed to load links</p> : null}

      <div className="grid gap-3">
        {data?.links.map((link) => (
          <article key={link.id} className="cyber-card rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{link.shortUrl}</p>
                <p className="mt-1 max-w-xl truncate text-sm text-ink/60">
                  {link.destinationUrl}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wide text-ink/50">
                  Created {new Date(link.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-ink/50">
                  Total clicks
                </p>
                <p className="font-display text-3xl">
                  {link.stats?.totalClicks ?? link.clickCount}
                </p>
                <p
                  className={`mt-1 text-xs font-semibold ${link.active ? "text-moss" : "text-red-600"}`}
                >
                  {link.active ? "Active" : "Disabled"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Link
                href={`/dashboard/links/${link.id}`}
                className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm font-semibold transition hover:border-ember/50 hover:text-ember"
              >
                Edit
              </Link>
              <Link
                href={`/dashboard/links/${link.id}/analytics`}
                className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm font-semibold transition hover:border-ember/50 hover:text-ember"
              >
                Analytics
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          className="rounded-lg border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-ink/70">
          Page {data?.page ?? page} of {data?.pages ?? 1}
        </p>
        <button
          type="button"
          disabled={!data || page >= data.pages}
          onClick={() => setPage((value) => value + 1)}
          className="rounded-lg border border-ink/20 px-3 py-2 text-sm disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <NewLinkModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => void mutate()}
      />
    </section>
  );
}
