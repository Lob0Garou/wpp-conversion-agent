"use client";

import { ArrowRight, PackageSearch, UserCheck } from "lucide-react";
import type { SystemLogType, SystemLogData } from "./parseTimeline";

function fmtTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

interface SystemLogCardProps {
    logType: SystemLogType;
    data: SystemLogData;
    timestamp: string;
}

export default function SystemLogCard({ logType, data, timestamp }: SystemLogCardProps) {
    const time = fmtTime(timestamp);

    // ── Stock Check ───────────────────────────────────────────────
    if (logType === "stock_check") {
        const isFound = data.result === "found";
        const isUnknown = data.result === "unknown";

        return (
            <div className="flex justify-center my-3 w-full">
                <div className="max-w-md w-full bg-background-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md px-3 py-2 flex items-center justify-between gap-3 shadow-sm transition-all duration-500">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-5 h-5 rounded bg-background-dark dark:bg-background-dark flex items-center justify-center border border-border-light dark:border-border-dark flex-shrink-0">
                            <PackageSearch size={12} className="text-blue-500 dark:text-blue-400" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5" style={{ color: "var(--text-muted)" }}>
                                Verificação de Estoque
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                <span className="font-mono text-[11px] truncate max-w-[150px]">{data.query}</span>
                                <ArrowRight size={10} style={{ color: "var(--text-muted)" }} />
                                <span className={`${isFound ? "text-emerald-500 dark:text-emerald-400" : isUnknown ? "" : "text-rose-500 dark:text-rose-400"}`} style={isUnknown ? { color: "var(--text-muted)" } : undefined}>
                                    {isFound ? "[DISPONÍVEL]" : isUnknown ? "[INDEFINIDO]" : "[RUPTURA]"}
                                </span>
                            </div>
                        </div>
                    </div>
                    <span className="text-[9px] font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>{time}</span>
                </div>
            </div>
        );
    }

    // ── State Transition ──────────────────────────────────────────
    if (logType === "state_transition") {
        return (
            <div className="flex items-center justify-center my-4 opacity-60 hover:opacity-100 transition-opacity">
                <div className="bg-background-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full px-3 py-1 flex items-center gap-2 cursor-help" title={`Alterado às ${time}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted-light dark:bg-text-muted-dark" />
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted-light dark:text-text-muted-dark">
                        <span>{data.fromState}</span>
                        <ArrowRight size={8} />
                        <span className="text-text-main-light dark:text-text-main-dark">{data.toState}</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Handoff ───────────────────────────────────────────────────
    if (logType === "handoff") {
        return (
            <div className="flex justify-center my-4 w-full">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-3 max-w-sm w-full">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <UserCheck size={14} className="text-amber-400" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-amber-400 uppercase tracking-wide">Escalonado para Humano</div>
                        <div className="text-[10px] text-amber-400/70 mt-0.5">A IA interrompeu o fluxo e solicitou ajuda.</div>
                    </div>
                    <span className="ml-auto text-[9px] font-mono text-amber-500/40">{time}</span>
                </div>
            </div>
        );
    }

    return null;
}
