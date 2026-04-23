import { createHmac } from "node:crypto";
import { URL } from "node:url";
import { Worker } from "bullmq";
import { UAParser } from "ua-parser-js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/db.js";
import { getRedisClient } from "../lib/redis.js";
import { hashIp } from "../lib/crypto.js";
import { lookupIP } from "../lib/geo.js";

function isBotUserAgent(userAgent: string): boolean {
  return /bot|crawler|spider|preview|slurp|bingpreview/i.test(userAgent);
}

function getReferrerDomain(referrer: string | null): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).hostname;
  } catch {
    return null;
  }
}

function parseUtms(url: string): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
} {
  try {
    const parsed = new URL(url);
    return {
      utmSource: parsed.searchParams.get("utm_source"),
      utmMedium: parsed.searchParams.get("utm_medium"),
      utmCampaign: parsed.searchParams.get("utm_campaign"),
      utmTerm: parsed.searchParams.get("utm_term"),
      utmContent: parsed.searchParams.get("utm_content"),
    };
  } catch {
    return {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    };
  }
}

async function deliverWebhooks(
  linkId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const link = await prisma.link.findUnique({
    where: { id: linkId },
    select: { userId: true },
  });

  if (!link) {
    return;
  }

  const webhooks = await prisma.webhook.findMany({
    where: {
      userId: link.userId,
      events: { has: "click" },
    },
  });

  await Promise.all(
    webhooks.map(async (hook) => {
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", hook.secret)
        .update(body)
        .digest("hex");

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const timeout = 4000;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-shorturl-signature": signature,
            },
            body,
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (response.ok) {
            return;
          }
        } catch {
          clearTimeout(timer);
        }

        const delays = [60_000, 300_000, 1_800_000];
        const delay = delays[attempt] ?? 60_000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }),
  );
}

const connection = getRedisClient()?.duplicate();

if (connection) {
  const worker = new Worker(
    "click-events",
    async (job) => {
      const data = job.data as {
        linkId?: string;
        slug: string;
        destinationUrl: string;
        ip: string;
        userAgent: string;
        referrer: string | null;
        acceptLanguage: string;
      };

      let linkId = data.linkId;

      if (!linkId) {
        const link = await prisma.link.findUnique({
          where: { slug: data.slug },
          select: { id: true },
        });

        if (!link) {
          return;
        }

        linkId = link.id;
      }

      const parser = new UAParser(data.userAgent);
      const result = parser.getResult();
      const geo = await lookupIP(data.ip);
      const ipHash = await hashIp(data.ip);
      const utm = parseUtms(data.destinationUrl);

      await prisma.clickLog.create({
        data: {
          linkId,
          ipHash,
          country: geo.countryCode,
          city: geo.city,
          region: geo.region,
          deviceType: result.device.type ?? "desktop",
          browser: result.browser.name ?? null,
          os: result.os.name ?? null,
          referrer: getReferrerDomain(data.referrer),
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
          utmCampaign: utm.utmCampaign,
          utmTerm: utm.utmTerm,
          utmContent: utm.utmContent,
          isBot: isBotUserAgent(data.userAgent),
          language: data.acceptLanguage.split(",")[0] ?? null,
        },
      });

      await prisma.link.update({
        where: { id: linkId },
        data: {
          clickCount: {
            increment: 1,
          },
        },
      });

      await deliverWebhooks(linkId, {
        type: "click",
        linkId,
        slug: data.slug,
        clickedAt: new Date().toISOString(),
        country: geo.countryCode,
        referrer: getReferrerDomain(data.referrer),
      });
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", (job, error) => {
    console.error("Click job failed", job?.id, error.message);
  });
}
