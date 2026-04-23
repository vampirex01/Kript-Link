import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth } from "../lib/guards.js";

const reviewSignupSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

async function deleteUserById(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const links = await tx.link.findMany({
      where: { userId },
      select: { id: true },
    });

    const linkIds = links.map((link) => link.id);

    if (linkIds.length > 0) {
      await tx.clickLog.deleteMany({
        where: {
          linkId: { in: linkIds },
        },
      });

      await tx.geoRule.deleteMany({
        where: {
          linkId: { in: linkIds },
        },
      });

      await tx.linkStats.deleteMany({
        where: {
          linkId: { in: linkIds },
        },
      });

      await tx.linkReport.deleteMany({
        where: {
          linkId: { in: linkIds },
        },
      });

      await tx.link.deleteMany({
        where: {
          id: { in: linkIds },
        },
      });
    }

    await tx.apiKey.deleteMany({ where: { userId } });
    await tx.customDomain.deleteMany({ where: { userId } });
    await tx.webhook.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/admin/signup-requests",
    {
      preHandler: [requireAuth, requireAdmin],
    },
    async (_request, reply) => {
      const users = await prisma.user.findMany({
        where: {
          role: {
            not: "OWNER",
          },
          status: "PENDING",
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.send({ requests: users });
    },
  );

  app.patch(
    "/api/admin/signup-requests/:id",
    {
      preHandler: [requireAuth, requireAdmin],
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parse = reviewSignupSchema.safeParse(request.body);

      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.flatten() });
      }

      const existing = await prisma.user.findUnique({
        where: { id: params.id },
        select: { id: true, role: true },
      });

      if (!existing || existing.role === "OWNER") {
        return reply.status(404).send({ error: "Signup request not found" });
      }

      if (parse.data.action === "reject") {
        await deleteUserById(existing.id);
        return reply.send({ deleted: true });
      }

      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          status: "APPROVED",
          role: "VIEWER",
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.send({ user });
    },
  );

  app.get(
    "/api/admin/users",
    {
      preHandler: [requireAuth, requireAdmin],
    },
    async (_request, reply) => {
      const users = await prisma.user.findMany({
        where: {
          role: {
            not: "OWNER",
          },
          status: "APPROVED",
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.send({ users });
    },
  );

  app.delete(
    "/api/admin/users/:id",
    {
      preHandler: [requireAuth, requireAdmin],
    },
    async (request, reply) => {
      const params = request.params as { id: string };

      const existing = await prisma.user.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          role: true,
        },
      });

      if (!existing || existing.role === "OWNER") {
        return reply.status(404).send({ error: "User not found" });
      }

      await deleteUserById(existing.id);
      return reply.status(204).send();
    },
  );
}
