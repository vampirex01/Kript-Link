import bcrypt from "bcrypt";
import { prisma } from "./db.js";
import { env } from "./env.js";

export async function ensureDefaultAdmin(): Promise<void> {
  if (!env.DEFAULT_ADMIN_EMAIL || !env.DEFAULT_ADMIN_PASSWORD) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: env.DEFAULT_ADMIN_EMAIL },
  });

  if (existing) {
    if (existing.role !== "OWNER" || existing.status !== "APPROVED") {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: "OWNER",
          status: "APPROVED",
        },
      });
    }

    return;
  }

  const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, 12);

  await prisma.user.create({
    data: {
      email: env.DEFAULT_ADMIN_EMAIL,
      passwordHash,
      role: "OWNER",
      status: "APPROVED",
    },
  });
}
