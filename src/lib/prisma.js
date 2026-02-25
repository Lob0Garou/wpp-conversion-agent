"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
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
function getPrismaClientClass() {
    if (process.env.TEST_MODE === "true") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(".prisma/client-sandbox").PrismaClient;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@prisma/client").PrismaClient;
}
function createPrismaClient() {
    var Client = getPrismaClientClass();
    return new Client({
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });
}
exports.prisma = process.env.NODE_ENV === "production"
    ? createPrismaClient()
    : process.env.TEST_MODE === "true"
        ? createPrismaClient()
        : ((_a = globalThis._prisma) !== null && _a !== void 0 ? _a : (globalThis._prisma = createPrismaClient()));
