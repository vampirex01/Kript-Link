import { z } from "zod";
import validator from "validator";

const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "login",
  "signup",
  "www",
  "app",
  "u",
  "report",
]);

export function sanitizeText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return validator.stripLow(validator.escape(validator.trim(value)));
}

const safeUrlSchema = z
  .string()
  .url()
  .refine((url) => {
    const lower = url.toLowerCase();
    return !(
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:") ||
      lower.startsWith("file://")
    );
  }, "Unsafe URL scheme");

const slugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9-_]+$/, "Slug contains invalid characters")
  .refine(
    (slug) => !RESERVED_SLUGS.has(slug.toLowerCase()),
    "Slug is reserved",
  );

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const createLinkSchema = z.object({
  destinationUrl: safeUrlSchema,
  slug: slugSchema.optional(),
  title: z.string().max(200).optional(),
  expiresAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  password: z.string().min(1).optional(),
  maxClicks: z.number().int().positive().optional(),
  customDomainId: z.string().cuid().optional(),
});

export const updateLinkSchema = z
  .object({
    destinationUrl: safeUrlSchema.optional(),
    title: z.string().max(200).optional(),
    active: z.boolean().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    maxClicks: z.number().int().positive().nullable().optional(),
    password: z.string().min(1).nullable().optional(),
    slug: slugSchema.optional(),
    customDomainId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields provided");

export const listLinksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["active", "expired", "all"]).default("all"),
  sort: z.enum(["created", "clicks"]).default("created"),
});

export const geoRuleSchema = z.object({
  countryCode: z.string().length(2).optional().nullable(),
  deviceType: z.string().max(32).optional().nullable(),
  language: z.string().max(12).optional().nullable(),
  redirectUrl: safeUrlSchema,
  priority: z.number().int().min(0),
});

export const geoRulesSchema = z.array(geoRuleSchema);

export const bulkLinksSchema = z.array(createLinkSchema).max(1000);

export const unlockSchema = z.object({
  password: z.string().min(1),
});

export const analyticsPeriodSchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});

export const timeSeriesSchema = z.object({
  granularity: z.enum(["hour", "day", "week"]).default("day"),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const exportSchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const domainSchema = z.object({
  domain: z
    .string()
    .toLowerCase()
    .regex(
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
      "Invalid domain",
    ),
});

export const apiKeySchema = z.object({
  label: z.string().min(2).max(80),
  scopes: z
    .array(
      z.enum(["links:read", "links:write", "analytics:read", "domains:manage"]),
    )
    .min(1),
  expiresAt: z.string().datetime().optional(),
});

export const webhookSchema = z.object({
  url: safeUrlSchema,
  events: z.array(z.enum(["click"])).min(1),
});

export const reportSchema = z.object({
  reason: z.string().min(3).max(500),
});
