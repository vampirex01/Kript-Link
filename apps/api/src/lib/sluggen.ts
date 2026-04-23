import { customAlphabet } from "nanoid";
import type { PrismaClient } from "@prisma/client";
import { getAsync } from "./redis.js";

const makeSlug = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  7,
);

export function generateSlug(): string {
  return makeSlug();
}

export async function isSlugAvailable(
  slug: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const blacklisted = await getAsync(`slug:blacklist:${slug}`);
  if (blacklisted) {
    return false;
  }

  const existing = await prisma.link.findUnique({
    where: { slug },
    select: { id: true },
  });

  return !existing;
}

export async function generateUniqueSlug(
  prisma: PrismaClient,
): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const slug = generateSlug();
    const available = await isSlugAvailable(slug, prisma);

    if (available) {
      return slug;
    }
  }

  throw new Error("Could not generate a unique slug");
}
