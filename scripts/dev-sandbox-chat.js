/**
 * Script para iniciar o Sandbox em modo CHAT_ONLY
 *
 * Este script carrega as variáveis do .env.sandbox e inicia o Next.js
 * na porta 8081 com banco de dados isolado, no modo CHAT_ONLY.
 *
 * Características do CHAT_ONLY:
 * - Sem evaluator/judge
 * - Sem telemetria complexa
 * - Logs simplificados com tags [INBOUND], [CLASSIFY], etc.
 * - Outbox in-memory para last-reply rápido
 * - Rotas admin/metrics/conversations retornam 404
 */

const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const cliArgs = process.argv.slice(2);
const skipPrismaGenerate = cliArgs.includes("--skip-prisma");
const skipDbPush = cliArgs.includes("--skip-db-push");
const forceWebpack = !cliArgs.includes("--turbopack");

function loadEnvFile(envPath) {
    if (!fs.existsSync(envPath)) {
        console.error(`❌ Não achei ${envPath}`);
        process.exit(1);
    }
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const idx = t.indexOf("=");
        if (idx === -1) continue;
        const key = t.slice(0, idx).trim();
        const val = t.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
        process.env[key] = val;
    }
}

const projectRoot = path.resolve(__dirname, "..");
const envSandboxPath = path.join(projectRoot, ".env.sandbox");

console.log("🔧 Carregando configurações do .env.sandbox...");
loadEnvFile(envSandboxPath);

process.env.ENV = "TEST";
process.env.TEST_MODE = "true";

// ⚠️ MODO CHAT_ONLY ATIVADO
process.env.CADU_MODE = "CHAT_ONLY";
process.env.CHAT_ONLY = "true";

// 🔒 Forçar desligar Turbopack
process.env.NEXT_TURBOPACK = "0";

const port = process.env.PORT || "8081";

// 🏗️ Força o caminho ABSOLUTO para o SQLite do Sandbox
const dbAbsolutePath = path.resolve(projectRoot, "tests_harness", "test_harness.db");
process.env.DATABASE_URL = `file:${dbAbsolutePath}`;
process.env.SANDBOX_DATABASE_URL = `file:${dbAbsolutePath}`;

// Garante que o Prisma Client SQLite está gerado
if (skipPrismaGenerate) {
    console.log("⏩ Pulando prisma generate (--skip-prisma)");
} else {
    console.log("🔄 Gerando Prisma Client SQLite (schema-sandbox)...");
    execSync("npx prisma generate --schema=prisma/schema-sandbox.prisma", {
        stdio: "inherit",
        cwd: projectRoot,
    });
}

// Garante que o Schema do banco está sincronizado
// Isso evita erros como "column stores.address_text does not exist"
if (!skipDbPush) {
    console.log("🔄 Sincronizando schema do banco SQLite...");
    try {
        execSync("npx prisma db push --schema=prisma/schema-sandbox.prisma --skip-generate", {
            stdio: "inherit",
            cwd: projectRoot,
        });
        console.log("✅ Schema do banco sincronizado!");
    } catch (err) {
        console.error("❌ ERRO: Falha ao sincronizar schema do banco.");
        console.error("   Rode manualmente: npm run prisma:sandbox:push");
        console.error("   Ou: npx prisma db push --schema=prisma/schema-sandbox.prisma");
        process.exit(1);
    }
} else {
    console.log("⏩ Pulando db push (--skip-db-push) - ATENÇÃO: schema pode estar desatualizado!");
}

console.log("📁  DATABASE_URL:", process.env.DATABASE_URL);
console.log("🌍 ENV:", process.env.ENV);
console.log("🔌 PORT:", port);
console.log("💬 MODE: CHAT_ONLY (ativado)");
console.log(`\n🚀 Iniciando Sandbox CHAT_ONLY em http://localhost:${port}\n`);

// ✅ Chama o bin real do Next via node (Windows-safe)
const nextBinJs = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const args = [
    nextBinJs,
    "dev",
    ...(forceWebpack ? ["--webpack"] : []),
    "-H",
    "0.0.0.0",
    "-p",
    String(port),
];

const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
    console.error("❌ Falha ao iniciar o Next:", err);
    process.exit(1);
});
