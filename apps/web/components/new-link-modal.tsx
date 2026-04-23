"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { getAccessToken } from "@/lib/auth-store";
import { api, authHeader } from "@/lib/api";

const schema = z.object({
  destinationUrl: z.string().url(),
  slug: z.string().min(3).max(50).optional().or(z.literal("")),
  title: z.string().max(200).optional(),
  expiresAt: z.string().optional(),
  password: z.string().optional(),
  customDomainId: z.string().optional().or(z.literal("")),
  maxClicks: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewLinkModal({ open, onClose, onCreated }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [createdShortUrl, setCreatedShortUrl] = useState<string | null>(null);
  const token = getAccessToken();

  const { data: domainData } = useSWR(
    open ? ["/api/domains", token] : null,
    async ([url, keyToken]: [string, string | null]) => {
      const response = await api.get(url, {
        headers: authHeader(keyToken),
      });

      return response.data as {
        domains: Array<{
          id: string;
          domain: string;
          verified: boolean;
        }>;
      };
    },
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!open) {
      setError(null);
      setCreatedShortUrl(null);
      reset();
    }
  }, [open, reset]);

  if (!open) {
    return null;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setCreatedShortUrl(null);

    try {
      const token = getAccessToken();
      const { data } = await api.post(
        "/api/links",
        {
          destinationUrl: values.destinationUrl,
          slug: values.slug || undefined,
          title: values.title || undefined,
          expiresAt: values.expiresAt
            ? new Date(values.expiresAt).toISOString()
            : undefined,
          password: values.password || undefined,
          customDomainId: values.customDomainId || undefined,
          maxClicks: values.maxClicks,
        },
        {
          headers: authHeader(token),
        },
      );

      setCreatedShortUrl(data.link.shortUrl);
      onCreated();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create link";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-ink/20 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Create New Link</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-ink/60 hover:text-ink"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Destination URL</label>
            <input
              type="url"
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              {...register("destinationUrl")}
            />
            {errors.destinationUrl ? (
              <p className="mt-1 text-xs text-red-600">
                {errors.destinationUrl.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium">
              Custom slug (optional)
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              {...register("slug")}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Title (optional)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              {...register("title")}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Short domain</label>
            <select
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              {...register("customDomainId")}
            >
              <option value="">Default domain</option>
              {(domainData?.domains ?? []).map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.domain}
                  {domain.verified ? "" : " (pending verification)"}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Expiry (optional)</label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
                {...register("expiresAt")}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Max clicks (optional)
              </label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
                {...register("maxClicks")}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Password (optional)</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              {...register("password")}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {createdShortUrl ? (
            <p className="rounded-lg bg-moss/10 px-3 py-2 text-sm text-moss">
              Created: {createdShortUrl}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-ink px-4 py-3 font-semibold text-white hover:bg-ink/90"
          >
            {isSubmitting ? "Creating..." : "Create Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
