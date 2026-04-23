import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { env } from "./lib/env.js";
import { prisma } from "./lib/db.js";
import { ensureDefaultAdmin } from "./lib/bootstrapAdmin.js";
import { getRedisClient } from "./lib/redis.js";
import { authRoutes } from "./routes/auth.js";
import { linkRoutes } from "./routes/links.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { redirectRoutes } from "./routes/redirect.js";
import { domainRoutes } from "./routes/domains.js";
import { accountRoutes } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { registerAggregateStatsJob } from "./jobs/aggregateStats.js";
import "./workers/clickWorker.js";

const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

app.register(cookie);
app.register(multipart);

app.register(rateLimit, {
  global: false,
  keyGenerator: (request) => request.authUser?.id ?? request.ip,
  errorResponseBuilder: (_request, context) => ({
    error: "Rate limit exceeded",
    retryAfter: context.after,
  }),
});

app.get("/health", async () => {
  const redis = getRedisClient();
  let redisOk = false;

  if (redis) {
    try {
      await redis.ping();
      redisOk = true;
    } catch {
      redisOk = false;
    }
  }

  return {
    status: "ok",
    redis: redisOk,
    timestamp: new Date().toISOString(),
  };
});

app.register(authRoutes);
app.register(linkRoutes);
app.register(analyticsRoutes);
app.register(domainRoutes);
app.register(accountRoutes);
app.register(adminRoutes);
app.register(redirectRoutes);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);

  if (!reply.sent) {
    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (statusCode >= 500) {
      reply.status(statusCode).send({ error: "Internal server error" });
      return;
    }

    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Request failed";

    reply.status(statusCode).send({ error: message });
  }
});

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    await ensureDefaultAdmin();
    registerAggregateStatsJob();

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`API server listening on ${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
