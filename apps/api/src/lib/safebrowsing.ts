import { setAsync, getAsync } from "./redis.js";
import { env } from "./env.js";

const LOCAL_BLOCKLIST = [/\\bmalware\\b/i, /\\bphishing\\b/i, /\\bscam\\b/i];

function cacheKey(url: string): string {
  return `safeurl:${Buffer.from(url).toString("base64url")}`;
}

async function checkGoogleSafeBrowsing(url: string): Promise<boolean> {
  if (!env.GOOGLE_SAFE_BROWSING_API_KEY) {
    return true;
  }

  const response = await fetch(
    `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${env.GOOGLE_SAFE_BROWSING_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client: {
          clientId: "shorturl",
          clientVersion: "1.0.0",
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
    },
  );

  if (!response.ok) {
    return true;
  }

  const data = (await response.json()) as { matches?: unknown[] };
  return !data.matches || data.matches.length === 0;
}

export async function isSafeDestination(url: string): Promise<boolean> {
  const key = cacheKey(url);
  const cached = await getAsync(key);

  if (cached === "safe") {
    return true;
  }

  if (cached === "unsafe") {
    return false;
  }

  if (LOCAL_BLOCKLIST.some((expression) => expression.test(url))) {
    await setAsync(key, "unsafe");
    return false;
  }

  const googleSafe = await checkGoogleSafeBrowsing(url);

  if (!googleSafe) {
    await setAsync(key, "unsafe");
    return false;
  }

  await setAsync(key, "safe", 60 * 60);
  return true;
}
