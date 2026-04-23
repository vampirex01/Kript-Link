import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { prisma } from "./db.js";
import { sha256 } from "./crypto.js";
import { verifyAccess } from "./auth.js";

function unauthorized(
  reply: FastifyReply,
  message = "Unauthorized",
): FastifyReply {
  return reply.status(401).send({ error: message });
}

function forbidden(reply: FastifyReply, message = "Forbidden"): FastifyReply {
  return reply.status(403).send({ error: message });
}

async function authenticateApiKey(
  request: FastifyRequest,
  rawToken: string,
): Promise<boolean> {
  const hash = sha256(rawToken);
  const now = new Date();

  const key = await prisma.apiKey.findFirst({
    where: {
      keyHash: hash,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  if (!key) {
    return false;
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: now },
  });

  request.authUser = {
    id: key.userId,
    authType: "apiKey",
    scopes: key.scopes,
  };

  return true;
}

async function authenticateJwt(
  request: FastifyRequest,
  rawToken: string,
): Promise<boolean> {
  try {
    const payload = verifyAccess(rawToken);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== "APPROVED") {
      return false;
    }

    request.authUser = {
      id: user.id,
      authType: "jwt",
      role: user.role,
      status: user.status,
    };
    return true;
  } catch {
    return false;
  }
}

export const requireAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized(reply);
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (token.startsWith("sk_live_")) {
    const ok = await authenticateApiKey(request, token);
    if (!ok) {
      return unauthorized(reply, "Invalid API key");
    }
    return;
  }

  const ok = await authenticateJwt(request, token);
  if (!ok) {
    return unauthorized(reply, "Invalid token");
  }
};

export function requireScopes(scopes: string[]): preHandlerHookHandler {
  return async (request, reply) => {
    if (!request.authUser) {
      return unauthorized(reply);
    }

    if (request.authUser.authType !== "apiKey") {
      return;
    }

    const granted = new Set(request.authUser.scopes ?? []);
    const missing = scopes.filter((scope) => !granted.has(scope));

    if (missing.length > 0) {
      return forbidden(reply, `Missing scopes: ${missing.join(", ")}`);
    }
  };
}

export const requireAdmin: preHandlerHookHandler = async (request, reply) => {
  if (!request.authUser) {
    return unauthorized(reply);
  }

  if (request.authUser.authType !== "jwt") {
    return forbidden(reply, "Admin access requires a user session");
  }

  if (request.authUser.role !== "OWNER") {
    return forbidden(reply, "Admin access required");
  }
};
