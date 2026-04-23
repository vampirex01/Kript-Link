import { createHash, randomBytes } from "node:crypto";
import { getAsync, setAsync } from "./redis.js";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function dateKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getDailySalt(): Promise<string> {
  const key = `salt:${dateKey()}`;
  const existing = await getAsync(key);

  if (existing) {
    return existing;
  }

  const salt = randomBytes(24).toString("hex");
  await setAsync(key, salt, 60 * 60 * 48);
  return salt;
}

export async function hashIp(ipAddress: string): Promise<string> {
  const salt = await getDailySalt();
  return sha256(`${ipAddress}:${salt}`);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  return sha256(a) === sha256(b);
}
