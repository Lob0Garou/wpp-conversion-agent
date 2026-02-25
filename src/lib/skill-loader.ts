import * as fs from "fs";
import * as path from "path";
import type { Intent } from "./intent-classifier";

// ─── SKILL CACHE ────────────────────────────────────────────────────────────
// Skill files are read once per process and cached in memory.
// Skills live in {project_root}/skills/ — outside of src/ intentionally,
// so they can be edited without touching TypeScript source.

const skillCache = new Map<string, string>();

function loadSkillFile(filename: string): string {
    if (skillCache.has(filename)) {
        return skillCache.get(filename)!;
    }

    const skillPath = path.join(process.cwd(), "skills", filename);
    try {
        const content = fs.readFileSync(skillPath, "utf-8");
        skillCache.set(filename, content);
        return content;
    } catch (error) {
        console.error(`[SKILLS] ❌ Failed to load skill file: ${filename}`, error);
        skillCache.set(filename, ""); // Cache empty to avoid repeated failed reads
        return "";
    }
}

// ─── INTENT → SKILL MAPPING ──────────────────────────────────────────────────

const SAC_INTENTS: Intent[] = [
    "SAC_TROCA",
    "SAC_ATRASO",
    "SAC_RETIRADA",
    "SAC_REEMBOLSO",
    "SUPPORT",
    "HANDOFF",
];

const SAC_STATES = ["support_sac", "support"];

const SALES_INTENTS: Intent[] = ["SALES"];

const SALES_STATES = ["proposal", "closing"];

/**
 * Loads the appropriate skill instructions for the given intent and conversation state.
 *
 * Returns the full markdown content of the skill file, or an empty string if
 * no skill applies to the current context (e.g. greeting, discovery, objection).
 *
 * The function is synchronous and uses an in-memory cache — the file is read
 * at most once per process lifetime.
 *
 * Injection order in the system prompt:
 *   soul → basePrompt → fewShots → [SKILL CONTENT] → contextSection → statePrompt
 */
export function loadSkill(intent: string, state: string): string {
    // SAC / support / handoff flow → load cancellation/returns/delays skill
    if (SAC_INTENTS.includes(intent as Intent) || SAC_STATES.includes(state)) {
        return loadSkillFile("SKILL_CANCELAMENTO.md");
    }

    // Sales flow in proposal or closing state → load inventory/recommendation skill
    if (SALES_INTENTS.includes(intent as Intent) && SALES_STATES.includes(state)) {
        return loadSkillFile("SKILL_ESTOQUE.md");
    }

    // SALES intent with a specific "proposal" or "closing" state already covered above.
    // Also cover the case where intent alone is SALES regardless of state naming.
    if (intent === "SALES" || SALES_STATES.includes(state)) {
        return loadSkillFile("SKILL_ESTOQUE.md");
    }

    // No skill needed for greeting, discovery, objection, clarification, post_sale
    return "";
}
