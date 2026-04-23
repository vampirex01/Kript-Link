import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      authType: "jwt" | "apiKey";
      role?: "OWNER" | "EDITOR" | "VIEWER";
      status?: "PENDING" | "APPROVED" | "REJECTED";
      scopes?: string[];
    };
  }
}
