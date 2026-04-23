import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth } from "../lib/guards.js";

const reviewSignupSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

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

      const status = parse.data.action === "approve" ? "APPROVED" : "REJECTED";

      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          status,
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
}
