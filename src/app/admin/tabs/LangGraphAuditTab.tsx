"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ShadowLogEntry = {
    timestamp: string;
    category: "SHADOW";
    conversationId: string;
    storeId: string;
    action: string;
    result: "success" | "error";
    metadata: {
        runtimeMode?: string;
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
    };
};

type ApiResponse = {
    generatedAt: string;
    count: number;
    logs: ShadowLogEntry[];
};

function formatTime(ts: string): string {
    try {
        return new Date(ts).toLocaleTimeString("pt-BR");
    } catch {
        return ts;
    }
}

function truncate(text: string | undefined, max = 90): string {
    if (!text) return "-";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max)}...`;
}

export default function LangGraphAuditTab() {
    const [logs, setLogs] = useState<ShadowLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/metrics?type=logs&category=SHADOW&limit=200", {
                cache: "no-store",
            });

            if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(payload?.error || `HTTP ${res.status}`);
            }

            const data = (await res.json()) as ApiResponse;
            setLogs(Array.isArray(data.logs) ? data.logs : []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao carregar auditoria");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 5000);
        return () => clearInterval(id);
    }, [load]);

    const stats = useMemo(() => {
        const acc = {
            total: logs.length,
            shadowSuccess: 0,
            canaryRuns: 0,
            errors: 0,
            timeouts: 0,
            loops: 0,
            mockTool: 0,
            vendas: 0,
            sac: 0,
            avgLatencyMs: 0,
        };

        let latencySum = 0;
        let latencyCount = 0;

        for (const log of logs) {
            if (log.action === "SHADOW_COMPARE" && log.result === "success") acc.shadowSuccess++;
            if (log.action === "LANGGRAPH_CANARY_AUDIT" || log.action === "LANGGRAPH_ACTIVE_AUDIT") acc.canaryRuns++;
            if (log.result === "error") acc.errors++;
            if (log.metadata.timedOut === true) acc.timeouts++;
            if (log.metadata.langgraphLoopSignal === true) acc.loops++;
            if (log.metadata.langgraphUsedMockTool === true) acc.mockTool++;

            if (log.metadata.langgraphActiveAgent === "vendas") acc.vendas++;
            if (log.metadata.langgraphActiveAgent === "sac") acc.sac++;

            if (typeof log.metadata.durationMs === "number") {
                latencySum += log.metadata.durationMs;
                latencyCount++;
            }
        }

        if (latencyCount > 0) {
            acc.avgLatencyMs = Math.round(latencySum / latencyCount);
        }

        return acc;
    }, [logs]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-slate-100">
            <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-rounded text-emerald-400">route</span>
                    <h1 className="text-sm font-black uppercase tracking-widest">LangGraph Shadow Audit</h1>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={load}
                        disabled={loading}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                    >
                        {loading ? "Atualizando..." : "Atualizar"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-slate-800 px-6 py-4 md:grid-cols-5">
                <StatCard label="Logs" value={stats.total} tone="slate" />
                <StatCard label="Shadow OK" value={stats.shadowSuccess} tone="emerald" />
                <StatCard label="Erros/Timeout" value={stats.errors + stats.timeouts} tone="red" />
                <StatCard label="Loops" value={stats.loops} tone="amber" />
                <StatCard label="Latência Média" value={`${stats.avgLatencyMs}ms`} tone="blue" />
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-slate-800 px-6 py-4 md:grid-cols-4">
                <StatCard label="Rota Vendas" value={stats.vendas} tone="emerald" />
                <StatCard label="Rota SAC" value={stats.sac} tone="sky" />
                <StatCard label="Tool Mock" value={stats.mockTool} tone="amber" />
                <StatCard label="Canário Ativo" value={stats.canaryRuns} tone="violet" />
            </div>

            {error && (
                <div className="mx-6 mt-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                    Falha ao carregar auditoria: {error}
                </div>
            )}

            <div className="flex-1 overflow-auto px-6 py-4">
                {logs.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                        {loading
                            ? "Carregando logs de shadow..."
                            : "Nenhum log SHADOW ainda. Rode com AGENT_RUNTIME=shadow e converse com o Cadu."}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs
                            .slice()
                            .reverse()
                            .map((log, idx) => (
                                <div
                                    key={`${log.timestamp}-${log.conversationId}-${idx}`}
                                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                                >
                                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                        <Badge tone={log.result === "success" ? "emerald" : "red"}>
                                            {log.result.toUpperCase()}
                                        </Badge>
                                        <Badge tone="slate">{log.action}</Badge>
                                        <Badge tone="blue">{log.metadata.runtimeMode || "-"}</Badge>
                                        <Badge tone="violet">{log.metadata.langgraphActiveAgent || "sem-rota"}</Badge>
                                        {log.metadata.langgraphLoopSignal === true && (
                                            <Badge tone="amber">loop-signal</Badge>
                                        )}
                                        {log.metadata.langgraphUsedMockTool === true && (
                                            <Badge tone="amber">mock-tool</Badge>
                                        )}
                                        {log.metadata.timedOut === true && (
                                            <Badge tone="red">timeout</Badge>
                                        )}
                                        <span className="ml-auto font-mono text-slate-400">
                                            {formatTime(log.timestamp)} • {typeof log.metadata.durationMs === "number" ? `${log.metadata.durationMs}ms` : "-"}
                                        </span>
                                    </div>

                                    <div className="grid gap-3 text-xs md:grid-cols-2">
                                        <div className="space-y-1">
                                            <div className="text-slate-400">Legacy</div>
                                            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-slate-200">
                                                <div className="mb-1 font-mono text-[11px] text-slate-400">
                                                    action={log.metadata.legacyAction || "-"} • source={log.metadata.legacySource || "-"}
                                                </div>
                                                <div>{truncate(log.metadata.legacyPreview)}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-slate-400">LangGraph</div>
                                            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-slate-200">
                                                <div className="mb-1 font-mono text-[11px] text-slate-400">
                                                    tools={Array.isArray(log.metadata.langgraphToolNames) ? log.metadata.langgraphToolNames.join(",") || "-" : "-"}
                                                    {" • "}
                                                    summary={log.metadata.langgraphSummaryPresent ? "yes" : "no"}
                                                </div>
                                                <div>{truncate(log.metadata.langgraphPreview)}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {log.metadata.errorMessage && (
                                        <div className="mt-3 rounded-md border border-red-900/50 bg-red-950/40 p-2 text-xs text-red-200">
                                            {truncate(log.metadata.errorMessage, 240)}
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: string | number;
    tone: "slate" | "emerald" | "red" | "amber" | "blue" | "sky" | "violet";
}) {
    const toneMap: Record<typeof tone, string> = {
        slate: "border-slate-700 bg-slate-900 text-slate-100",
        emerald: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
        red: "border-red-900 bg-red-950/40 text-red-300",
        amber: "border-amber-900 bg-amber-950/30 text-amber-300",
        blue: "border-blue-900 bg-blue-950/30 text-blue-300",
        sky: "border-sky-900 bg-sky-950/30 text-sky-300",
        violet: "border-violet-900 bg-violet-950/30 text-violet-300",
    };

    return (
        <div className={`rounded-xl border px-3 py-2 ${toneMap[tone]}`}>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
            <div className="mt-1 text-xl font-black leading-none">{value}</div>
        </div>
    );
}

function Badge({
    children,
    tone,
}: {
    children: ReactNode;
    tone: "slate" | "emerald" | "red" | "amber" | "blue" | "violet";
}) {
    const toneMap: Record<typeof tone, string> = {
        slate: "border-slate-700 bg-slate-900 text-slate-300",
        emerald: "border-emerald-800 bg-emerald-950/40 text-emerald-300",
        red: "border-red-900 bg-red-950/40 text-red-300",
        amber: "border-amber-900 bg-amber-950/40 text-amber-300",
        blue: "border-blue-900 bg-blue-950/40 text-blue-300",
        violet: "border-violet-900 bg-violet-950/40 text-violet-300",
    };

    return (
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${toneMap[tone]}`}>
            {children}
        </span>
    );
}
