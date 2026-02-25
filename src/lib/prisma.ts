import type { PrismaClient } from "@prisma/client";

/**
 * Retorna a classe PrismaClient correta para o ambiente atual.
 *
 * - TEST_MODE=true  → .prisma/client-sandbox  (SQLite, gerado de schema-sandbox.prisma)
 * - Produção/dev    → @prisma/client           (Postgres, gerado de schema.prisma)
 *
 * Os dois clientes vivem em diretórios separados (node_modules/.prisma/client
 * e node_modules/.prisma/client-sandbox) e nunca se sobrescrevem mutuamente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPrismaClientClass(): any {
  if (process.env.TEST_MODE === "true") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(".prisma/client-sandbox").PrismaClient;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@prisma/client").PrismaClient;
}

declare global {
  var _prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const Client = getPrismaClientClass();
  return new Client({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma: PrismaClient =
  process.env.NODE_ENV === "production"
    ? createPrismaClient()
    : process.env.TEST_MODE === "true"
      ? createPrismaClient()
      : (globalThis._prisma ?? (globalThis._prisma = createPrismaClient()));
