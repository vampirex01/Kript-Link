import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { getAsync, setAsync } from "../lib/redis.js";
import { lookupIP } from "../lib/geo.js";
import { resolveDestination } from "../lib/router.js";
import { enqueueClickJob } from "../lib/queue.js";

export async function redirectRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/:slug",
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { slug: string };
      const slug = params.slug;

      const cachedDestination = await getAsync(`slug:${slug}`);

      if (cachedDestination) {
        void enqueueClickJob({
          slug,
          destinationUrl: cachedDestination,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? "",
          referrer: request.headers.referer ?? null,
          acceptLanguage: request.headers["accept-language"] ?? "",
        });

        return reply.redirect(cachedDestination, 302);
      }

      const link = await prisma.link.findFirst({
        where: {
          slug,
          active: true,
        },
      });

      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const now = new Date();

      if (link.expiresAt && link.expiresAt < now) {
        return reply.status(410).send({ error: "Link expired" });
      }

      if (link.scheduledAt && link.scheduledAt > now) {
        return reply.status(404).send({ error: "Link not yet active" });
      }

      if (
        typeof link.maxClicks === "number" &&
        link.clickCount >= link.maxClicks
      ) {
        return reply.status(410).send({ error: "Click limit reached" });
      }

      const unlockCookie = request.cookies[`unlocked_${slug}`];

      if (link.passwordHash && unlockCookie !== "1") {
        return reply
          .status(401)
          .send({ error: "Password required", requiresPassword: true });
      }

      const geo = await lookupIP(request.ip);
      const destination = await resolveDestination(
        { id: link.id, destinationUrl: link.destinationUrl },
        geo,
        request.headers["user-agent"] ?? "",
        request.headers["accept-language"] ?? "",
      );

      await setAsync(`slug:${slug}`, destination, 3600);

      void enqueueClickJob({
        linkId: link.id,
        slug,
        destinationUrl: destination,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? "",
        referrer: request.headers.referer ?? null,
        acceptLanguage: request.headers["accept-language"] ?? "",
      });

      return reply.redirect(destination, 302);
    },
  );

  app.post("/report/:slug", async (request, reply) => {
    const params = request.params as { slug: string };
    const body = request.body as { reason?: string };

    const link = await prisma.link.findUnique({ where: { slug: params.slug } });
    if (!link) {
      return reply.status(404).send({ error: "Link not found" });
    }

    const reason = (body.reason ?? "unspecified").slice(0, 500);

    await prisma.linkReport.create({
      data: {
        linkId: link.id,
        reporterIp: request.ip,
        reason,
      },
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await prisma.linkReport.count({
      where: {
        linkId: link.id,
        createdAt: { gte: oneDayAgo },
      },
    });

    if (count >= 5) {
      await prisma.link.update({
        where: { id: link.id },
        data: { active: false },
      });
    }

    return reply.status(201).send({ ok: true });
  });
}
