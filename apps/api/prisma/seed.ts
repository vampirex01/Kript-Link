import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  const team = await prisma.team.upsert({
    where: { slug: "demo-team" },
    update: {},
    create: {
      name: "Demo Team",
      slug: "demo-team",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@shorturl.local" },
    update: {},
    create: {
      email: "demo@shorturl.local",
      passwordHash,
      teamId: team.id,
    },
  });

  await prisma.link.upsert({
    where: { slug: "welcome" },
    update: {},
    create: {
      userId: user.id,
      slug: "welcome",
      title: "Welcome Link",
      destinationUrl: "https://example.com",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
