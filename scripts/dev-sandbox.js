/**
 * Script para iniciar o Admin Sandbox
 * 
 * Este script carrega as variÃ¡veis do .env.sandbox e inicia o Next.js
 * na porta 8081 com banco de dados isolado.
 * 
 * Usa --no-turbopack para evitar erros de cache do Turbopack.
 */

const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const cliArgs = process.argv.slice(2);
const skipPrismaGenerate = cliArgs.includes("--skip-prisma");
const forceWebpack = !cliArgs.includes("--turbopack");

function loadEnvFile(envPath) {
    if (!fs.existsSync(envPath)) {
        console.error(`âŒ NÃ£o achei ${envPath}`);
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

console.log("ðŸ”§ Carregando configuraÃ§Ãµes do .env.sandbox...");
loadEnvFile(envSandboxPath);

process.env.ENV = "TEST";
process.env.TEST_MODE = "true";

// ðŸ”’ ForÃ§a desligar Turbopack
process.env.NEXT_TURBOPACK = "0";

const port = process.env.PORT || "8081";

// ðŸ›¤ï¸ ForÃ§a o caminho ABSOLUTO para o SQLite do Sandbox
// Isso evita mÃºltiplos bancos fantasmas pelo Prisma ou root diferente
const dbAbsolutePath = path.resolve(projectRoot, "tests_harness", "test_harness.db");
process.env.DATABASE_URL = `file:${dbAbsolutePath}`;
process.env.SANDBOX_DATABASE_URL = `file:${dbAbsolutePath}`;

// Garante que o Prisma Client SQLite estÃ¡ gerado no diretÃ³rio isolado
// (.prisma/client-sandbox) antes de subir o Next.js.
if (skipPrismaGenerate) {
    console.log("⏩ Pulando prisma generate (--skip-prisma)");
} else {
    console.log("🔄 Gerando Prisma Client SQLite (schema-sandbox)...");
    execSync("npx prisma generate --schema=prisma/schema-sandbox.prisma", {
        stdio: "inherit",
        cwd: projectRoot,
    });
}

console.log("ðŸ—„ï¸  DATABASE_URL:", process.env.DATABASE_URL);
console.log("ðŸŒ ENV:", process.env.ENV);
console.log("ðŸ”Œ PORT:", port);
console.log(`⚡ Bundler: ${forceWebpack ? "webpack (--webpack)" : "turbopack"}`);
console.log(`\nðŸš€ Iniciando Admin Sandbox em http://localhost:${port}\n`);

// âœ… Chama o bin real do Next via node (Windows-safe, sem spawn EINVAL)
const nextBinJs = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

// args: next dev -H 0.0.0.0 -p 8081
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
    console.error("âŒ Falha ao iniciar o Next:", err);
    process.exit(1);
});
