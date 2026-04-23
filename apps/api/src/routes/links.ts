import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "../lib/db.js";
import { requireAuth, requireScopes } from "../lib/guards.js";
import {
  bulkLinksSchema,
  createLinkSchema,
  geoRulesSchema,
  listLinksQuerySchema,
  sanitizeText,
  unlockSchema,
  updateLinkSchema,
} from "../lib/validators.js";
import { generateUniqueSlug, isSlugAvailable } from "../lib/sluggen.js";
import { delAsync, setAsync, getAsync } from "../lib/redis.js";
import { isSafeDestination } from "../lib/safebrowsing.js";
import { serializeLink } from "../lib/serializers.js";

async function getOwnedLinkOrNull(linkId: string, userId: string) {
  return prisma.link.findFirst({
    where: {
      id: linkId,
      userId,
    },
  });
}

async function requireOwnedLink(linkId: string, userId: string) {
  const link = await getOwnedLinkOrNull(linkId, userId);
  if (!link) {
    throw new Error("NOT_FOUND");
  }
  return link;
}

async function getOwnedCustomDomain(userId: string, customDomainId: string) {
  return prisma.customDomain.findFirst({
    where: {
      id: customDomainId,
      userId,
    },
    select: {
      id: true,
      domain: true,
    },
  });
}

export async function linkRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/links",
    {
      preHandler: [requireAuth, requireScopes(["links:write"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = createLinkSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const payload = parse.data;
      const safe = await isSafeDestination(payload.destinationUrl);

      if (!safe) {
        return reply.status(400).send({ error: "Destination URL is unsafe" });
      }

      const selectedDomain = payload.customDomainId
        ? await getOwnedCustomDomain(userId, payload.customDomainId)
        : null;

      if (payload.customDomainId && !selectedDomain) {
        return reply.status(400).send({ error: "Custom domain not found" });
      }

      let slug = payload.slug;

      if (slug) {
        const available = await isSlugAvailable(slug, prisma);
        if (!available) {
          return reply.status(409).send({ error: "Slug already taken" });
        }
      } else {
        slug = await generateUniqueSlug(prisma);
      }

      const hashedPassword = payload.password
        ? await bcrypt.hash(payload.password, 12)
        : undefined;

      const link = await prisma.link.create({
        data: {
          userId,
          customDomainId: selectedDomain?.id,
          slug,
          destinationUrl: payload.destinationUrl,
          title: sanitizeText(payload.title),
          expiresAt: payload.expiresAt
            ? new Date(payload.expiresAt)
            : undefined,
          scheduledAt: payload.scheduledAt
            ? new Date(payload.scheduledAt)
            : undefined,
          passwordHash: hashedPassword,
          maxClicks: payload.maxClicks,
        },
      });

      await delAsync(`slug:${slug}`);

      return reply
        .status(201)
        .send({ link: serializeLink(link, undefined, selectedDomain?.domain) });
    },
  );

  app.get(
    "/api/links",
    {
      preHandler: [requireAuth, requireScopes(["links:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = listLinksQuerySchema.safeParse(request.query);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const { page, limit, search, status, sort } = parse.data;
      const now = new Date();

      const where: Prisma.LinkWhereInput = {
        userId,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { destinationUrl: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      if (status === "active") {
        where.active = true;
        where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
      }

      if (status === "expired") {
        where.OR = [{ active: false }, { expiresAt: { lt: now } }];
      }

      const [total, links] = await Promise.all([
        prisma.link.count({ where }),
        prisma.link.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            customDomain: {
              select: {
                domain: true,
              },
            },
          },
          orderBy:
            sort === "created" ? { createdAt: "desc" } : { createdAt: "desc" },
        }),
      ]);

      const stats = await prisma.linkStats.findMany({
        where: {
          linkId: {
            in: links.map((link) => link.id),
          },
        },
      });

      const statsByLinkId = new Map(stats.map((item) => [item.linkId, item]));

      const merged = links.map((link) =>
        serializeLink(
          link,
          statsByLinkId.get(link.id),
          link.customDomain?.domain,
        ),
      );

      if (sort === "clicks") {
        merged.sort(
          (a, b) => (b.stats?.totalClicks ?? 0) - (a.stats?.totalClicks ?? 0),
        );
      }

      return reply.send({
        links: merged,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    },
  );

  app.get(
    "/api/links/:id",
    {
      preHandler: [requireAuth, requireScopes(["links:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const link = await prisma.link.findFirst({
          where: {
            id: params.id,
            userId,
          },
          include: {
            customDomain: {
              select: {
                id: true,
                domain: true,
                verified: true,
              },
            },
          },
        });

        if (!link) {
          return reply.status(404).send({ error: "Link not found" });
        }

        const [stats, geoRules, customDomains] = await Promise.all([
          prisma.linkStats.findUnique({ where: { linkId: link.id } }),
          prisma.geoRule.findMany({
            where: { linkId: link.id },
            orderBy: { priority: "asc" },
          }),
          prisma.customDomain.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              domain: true,
              verified: true,
              createdAt: true,
            },
          }),
        ]);

        return reply.send({
          link: serializeLink(link, stats, link.customDomain?.domain),
          geoRules,
          customDomains,
        });
      } catch {
        return reply.status(404).send({ error: "Link not found" });
      }
    },
  );

  app.patch(
    "/api/links/:id",
    {
      preHandler: [requireAuth, requireScopes(["links:write"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = updateLinkSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const payload = parse.data;

      try {
        const existing = await requireOwnedLink(params.id, userId);

        let nextCustomDomainId: string | null | undefined;
        if (payload.customDomainId !== undefined) {
          if (payload.customDomainId === null) {
            nextCustomDomainId = null;
          } else {
            const selectedDomain = await getOwnedCustomDomain(
              userId,
              payload.customDomainId,
            );

            if (!selectedDomain) {
              return reply
                .status(400)
                .send({ error: "Custom domain not found" });
            }

            nextCustomDomainId = selectedDomain.id;
          }
        }

        if (payload.destinationUrl) {
          const safe = await isSafeDestination(payload.destinationUrl);
          if (!safe) {
            return reply
              .status(400)
              .send({ error: "Destination URL is unsafe" });
          }
        }

        if (payload.slug && payload.slug !== existing.slug) {
          const available = await isSlugAvailable(payload.slug, prisma);
          if (!available) {
            return reply.status(409).send({ error: "Slug already taken" });
          }
        }

        const passwordHash =
          payload.password === undefined
            ? undefined
            : payload.password === null
              ? null
              : await bcrypt.hash(payload.password, 12);

        const updated = await prisma.link.update({
          where: { id: existing.id },
          include: {
            customDomain: {
              select: {
                domain: true,
              },
            },
          },
          data: {
            destinationUrl: payload.destinationUrl,
            title:
              payload.title === undefined
                ? undefined
                : sanitizeText(payload.title),
            active: payload.active,
            slug: payload.slug,
            expiresAt:
              payload.expiresAt === undefined
                ? undefined
                : payload.expiresAt
                  ? new Date(payload.expiresAt)
                  : null,
            scheduledAt:
              payload.scheduledAt === undefined
                ? undefined
                : payload.scheduledAt
                  ? new Date(payload.scheduledAt)
                  : null,
            maxClicks: payload.maxClicks,
            passwordHash,
            customDomainId: nextCustomDomainId,
          },
        });

        await delAsync(`slug:${existing.slug}`);
        if (payload.slug && payload.slug !== existing.slug) {
          await setAsync(`slug:${payload.slug}`, updated.destinationUrl, 3600);
        }

        return reply.send({
          link: serializeLink(updated, undefined, updated.customDomain?.domain),
        });
      } catch {
        return reply.status(404).send({ error: "Link not found" });
      }
    },
  );

  app.delete(
    "/api/links/:id",
    {
      preHandler: [requireAuth, requireScopes(["links:write"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const link = await requireOwnedLink(params.id, userId);

        await prisma.link.update({
          where: { id: link.id },
          data: { active: false },
        });

        await delAsync(`slug:${link.slug}`);
        return reply.status(204).send();
      } catch {
        return reply.status(404).send({ error: "Link not found" });
      }
    },
  );

  app.post(
    "/api/links/bulk",
    {
      preHandler: [requireAuth, requireScopes(["links:write"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = bulkLinksSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const results: Array<{
        index: number;
        success: boolean;
        link?: unknown;
        error?: string;
      }> = [];

      const items = parse.data;
      const requestedDomainIds = Array.from(
        new Set(
          items
            .map((item) => item.customDomainId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const customDomainsById = new Map<
        string,
        { id: string; domain: string }
      >();

      if (requestedDomainIds.length > 0) {
        const customDomains = await prisma.customDomain.findMany({
          where: {
            userId,
            id: {
              in: requestedDomainIds,
            },
          },
          select: {
            id: true,
            domain: true,
          },
        });

        for (const domain of customDomains) {
          customDomainsById.set(domain.id, domain);
        }
      }

      for (let start = 0; start < items.length; start += 100) {
        const batch = items.slice(start, start + 100);

        for (let offset = 0; offset < batch.length; offset += 1) {
          const index = start + offset;
          const payload = batch[offset];

          try {
            const selectedDomain = payload.customDomainId
              ? customDomainsById.get(payload.customDomainId)
              : null;

            if (payload.customDomainId && !selectedDomain) {
              results.push({
                index,
                success: false,
                error: "Custom domain not found",
              });
              continue;
            }

            const safe = await isSafeDestination(payload.destinationUrl);

            if (!safe) {
              results.push({
                index,
                success: false,
                error: "Unsafe destination URL",
              });
              continue;
            }

            let slug = payload.slug;

            if (slug) {
              const available = await isSlugAvailable(slug, prisma);
              if (!available) {
                results.push({
                  index,
                  success: false,
                  error: "Slug already taken",
                });
                continue;
              }
            } else {
              slug = await generateUniqueSlug(prisma);
            }

            const passwordHash = payload.password
              ? await bcrypt.hash(payload.password, 12)
              : undefined;

            const link = await prisma.link.create({
              data: {
                userId,
                customDomainId: selectedDomain?.id,
                slug,
                destinationUrl: payload.destinationUrl,
                title: sanitizeText(payload.title),
                expiresAt: payload.expiresAt
                  ? new Date(payload.expiresAt)
                  : undefined,
                scheduledAt: payload.scheduledAt
                  ? new Date(payload.scheduledAt)
                  : undefined,
                passwordHash,
                maxClicks: payload.maxClicks,
              },
            });

            results.push({
              index,
              success: true,
              link: serializeLink(link, undefined, selectedDomain?.domain),
            });
          } catch {
            results.push({
              index,
              success: false,
              error: "Failed to create link",
            });
          }
        }
      }

      return reply.send({ results });
    },
  );

  app.put(
    "/api/links/:id/geo-rules",
    {
      preHandler: [requireAuth, requireScopes(["links:write"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parse = geoRulesSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      try {
        const link = await requireOwnedLink(params.id, userId);

        await prisma.$transaction(async (tx) => {
          await tx.geoRule.deleteMany({ where: { linkId: link.id } });

          if (parse.data.length > 0) {
            await tx.geoRule.createMany({
              data: parse.data.map((rule) => ({
                linkId: link.id,
                countryCode: rule.countryCode ?? null,
                deviceType: rule.deviceType ?? null,
                language: rule.language ?? null,
                redirectUrl: rule.redirectUrl,
                priority: rule.priority,
              })),
            });
          }
        });

        await delAsync(`georules:${link.id}`);

        const updated = await prisma.geoRule.findMany({
          where: { linkId: link.id },
          orderBy: { priority: "asc" },
        });

        return reply.send({ rules: updated });
      } catch {
        return reply.status(404).send({ error: "Link not found" });
      }
    },
  );

  app.post("/api/links/:slug/unlock", async (request, reply) => {
    const params = request.params as { slug: string };
    const parse = unlockSchema.safeParse(request.body);

    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.flatten() });
    }

    const ipAddress = request.ip;
    const attemptKey = `unlock:attempts:${params.slug}:${ipAddress}`;
    const attemptsRaw = await getAsync(attemptKey);
    const attempts = Number(attemptsRaw ?? "0");

    if (attempts >= 10) {
      return reply.status(429).send({ error: "Too many failed attempts" });
    }

    const link = await prisma.link.findUnique({
      where: { slug: params.slug },
      select: {
        slug: true,
        destinationUrl: true,
        passwordHash: true,
      },
    });

    if (!link || !link.passwordHash) {
      return reply.status(404).send({ error: "Protected link not found" });
    }

    const match = await bcrypt.compare(parse.data.password, link.passwordHash);

    if (!match) {
      await setAsync(attemptKey, String(attempts + 1), 60 * 30);
      return reply.status(401).send({ error: "Invalid password" });
    }

    await delAsync(attemptKey);
    reply.setCookie(`unlocked_${params.slug}`, "1", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });

    return reply.send({ destination: link.destinationUrl });
  });

  app.get(
    "/api/links/:id/qr",
    {
      preHandler: [requireAuth, requireScopes(["links:read"])],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;
      const params = request.params as { id: string };

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const query = request.query as {
        size?: string;
        format?: "png" | "svg";
        color?: string;
        bgColor?: string;
      };

      try {
        const link = await prisma.link.findFirst({
          where: {
            id: params.id,
            userId,
          },
          include: {
            customDomain: {
              select: {
                domain: true,
              },
            },
          },
        });

        if (!link) {
          return reply.status(404).send({ error: "Link not found" });
        }

        const baseUrl = (
          process.env.BASE_URL ?? "http://localhost:3001"
        ).replace(/\/+$/, "");
        const url = link.customDomain
          ? `https://${link.customDomain.domain}/${link.slug}`
          : `${baseUrl}/${link.slug}`;

        const size = Number(query.size ?? "300");
        const format = query.format ?? "png";
        const dark = query.color ?? "#111111";
        const light = query.bgColor ?? "#ffffff";

        if (format === "svg") {
          const svg = await QRCode.toString(url, {
            type: "svg",
            width: size,
            color: { dark, light },
          });

          reply.header("Content-Type", "image/svg+xml");
          return reply.send(svg);
        }

        const png = await QRCode.toBuffer(url, {
          type: "png",
          width: size,
          color: { dark, light },
        });

        reply.header("Content-Type", "image/png");
        return reply.send(png);
      } catch {
        return reply.status(404).send({ error: "Link not found" });
      }
    },
  );
}
