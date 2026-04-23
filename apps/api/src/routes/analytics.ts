import { stringify } from "csv-stringify/sync";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { requireAuth, requireScopes } from "../lib/guards.js";
import {
  analyticsPeriodSchema,
  exportSchema,
  timeSeriesSchema,
} from "../lib/validators.js";

function periodToDate(period: "7d" | "30d" | "90d" | "all"): Date | null {
  if (period === "all") {
    return null;
  }

  const days = Number(period.replace("d", ""));
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function classifyReferrer(
  referrer: string,
): "social" | "email" | "search" | "direct" | "other" {
  const lower = referrer.toLowerCase();

  if (!lower || lower === "direct") {
    return "direct";
  }

  if (/facebook|twitter|x.com|instagram|linkedin|t.co|pinterest/.test(lower)) {
    return "social";
  }

  if (/mail.google|outlook|yahoo.mail|protonmail/.test(lower)) {
    return "email";
  }

  if (/google|bing|duckduckgo|yandex|baidu/.test(lower)) {
    return "search";
  }

  return "other";
}

async function getOwnedLink(linkId: string, userId: string) {
  return prisma.link.findFirst({
    where: {
      id: linkId,
      userId,
    },
  });
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/account/analytics/overview",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [clicksToday, clicksThisMonth, topCountries] = await Promise.all([
        prisma.clickLog.count({
          where: {
            link: { userId },
            clickedAt: { gte: startOfToday },
          },
        }),
        prisma.clickLog.count({
          where: {
            link: { userId },
            clickedAt: { gte: startOfMonth },
          },
        }),
        prisma.clickLog.groupBy({
          by: ["country"],
          where: {
            link: { userId },
            country: { not: null },
          },
          _count: { country: true },
          orderBy: { _count: { country: "desc" } },
          take: 5,
        }),
      ]);

      return reply.send({
        clicksToday,
        clicksThisMonth,
        topCountries: topCountries.map((item) => ({
          country: item.country,
          clicks: item._count.country,
        })),
      });
    },
  );

  app.get(
    "/api/links/:id/analytics",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = analyticsPeriodSchema.safeParse(request.query);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const link = await getOwnedLink(params.id, userId);
      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const from = periodToDate(parse.data.period);

      const where = {
        linkId: link.id,
        ...(from ? { clickedAt: { gte: from } } : {}),
      };

      const [
        totalClicks,
        uniqueClicks,
        clicksInPeriod,
        byCountry,
        byReferrer,
        byDevice,
        byBrowser,
        bots,
      ] = await Promise.all([
        prisma.clickLog.count({ where: { linkId: link.id } }),
        prisma.clickLog.groupBy({
          by: ["ipHash"],
          where,
          _count: { ipHash: true },
        }),
        prisma.clickLog.count({ where }),
        prisma.clickLog.groupBy({
          by: ["country"],
          where,
          _count: { country: true },
          orderBy: { _count: { country: "desc" } },
          take: 1,
        }),
        prisma.clickLog.groupBy({
          by: ["referrer"],
          where,
          _count: { referrer: true },
          orderBy: { _count: { referrer: "desc" } },
          take: 1,
        }),
        prisma.clickLog.groupBy({
          by: ["deviceType"],
          where,
          _count: { deviceType: true },
          orderBy: { _count: { deviceType: "desc" } },
          take: 1,
        }),
        prisma.clickLog.groupBy({
          by: ["browser"],
          where,
          _count: { browser: true },
          orderBy: { _count: { browser: "desc" } },
          take: 1,
        }),
        prisma.clickLog.count({ where: { ...where, isBot: true } }),
      ]);

      return reply.send({
        totalClicks,
        uniqueClicks: uniqueClicks.length,
        clicksInPeriod,
        topCountry: byCountry[0]?.country ?? null,
        topReferrer: byReferrer[0]?.referrer ?? "direct",
        topDevice: byDevice[0]?.deviceType ?? null,
        topBrowser: byBrowser[0]?.browser ?? null,
        botPercentage: clicksInPeriod === 0 ? 0 : bots / clicksInPeriod,
      });
    },
  );

  app.get(
    "/api/links/:id/analytics/timeseries",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = timeSeriesSchema.safeParse(request.query);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const link = await getOwnedLink(params.id, userId);
      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const from = new Date(parse.data.from);
      const to = new Date(parse.data.to);

      const results = await prisma.$queryRaw<
        Array<{ bucket: Date; clicks: bigint }>
      >`
      SELECT date_trunc(${parse.data.granularity}, "clickedAt") AS bucket, COUNT(*)::bigint AS clicks
      FROM "ClickLog"
      WHERE "linkId" = ${link.id}
        AND "clickedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

      const data = results.map((row) => ({
        date: row.bucket.toISOString(),
        clicks: Number(row.clicks),
      }));

      return reply.send({ data });
    },
  );

  app.get(
    "/api/links/:id/analytics/geo",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const link = await getOwnedLink(params.id, userId);
      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const [total, countries, cities] = await Promise.all([
        prisma.clickLog.count({ where: { linkId: link.id } }),
        prisma.clickLog.groupBy({
          by: ["country"],
          where: { linkId: link.id },
          _count: { country: true },
          orderBy: { _count: { country: "desc" } },
          take: 50,
        }),
        prisma.clickLog.groupBy({
          by: ["city", "country"],
          where: { linkId: link.id },
          _count: { city: true },
          orderBy: { _count: { city: "desc" } },
          take: 20,
        }),
      ]);

      return reply.send({
        countries: countries.map((item) => ({
          country: item.country,
          clicks: item._count.country,
          percentage: total === 0 ? 0 : item._count.country / total,
        })),
        cities: cities.map((item) => ({
          city: item.city,
          country: item.country,
          clicks: item._count.city,
        })),
      });
    },
  );

  app.get(
    "/api/links/:id/analytics/referrers",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const link = await getOwnedLink(params.id, userId);
      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const byDomain = await prisma.clickLog.groupBy({
        by: ["referrer"],
        where: { linkId: link.id },
        _count: { referrer: true },
        orderBy: { _count: { referrer: "desc" } },
        take: 100,
      });

      const channelMap = new Map<string, number>();

      for (const row of byDomain) {
        const ref = row.referrer ?? "direct";
        const channel = classifyReferrer(ref);
        channelMap.set(
          channel,
          (channelMap.get(channel) ?? 0) + row._count.referrer,
        );
      }

      return reply.send({
        byDomain: byDomain.map((item) => ({
          domain: item.referrer ?? "direct",
          clicks: item._count.referrer,
        })),
        byChannel: Array.from(channelMap.entries()).map(
          ([channel, clicks]) => ({ channel, clicks }),
        ),
      });
    },
  );

  app.get(
    "/api/links/:id/analytics/devices",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const link = await getOwnedLink(params.id, userId);
      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const [deviceType, browser, os, botSplit] = await Promise.all([
        prisma.clickLog.groupBy({
          by: ["deviceType"],
          where: { linkId: link.id },
          _count: { deviceType: true },
        }),
        prisma.clickLog.groupBy({
          by: ["browser"],
          where: { linkId: link.id },
          _count: { browser: true },
        }),
        prisma.clickLog.groupBy({
          by: ["os"],
          where: { linkId: link.id },
          _count: { os: true },
        }),
        prisma.clickLog.groupBy({
          by: ["isBot"],
          where: { linkId: link.id },
          _count: { isBot: true },
        }),
      ]);

      return reply.send({ deviceType, browser, os, botSplit });
    },
  );

  app.get(
    "/api/links/:id/analytics/export",
    {
      preHandler: [requireAuth, requireScopes(["analytics:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = exportSchema.safeParse(request.query);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const link = await getOwnedLink(params.id, userId);
      if (!link) {
        return reply.status(404).send({ error: "Link not found" });
      }

      const from = new Date(parse.data.from);
      const to = new Date(parse.data.to);

      const total = await prisma.clickLog.count({
        where: {
          linkId: link.id,
          clickedAt: {
            gte: from,
            lte: to,
          },
        },
      });

      if (total > 100_000) {
        return reply
          .status(400)
          .send({ error: "Maximum export size is 100000 rows" });
      }

      const rows = await prisma.clickLog.findMany({
        where: {
          linkId: link.id,
          clickedAt: {
            gte: from,
            lte: to,
          },
        },
        orderBy: {
          clickedAt: "asc",
        },
      });

      const date = new Date().toISOString().slice(0, 10);

      if (parse.data.format === "json") {
        reply.header(
          "Content-Disposition",
          `attachment; filename=\"clicks-${link.slug}-${date}.json\"`,
        );
        return reply.send(rows);
      }

      const csv = stringify(rows, {
        header: true,
      });

      reply.header("Content-Type", "text/csv");
      reply.header(
        "Content-Disposition",
        `attachment; filename=\"clicks-${link.slug}-${date}.csv\"`,
      );
      return reply.send(csv);
    },
  );
}
