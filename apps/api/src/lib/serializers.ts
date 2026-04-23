import type { Link, LinkStats, User } from "@prisma/client";

export function serializeUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export function serializeLink(
  link: Link,
  stats?: LinkStats | null,
  customDomain?: string | null,
): Link & { stats?: LinkStats | null; shortUrl: string } {
  const baseUrl = (process.env.BASE_URL ?? "http://localhost:3001").replace(
    /\/+$/,
    "",
  );
  const shortUrl = customDomain
    ? `https://${customDomain}/${link.slug}`
    : `${baseUrl}/${link.slug}`;

  return {
    ...link,
    shortUrl,
    stats,
  };
}
