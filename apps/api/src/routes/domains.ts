import dns from "node:dns/promises";
import { customAlphabet } from "nanoid";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { requireAuth, requireScopes } from "../lib/guards.js";
import {
  apiKeySchema,
  domainSchema,
  webhookSchema,
} from "../lib/validators.js";
import { sha256 } from "../lib/crypto.js";

const generateApiKeySuffix = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  32,
);

function makeApiKey(): string {
  return `sk_live_${generateApiKeySuffix()}`;
}

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/domains",
    {
      preHandler: [requireAuth, requireScopes(["domains:manage"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const domains = await prisma.customDomain.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ domains });
    },
  );

  app.post(
    "/api/domains",
    {
      preHandler: [requireAuth, requireScopes(["domains:manage"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = domainSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const existing = await prisma.customDomain.findUnique({
        where: { domain: parse.data.domain },
      });

      if (existing) {
        return reply.status(409).send({ error: "Domain already registered" });
      }

      const domain = await prisma.customDomain.create({
        data: {
          userId,
          domain: parse.data.domain,
        },
      });

      return reply.status(201).send({
        domain,
        instructions: `CNAME ${domain.domain} -> links.yourdomain.com`,
      });
    },
  );

  app.post(
    "/api/domains/:id/verify",
    {
      preHandler: [requireAuth, requireScopes(["domains:manage"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const domain = await prisma.customDomain.findFirst({
        where: { id: params.id, userId },
      });

      if (!domain) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      try {
        const records = await dns.resolveCname(domain.domain);
        const verified = records.some((record) =>
          record.includes("links.yourdomain.com"),
        );

        const updated = await prisma.customDomain.update({
          where: { id: domain.id },
          data: {
            verified,
            sslStatus: verified ? "ACTIVE" : "PENDING",
          },
        });

        return reply.send({ domain: updated, verified });
      } catch {
        return reply
          .status(400)
          .send({ error: "Unable to resolve CNAME record" });
      }
    },
  );

  app.delete(
    "/api/domains/:id",
    {
      preHandler: [requireAuth, requireScopes(["domains:manage"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const domain = await prisma.customDomain.findFirst({
        where: { id: params.id, userId },
      });

      if (!domain) {
        return reply.status(404).send({ error: "Domain not found" });
      }

      await prisma.customDomain.delete({ where: { id: domain.id } });
      return reply.status(204).send();
    },
  );

  app.post(
    "/api/api-keys",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = apiKeySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const key = makeApiKey();

      const created = await prisma.apiKey.create({
        data: {
          userId,
          label: parse.data.label,
          scopes: parse.data.scopes,
          expiresAt: parse.data.expiresAt
            ? new Date(parse.data.expiresAt)
            : null,
          keyHash: sha256(key),
        },
      });

      return reply.status(201).send({
        apiKey: key,
        record: {
          id: created.id,
          label: created.label,
          scopes: created.scopes,
          expiresAt: created.expiresAt,
          createdAt: created.createdAt,
        },
      });
    },
  );

  app.get(
    "/api/api-keys",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const keys = await prisma.apiKey.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          label: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      return reply.send({ keys });
    },
  );

  app.delete(
    "/api/api-keys/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const key = await prisma.apiKey.findFirst({
        where: { id: params.id, userId },
      });

      if (!key) {
        return reply.status(404).send({ error: "API key not found" });
      }

      await prisma.apiKey.delete({ where: { id: key.id } });
      return reply.status(204).send();
    },
  );

  app.post(
    "/api/webhooks",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = webhookSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const secret = makeApiKey();

      const webhook = await prisma.webhook.create({
        data: {
          userId,
          url: parse.data.url,
          events: parse.data.events,
          secret,
        },
      });

      return reply.status(201).send({ webhook });
    },
  );

  app.get(
    "/api/webhooks",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const hooks = await prisma.webhook.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          url: true,
          events: true,
          createdAt: true,
        },
      });

      return reply.send({ webhooks: hooks });
    },
  );

  app.delete(
    "/api/webhooks/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const hook = await prisma.webhook.findFirst({
        where: { id: params.id, userId },
      });

      if (!hook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      await prisma.webhook.delete({ where: { id: hook.id } });
      return reply.status(204).send();
    },
  );
}
