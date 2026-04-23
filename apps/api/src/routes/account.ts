import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/guards.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.delete(
    "/api/account",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.authUser?.id;

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

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

      return reply.status(204).send();
    },
  );
}
