import type { Link } from "@prisma/client";
import { prisma } from "./db.js";
import { getAsync, setAsync } from "./redis.js";
import type { GeoResult } from "./geo.js";

interface Rule {
  countryCode: string | null;
  deviceType: string | null;
  language: string | null;
  redirectUrl: string;
  priority: number;
}

function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (/mobile|android|iphone/.test(ua)) {
    return "mobile";
  }

  if (/ipad|tablet/.test(ua)) {
    return "tablet";
  }

  return "desktop";
}

function isRuleMatch(
  rule: Rule,
  geoResult: GeoResult,
  deviceType: string,
  acceptLanguage: string,
): boolean {
  const countryMatches =
    !rule.countryCode || rule.countryCode === geoResult.countryCode;
  const deviceMatches = !rule.deviceType || rule.deviceType === deviceType;
  const languageMatches =
    !rule.language ||
    acceptLanguage.toLowerCase().includes(rule.language.toLowerCase());

  return countryMatches && deviceMatches && languageMatches;
}

async function getRules(linkId: string): Promise<Rule[]> {
  const cacheKey = `georules:${linkId}`;
  const cached = await getAsync(cacheKey);

  if (cached) {
    return JSON.parse(cached) as Rule[];
  }

  const rules = await prisma.geoRule.findMany({
    where: { linkId },
    orderBy: { priority: "asc" },
    select: {
      countryCode: true,
      deviceType: true,
      language: true,
      redirectUrl: true,
      priority: true,
    },
  });

  await setAsync(cacheKey, JSON.stringify(rules), 60);
  return rules;
}

export async function resolveDestination(
  link: Pick<Link, "id" | "destinationUrl">,
  geoResult: GeoResult,
  userAgent: string,
  acceptLanguage: string,
): Promise<string> {
  const rules = await getRules(link.id);
  const deviceType = getDeviceType(userAgent);

  for (const rule of rules) {
    if (isRuleMatch(rule, geoResult, deviceType, acceptLanguage)) {
      return rule.redirectUrl;
    }
  }

  return link.destinationUrl;
}
