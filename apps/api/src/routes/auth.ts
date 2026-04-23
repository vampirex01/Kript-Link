import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { getTokenExpiryEpoch, signTokens, verifyRefresh } from "../lib/auth.js";
import { delAsync, getAsync, setAsync } from "../lib/redis.js";
import { requireAuth } from "../lib/guards.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
} from "../lib/validators.js";
import { serializeUser } from "../lib/serializers.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/register",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const parse = registerSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const { email, password } = parse.data;
      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing) {
        return reply.status(409).send({ error: "Email already in use" });
      }

      const hash = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hash,
          role: "VIEWER",
          status: "PENDING",
        },
      });

      return reply.status(202).send({
        user: serializeUser(user),
        message: "Signup request submitted. Awaiting admin approval.",
      });
    },
  );

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const parse = loginSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const { email, password } = parse.data;
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      if (user.status === "PENDING") {
        return reply.status(403).send({
          error: "Your account is pending admin approval",
          code: "ACCOUNT_PENDING",
        });
      }

      if (user.status === "REJECTED") {
        return reply.status(403).send({
          error: "Your signup request was not approved",
          code: "ACCOUNT_REJECTED",
        });
      }

      const match = await bcrypt.compare(password, user.passwordHash);

      if (!match) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const tokens = signTokens(user.id);

      return reply.send({
        user: serializeUser(user),
        ...tokens,
      });
    },
  );

  app.post("/api/auth/refresh", async (request, reply) => {
    const parse = refreshSchema.safeParse(request.body);

    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.flatten() });
    }

    const blocked = await getAsync(
      `token:blocklist:${parse.data.refreshToken}`,
    );

    if (blocked) {
      return reply
        .status(401)
        .send({ error: "Refresh token has been revoked" });
    }

    try {
      const payload = verifyRefresh(parse.data.refreshToken);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, status: true },
      });

      if (!user || user.status !== "APPROVED") {
        return reply.status(401).send({ error: "Account is not active" });
      }

      const { accessToken } = signTokens(payload.userId);
      return reply.send({ accessToken });
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  app.get(
    "/api/auth/me",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({ user: serializeUser(user) });
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const parse = refreshSchema.safeParse(request.body);

    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.flatten() });
    }

    const exp = getTokenExpiryEpoch(parse.data.refreshToken);
    const ttl = exp
      ? Math.max(exp - Math.floor(Date.now() / 1000), 1)
      : 60 * 60 * 24 * 30;

    await setAsync(`token:blocklist:${parse.data.refreshToken}`, "1", ttl);
    await delAsync(`session:user:${parse.data.refreshToken}`);

    return reply.send({ ok: true });
  });

  app.post("/api/auth/forgot-password", async (request, reply) => {
    const body = request.body as { email?: string };

    if (!body.email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Intentionally return a generic response to prevent account enumeration.
    return reply.send({
      message: "If that email exists, a reset link has been sent.",
    });
  });
}
