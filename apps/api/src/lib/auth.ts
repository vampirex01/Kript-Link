import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "./env.js";

export interface AccessPayload extends JwtPayload {
  userId: string;
  type: "access";
}

export interface RefreshPayload extends JwtPayload {
  userId: string;
  type: "refresh";
}

export function signTokens(userId: string): {
  accessToken: string;
  refreshToken: string;
} {
  const accessOptions: SignOptions = { expiresIn: "3h" };
  const refreshOptions: SignOptions = { expiresIn: "3h" };

  const accessToken = jwt.sign(
    { userId, type: "access" },
    env.JWT_SECRET,
    accessOptions,
  );
  const refreshToken = jwt.sign(
    { userId, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    refreshOptions,
  );

  return { accessToken, refreshToken };
}

export function verifyAccess(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as AccessPayload;

  if (payload.type !== "access" || !payload.userId) {
    throw new Error("Invalid access token payload");
  }

  return payload;
}

export function verifyRefresh(token: string): RefreshPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;

  if (payload.type !== "refresh" || !payload.userId) {
    throw new Error("Invalid refresh token payload");
  }

  return payload;
}

export function getTokenExpiryEpoch(token: string): number | null {
  const decoded = jwt.decode(token) as JwtPayload | null;
  return decoded?.exp ?? null;
}
