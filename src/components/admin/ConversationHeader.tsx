"use client";

import type { InferredSlots } from "./parseTimeline";

interface ConversationHeaderProps {
    customerName: string | null;
    customerPhone: string;
    status: string;
    intent?: string;
    frustrationLevel?: number;
    slots?: InferredSlots;
    ticketNumber?: string | null;
}

export default function ConversationHeader({
    customerName,
    customerPhone,
    status,
    intent,
}: ConversationHeaderProps) {
    const isPending = status === "PENDING_HUMAN" || status === "escalated";

    return (
        <header className="flex-none px-6 py-4 flex justify-between items-center shadow-sm z-10" style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}>
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold">
                    {(customerName || "WA").slice(0, 2).toUpperCase()}
                </div>
                <div>
                    <h2 className="font-bold text-lg leading-tight text-text-main-light dark:text-text-main-dark">
                        {customerName ?? `+${customerPhone}`}
                    </h2>
                    <p className="text-xs text-text-muted-light dark:text-text-muted-dark">
                        {customerPhone}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {isPending && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/50">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-wider">Aguardando Humano</span>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <span className="material-symbols-rounded">phone</span>
                    </button>
                    <button className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <span className="material-symbols-rounded">more_vert</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
