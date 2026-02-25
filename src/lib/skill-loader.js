"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkill = loadSkill;
var fs = require("fs");
var path = require("path");
// ─── SKILL CACHE ────────────────────────────────────────────────────────────
// Skill files are read once per process and cached in memory.
// Skills live in {project_root}/skills/ — outside of src/ intentionally,
// so they can be edited without touching TypeScript source.
var skillCache = new Map();
function loadSkillFile(filename) {
    if (skillCache.has(filename)) {
        return skillCache.get(filename);
    }
    var skillPath = path.join(process.cwd(), "skills", filename);
    try {
        var content = fs.readFileSync(skillPath, "utf-8");
        skillCache.set(filename, content);
        return content;
    }
    catch (error) {
        console.error("[SKILLS] \u274C Failed to load skill file: ".concat(filename), error);
        skillCache.set(filename, ""); // Cache empty to avoid repeated failed reads
        return "";
    }
}
// ─── INTENT → SKILL MAPPING ──────────────────────────────────────────────────
var SAC_INTENTS = [
    "SAC_TROCA",
    "SAC_ATRASO",
    "SAC_RETIRADA",
    "SAC_REEMBOLSO",
    "SUPPORT",
    "HANDOFF",
];
var SAC_STATES = ["support_sac", "support"];
var SALES_INTENTS = ["SALES"];
var SALES_STATES = ["proposal", "closing"];
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
function loadSkill(intent, state) {
    // SAC / support / handoff flow → load cancellation/returns/delays skill
    if (SAC_INTENTS.includes(intent) || SAC_STATES.includes(state)) {
        return loadSkillFile("SKILL_CANCELAMENTO.md");
    }
    // Sales flow in proposal or closing state → load inventory/recommendation skill
    if (SALES_INTENTS.includes(intent) && SALES_STATES.includes(state)) {
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
