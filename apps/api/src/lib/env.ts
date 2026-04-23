import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    BASE_URL: z.string().url().default("http://localhost:3001"),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    IPINFO_TOKEN: z.string().optional(),
    GOOGLE_SAFE_BROWSING_API_KEY: z.string().optional(),
    WORKER_CONCURRENCY: z.coerce.number().default(10),
    DEFAULT_ADMIN_EMAIL: z.string().email().optional(),
    DEFAULT_ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((value, ctx) => {
    const hasEmail = Boolean(value.DEFAULT_ADMIN_EMAIL);
    const hasPassword = Boolean(value.DEFAULT_ADMIN_PASSWORD);

    if (hasEmail !== hasPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEFAULT_ADMIN_EMAIL"],
        message:
          "DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set together",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Environment validation failed");
}

export const env = parsed.data;
