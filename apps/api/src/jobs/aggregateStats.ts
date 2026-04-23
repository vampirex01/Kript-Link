import cron from "node-cron";
import { prisma } from "../lib/db.js";

async function aggregate(): Promise<void> {
  const links = await prisma.link.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
    },
  });

  for (const link of links) {
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const seven = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirty = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalClicks,
      uniqueClicksRows,
      clicksToday,
      clicks7d,
      clicks30d,
      topCountry,
      topReferrer,
    ] = await Promise.all([
      prisma.clickLog.count({ where: { linkId: link.id } }),
      prisma.clickLog.groupBy({ by: ["ipHash"], where: { linkId: link.id } }),
      prisma.clickLog.count({
        where: { linkId: link.id, clickedAt: { gte: day } },
      }),
      prisma.clickLog.count({
        where: { linkId: link.id, clickedAt: { gte: seven } },
      }),
      prisma.clickLog.count({
        where: { linkId: link.id, clickedAt: { gte: thirty } },
      }),
      prisma.clickLog.groupBy({
        by: ["country"],
        where: { linkId: link.id },
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 1,
      }),
      prisma.clickLog.groupBy({
        by: ["referrer"],
        where: { linkId: link.id },
        _count: { referrer: true },
        orderBy: { _count: { referrer: "desc" } },
        take: 1,
      }),
    ]);

    await prisma.linkStats.upsert({
      where: { linkId: link.id },
      create: {
        linkId: link.id,
        totalClicks,
        uniqueClicks: uniqueClicksRows.length,
        clicksToday,
        clicks7d,
        clicks30d,
        topCountry: topCountry[0]?.country ?? null,
        topReferrer: topReferrer[0]?.referrer ?? null,
      },
      update: {
        totalClicks,
        uniqueClicks: uniqueClicksRows.length,
        clicksToday,
        clicks7d,
        clicks30d,
        topCountry: topCountry[0]?.country ?? null,
        topReferrer: topReferrer[0]?.referrer ?? null,
      },
    });
  }
}

export function registerAggregateStatsJob(): void {
  cron.schedule("*/5 * * * *", () => {
    void aggregate().catch((error) => {
      console.error("Failed to aggregate stats", error);
    });
  });
}
