import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { getRedisClient } from "./redis.js";

let clickQueue: Queue | null = null;

function queueConnection(): Redis {
  const client = getRedisClient();

  if (!client) {
    throw new Error("Redis connection required for queue operations");
  }

  return client.duplicate();
}

export function getClickQueue(): Queue {
  if (clickQueue) {
    return clickQueue;
  }

  clickQueue = new Queue("click-events", {
    connection: queueConnection(),
  });

  return clickQueue;
}

export async function enqueueClickJob(
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const queue = getClickQueue();

    await queue.add("click", payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60_000,
      },
      removeOnComplete: 1000,
      removeOnFail: 500,
    });
  } catch {
    // If Redis is unavailable, skip async analytics recording rather than failing redirects.
  }
}
