import { PgBoss } from "pg-boss";
import crypto from "crypto";
import { prisma } from "./prisma";
import type { TelemetryEventType } from "@prisma/client";

// ─── Log Categories ─────────────────────────────────────────────────
export type LogCategory = "ORCHESTRATOR" | "TEMPLATE" | "LLM" | "GUARDRAIL" | "ACTION" | "WEBHOOK" | "SHADOW";

// ─── Structured Log Entry Interface ──────────────────────────────
export interface StructuredLogEntry {
    timestamp: string;
    category: LogCategory;
    conversationId: string;
    storeId: string;
    action: string;
    result: "success" | "error";
    metadata: Record<string, unknown>;
}

// ─── In-Memory Log Store (for real-time dashboard) ───────────────
const LOG_BUFFER: StructuredLogEntry[] = [];
const MAX_BUFFER_SIZE = 10000; // Keep last 10k entries

/**
 * Adds a log entry to the in-memory buffer for real-time dashboard access.
 * Thread-safe with simple array operations.
 */
function addToLogBuffer(entry: StructuredLogEntry): void {
    LOG_BUFFER.push(entry);
    // Trim buffer if exceeds max size
    if (LOG_BUFFER.length > MAX_BUFFER_SIZE) {
        LOG_BUFFER.shift();
    }
}

// ─── Singleton pg-boss ───────────────────────────────────────────

let boss: PgBoss | null = null;

/**
 * Retorna o pg-boss singleton.
 * Lança erro se TELEMETRY_ENABLED !== "true" — evita vazamento de
 * conexões em ambientes sem telemetria (ex: staging sem queue).
 */
async function getBoss(): Promise<PgBoss> {
    if (process.env.TELEMETRY_ENABLED !== "true") {
        throw new Error("[TELEMETRY] Telemetria desabilitada (TELEMETRY_ENABLED != true)");
    }
    if (!boss) {
        boss = new PgBoss(process.env.DATABASE_URL!);
        await boss.start();
        console.log("[TELEMETRY] pg-boss iniciado");
    }
    return boss;
}

// ─── Utilitários de hashing ──────────────────────────────────────

/** LGPD: nunca salvar telefone em claro nos eventos de telemetria */
export function hashPhone(phone: string): string {
    return crypto.createHash("sha256").update(phone).digest("hex");
}

/** Chave de dedupe única por (conversa × ciclo × tipo de evento) */
export function makeEventKey(
    conversationId: string,
    requestId: string,
    eventType: string
): string {
    return crypto
        .createHash("sha256")
        .update(`${conversationId}:${requestId}:${eventType}`)
        .digest("hex");
}

// ─── Tipos de payload ────────────────────────────────────────────

export interface EmitParams {
    storeId: string;
    conversationId: string;
    customerId: string;  // SHA-256 do telefone — responsabilidade do caller
    requestId: string;
    eventType: string;
    payload: Record<string, unknown>; // Serialized to JSON on persist
}

// ─── Fire-and-forget (NUNCA bloqueia o pipeline de resposta) ────

/**
 * Enfileira um evento de telemetria via pg-boss.
 * Função SÍNCRONA (void) — não usar await no route.ts.
 * Falhas são capturadas em .catch() e logadas sem propagar.
 */
export function emitTelemetry(params: EmitParams): void {
    const eventKey = makeEventKey(
        params.conversationId,
        params.requestId,
        params.eventType
    );

    // Não usar singletonKey — dedupe é responsabilidade do upsert no worker
    getBoss()
        .then(b =>
            b.send("telemetry.process", { ...params, eventKey })
        )
        .catch(err =>
            console.error("[TELEMETRY] ⚠️ Falha ao enfileirar evento:", err?.message ?? err)
        );
}

// ─── Worker (persistência assíncrona) ───────────────────────────

/**
 * Inicia o worker que consome a fila "telemetry.process" e persiste
 * os eventos no banco com upsert idempotente (eventKey UNIQUE).
 *
 * Chamar em: src/workers/telemetry.ts (produção)
 *         ou src/app/api/worker/route.ts (dev local)
 */
export async function startTelemetryWorker(): Promise<void> {
    const b = await getBoss();

    type TelemetryJobData = EmitParams & { eventKey: string };

    await b.work<TelemetryJobData>(
        "telemetry.process",
        { localConcurrency: 5 },
        async (jobs: import("pg-boss").Job<TelemetryJobData>[]) => {
            for (const job of jobs) {
                const {
                    storeId, conversationId, customerId,
                    requestId, eventType, payload, eventKey,
                } = job.data;

                // Upsert idempotente — eventKey é UNIQUE no banco
                await prisma.telemetryEvent.upsert({
                    where: { eventKey },
                    create: {
                        storeId,
                        conversationId,
                        customerId,
                        requestId,
                        channel: "whatsapp",
                        eventType: eventType as unknown as TelemetryEventType,
                        payload: payload as object,
                        eventKey,
                    },
                    update: {}, // já existe → ignora (dedupe)
                });

                console.log(
                    `[TELEMETRY] ✅ ${eventType} ` +
                    `conv=${conversationId.slice(0, 8)} req=${requestId.slice(0, 8)}`
                );
            }
        }
    );

    console.log("[TELEMETRY] 🔄 Worker ativo — aguardando jobs...");
}

// ─── Structured Logging Functions ───────────────────────────────────

/**
 * Base function for structured logging with required fields
 */
function createStructuredLog(
    category: LogCategory,
    conversationId: string,
    storeId: string,
    action: string,
    result: "success" | "error",
    metadata: Record<string, unknown>
): StructuredLogEntry {
    const entry: StructuredLogEntry = {
        timestamp: new Date().toISOString(),
        category,
        conversationId,
        storeId,
        action,
        result,
        metadata,
    };

    // Add to in-memory buffer for dashboard
    addToLogBuffer(entry);

    // Also log to console for debugging
    console.log(`[${category}] ${action} | conv=${conversationId.slice(0, 8)} | result=${result}`, metadata);

    return entry;
}

/**
 * Log orchestrator decisions (action, source, template hit/miss, LLM call, guardrail intervention)
 */
export function logOrchestratorDecision(params: {
    conversationId: string;
    storeId: string;
    action: string;
    source: "template" | "llm" | "guardrail_fallback" | "error";
    templateUsed?: string;
    llmModel?: string;
    guardrailRejected?: boolean;
    guardrailReason?: string;
    processingTimeMs?: number;
    result: "success" | "error";
    errorMessage?: string;
}): void {
    createStructuredLog(
        "ORCHESTRATOR",
        params.conversationId,
        params.storeId,
        `DECISION_${params.source.toUpperCase()}`,
        params.result,
        {
            action: params.action,
            source: params.source,
            templateUsed: params.templateUsed,
            llmModel: params.llmModel,
            guardrailRejected: params.guardrailRejected,
            guardrailReason: params.guardrailReason,
            processingTimeMs: params.processingTimeMs,
            errorMessage: params.errorMessage,
        }
    );
}

/**
 * Log template engine hit/miss events
 */
export function logTemplateHitMiss(params: {
    conversationId: string;
    storeId: string;
    action: string;
    intent: string;
    state: string;
    hit: boolean;
    templateId?: string;
    slotsMissing?: string[];
    result: "success" | "error";
}): void {
    createStructuredLog(
        "TEMPLATE",
        params.conversationId,
        params.storeId,
        params.hit ? "TEMPLATE_HIT" : "TEMPLATE_MISS",
        params.result,
        {
            action: params.action,
            intent: params.intent,
            state: params.state,
            hit: params.hit,
            templateId: params.templateId,
            slotsMissing: params.slotsMissing,
        }
    );
}

/**
 * Log LLM fallback events and reasons
 */
export function logLLMFallback(params: {
    conversationId: string;
    storeId: string;
    action: string;
    reason: "no_template" | "slots_missing" | "template_disabled" | "guardrail_rejection" | "success" | "error";
    model?: string;
    tokensUsed?: number;
    latencyMs?: number;
    result: "success" | "error";
    errorMessage?: string;
}): void {
    createStructuredLog(
        "LLM",
        params.conversationId,
        params.storeId,
        "LLM_FALLBACK",
        params.result,
        {
            action: params.action,
            reason: params.reason,
            model: params.model,
            tokensUsed: params.tokensUsed,
            latencyMs: params.latencyMs,
            errorMessage: params.errorMessage,
        }
    );
}

/**
 * Log guardrail interventions and rejections
 */
export function logGuardrailIntervention(params: {
    conversationId: string;
    storeId: string;
    action: string;
    approved: boolean;
    reason?: string;
    modifiedReply?: string;
    shouldEscalate?: boolean;
    retryCount?: number;
    checksPerformed?: string[];
    result: "success" | "error";
}): void {
    createStructuredLog(
        "GUARDRAIL",
        params.conversationId,
        params.storeId,
        params.approved ? "GUARDRAIL_APPROVED" : "GUARDRAIL_REJECTED",
        params.result,
        {
            action: params.action,
            approved: params.approved,
            reason: params.reason,
            modifiedReply: params.modifiedReply?.substring(0, 100), // Truncate for logging
            shouldEscalate: params.shouldEscalate,
            retryCount: params.retryCount,
            checksPerformed: params.checksPerformed,
        }
    );
}

/**
 * Log action decisions from action-decider
 */
export function logActionDecision(params: {
    conversationId: string;
    storeId: string;
    action: string;
    intent: string;
    state: string;
    slots: Record<string, unknown>;
    frustrationLevel: number;
    result: "success" | "error";
}): void {
    createStructuredLog(
        "ACTION",
        params.conversationId,
        params.storeId,
        "ACTION_DECIDED",
        params.result,
        {
            action: params.action,
            intent: params.intent,
            state: params.state,
            hasProduct: !!params.slots.product,
            hasSize: !!params.slots.size,
            hasUsage: !!params.slots.usage,
            frustrationLevel: params.frustrationLevel,
        }
    );
}

/**
 * Log webhook entry/exit for tracking request lifecycle
 */
export function logWebhookEvent(params: {
    conversationId: string;
    storeId: string;
    event: "ENTRY" | "EXIT" | "ERROR";
    message?: string;
    userMessage?: string;
    processingTimeMs?: number;
    result: "success" | "error";
}): void {
    createStructuredLog(
        "WEBHOOK",
        params.conversationId,
        params.storeId,
        params.event,
        params.result,
        {
            message: params.message,
            userMessage: params.userMessage?.substring(0, 50), // Truncate
            processingTimeMs: params.processingTimeMs,
        }
    );
}

/**
 * Log shadow-mode comparison events (Legacy x LangGraph) for rollout auditing.
 */
export function logShadowAudit(params: {
    conversationId: string;
    storeId: string;
    runtimeMode: "shadow" | "langgraph_canary" | "langgraph_active";
    result: "success" | "error";
    durationMs?: number;
    timedOut?: boolean;
    errorMessage?: string;
    legacyAction?: string;
    legacySource?: string;
    legacyPreview?: string;
    langgraphPreview?: string;
    langgraphActiveAgent?: string;
    langgraphToolCallsCount?: number;
    langgraphToolNames?: string[];
    langgraphUsedMockTool?: boolean;
    langgraphLoopSignal?: boolean;
    langgraphSummaryPresent?: boolean;
    langgraphSummaryLength?: number;
}): void {
    createStructuredLog(
        "SHADOW",
        params.conversationId,
        params.storeId,
        params.runtimeMode === "shadow"
            ? "SHADOW_COMPARE"
            : params.runtimeMode === "langgraph_active"
                ? "LANGGRAPH_ACTIVE_AUDIT"
                : "LANGGRAPH_CANARY_AUDIT",
        params.result,
        {
            runtimeMode: params.runtimeMode,
            durationMs: params.durationMs,
            timedOut: params.timedOut ?? false,
            errorMessage: params.errorMessage,
            legacyAction: params.legacyAction,
            legacySource: params.legacySource,
            legacyPreview: params.legacyPreview?.substring(0, 180),
            langgraphPreview: params.langgraphPreview?.substring(0, 180),
            langgraphActiveAgent: params.langgraphActiveAgent,
            langgraphToolCallsCount: params.langgraphToolCallsCount,
            langgraphToolNames: params.langgraphToolNames,
            langgraphUsedMockTool: params.langgraphUsedMockTool,
            langgraphLoopSignal: params.langgraphLoopSignal,
            langgraphSummaryPresent: params.langgraphSummaryPresent,
            langgraphSummaryLength: params.langgraphSummaryLength,
        }
    );
}

// ─── Dashboard Metrics Access ───────────────────────────────────────

/**
 * Get recent logs for dashboard display
 */
export function getRecentLogs(limit: number = 100, category?: LogCategory): StructuredLogEntry[] {
    let logs = LOG_BUFFER;
    if (category) {
        logs = logs.filter(log => log.category === category);
    }
    return logs.slice(-limit);
}

/**
 * Get aggregated metrics from log buffer
 */
export function getMetricsSummary() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter logs from last hour
    const recentLogs = LOG_BUFFER.filter(log => new Date(log.timestamp).getTime() > oneHourAgo);

    // Template metrics
    const templateLogs = recentLogs.filter(log => log.category === "TEMPLATE");
    const templateHits = templateLogs.filter(log => log.metadata.hit === true).length;
    const templateMisses = templateLogs.filter(log => log.metadata.hit === false).length;

    // LLM metrics
    const llmLogs = recentLogs.filter(log => log.category === "LLM");
    const llmFallbacks = llmLogs.length;
    const llmErrors = llmLogs.filter(log => log.result === "error").length;

    // Guardrail metrics
    const guardrailLogs = recentLogs.filter(log => log.category === "GUARDRAIL");
    const guardrailRejections = guardrailLogs.filter(log => log.metadata.approved === false).length;
    const guardrailApproved = guardrailLogs.filter(log => log.metadata.approved === true).length;

    // Action metrics
    const actionLogs = recentLogs.filter(log => log.category === "ACTION");
    const actionCounts = actionLogs.reduce((acc, log) => {
        const action = log.metadata.action as string;
        acc[action] = (acc[action] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Orchestrator metrics
    const orchestratorLogs = recentLogs.filter(log => log.category === "ORCHESTRATOR");
    const sourceCounts = orchestratorLogs.reduce((acc, log) => {
        const source = log.metadata.source as string;
        acc[source] = (acc[source] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return {
        timeRange: "1h",
        generatedAt: new Date().toISOString(),
        template: {
            hits: templateHits,
            misses: templateMisses,
            hitRate: templateLogs.length > 0 ? (templateHits / templateLogs.length * 100).toFixed(2) + "%" : "N/A",
        },
        llm: {
            fallbacks: llmFallbacks,
            errors: llmErrors,
            errorRate: llmLogs.length > 0 ? (llmErrors / llmLogs.length * 100).toFixed(2) + "%" : "N/A",
        },
        guardrail: {
            approved: guardrailApproved,
            rejected: guardrailRejections,
            rejectionRate: guardrailLogs.length > 0 ? (guardrailRejections / guardrailLogs.length * 100).toFixed(2) + "%" : "N/A",
        },
        actions: actionCounts,
        sources: sourceCounts,
        totalLogs: recentLogs.length,
    };
}

/**
 * Clear log buffer (for testing)
 */
export function clearLogBuffer(): void {
    LOG_BUFFER.length = 0;
}
