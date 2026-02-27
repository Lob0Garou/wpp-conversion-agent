import type { PrismaClient } from "@prisma/client";

/**
 * Verifica se o modo CHAT_ONLY está ativo
 */
function isChatOnlyMode(): boolean {
  const caduMode = process.env.CADU_MODE;
  const chatOnly = process.env.CHAT_ONLY;
  return (
    caduMode === "CHAT_ONLY" ||
    caduMode === "chat_only" ||
    chatOnly === "true" ||
    chatOnly === "1" ||
    chatOnly === "yes"
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockPrismaClient(): any {
  console.log("🛠️ [DB GATE] Prisma bypass ativo (CHAT_ONLY). Nenhuma query será disparada.");
  const handler = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(_target: any, prop: string) {
      if (prop === '$connect') return async () => { };
      if (prop === '$disconnect') return async () => { };
      if (prop === '$queryRaw') return async () => [];
      if (prop === '$executeRaw') return async () => 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (prop === '$transaction') return async (cb: any) => cb(new Proxy({}, handler));

      return new Proxy(() => { }, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apply(_targetFn, _thisArg, _argumentsList) {
          // Para findUnique, findFirst etc, retornar null (ou mock vazio)
          if (['findUnique', 'findFirst'].includes(prop)) return Promise.resolve(null);
          // Para create, update etc, retornar um objeto fake rápido
          if (['create', 'update', 'upsert'].includes(prop)) return Promise.resolve({ id: `mock_${Date.now()}` });
          // Para findMany etc
          if (['findMany'].includes(prop)) return Promise.resolve([]);

          return Promise.resolve(null);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(_targetObj, childProp) {
          return handler.get(_targetObj, childProp as string);
        }
      });
    }
  };
  return new Proxy({}, handler);
}

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

const isChatOnly = process.env.CADU_MODE === "CHAT_ONLY" || process.env.CHAT_ONLY === "true";

export const prisma: PrismaClient = isChatOnly
  ? createMockPrismaClient()
  : process.env.NODE_ENV === "production"
    ? createPrismaClient()
    : process.env.TEST_MODE === "true"
      ? createPrismaClient()
      : (globalThis._prisma ?? (globalThis._prisma = createPrismaClient()));
