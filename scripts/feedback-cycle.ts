/**
 * Script CLI para executar o ciclo de feedback
 *
 * Uso:
 *   npx ts-node scripts/feedback-cycle.ts [comando] [opções]
 *
 * Comandos:
 *   analyze    Apenas analisa, não aplica patches (padrão)
 *   dry-run    Simula aplicação sem modificar arquivos
 *   apply      Aplica patches automaticamente
 *
 * Opções:
 *   --min-priority=N    Prioridade mínima para aplicar (default: 50)
 *   --intents=SALES,SAC Filtrar por intents específicas
 *   --no-backup         Não criar backup antes de aplicar
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import {
    runFeedbackCycle,
    generateCycleReport,
    type FeedbackCycleOptions,
} from "../src/lib/feedback";

// ─── Parse de Argumentos ────────────────────────────────────────────────────────

interface ParsedArgs {
    command: "analyze" | "dry-run" | "apply";
    minPriority: number;
    intents: string[] | undefined;
    createBackup: boolean;
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);

    const result: ParsedArgs = {
        command: "analyze",
        minPriority: 50,
        intents: undefined,
        createBackup: true,
    };

    for (const arg of args) {
        if (arg === "analyze" || arg === "dry-run" || arg === "apply") {
            result.command = arg;
        } else if (arg.startsWith("--min-priority=")) {
            result.minPriority = parseInt(arg.split("=")[1], 10);
        } else if (arg.startsWith("--intents=")) {
            result.intents = arg.split("=")[1].split(",");
        } else if (arg === "--no-backup") {
            result.createBackup = false;
        }
    }

    return result;
}

// ─── Execução Principal ────────────────────────────────────────────────────────

async function main() {
    console.log("\n");
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║         🔄 CICLO DE FEEDBACK AUTOMÁTICO - CLI                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");

    const args = parseArgs();

    console.log(`\n📋 Configuração:`);
    console.log(`   Comando: ${args.command}`);
    console.log(`   Prioridade mínima: ${args.minPriority}`);
    console.log(`   Intents: ${args.intents?.join(", ") || "todas"}`);
    console.log(`   Backup: ${args.createBackup ? "sim" : "não"}`);

    const options: FeedbackCycleOptions = {
        autoApply: args.command === "apply" || args.command === "dry-run",
        dryRun: args.command === "dry-run",
        createBackup: args.createBackup,
        minPriority: args.minPriority,
        targetIntents: args.intents,
    };

    const result = await runFeedbackCycle(options);

    console.log("\n" + generateCycleReport(result));

    // Exit code
    process.exit(result.success ? 0 : 1);
}

// Executar
main().catch(error => {
    console.error("❌ Erro fatal:", error);
    process.exit(1);
});