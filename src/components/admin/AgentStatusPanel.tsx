"use client";

import { MessageSquare, PackageSearch, Shield, User } from "lucide-react";

interface AgentStatusPanelProps {
    intent?: string;
    state?: string;
    status: string;
}

const AgentChip = ({
    active,
    colorClass,
    icon: Icon,
    label,
    subLabel
}: {
    active: boolean;
    colorClass: string;
    icon: React.ElementType;
    label: string;
    subLabel: string
}) => (
    <div className={`flex flex-1 items-center gap-2 px-2 py-2 rounded-lg border transition-all duration-500 ${active
        ? `${colorClass} shadow-sm bg-opacity-10 border-opacity-30`
        : "bg-transparent border-transparent text-text-muted-light dark:text-text-muted-dark opacity-40 grayscale"
        }`}>
        <div className="relative">
            <Icon size={16} />
            {active && (
                <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse border border-[var(--bg-ring)] bg-current`} />
            )}
        </div>
        <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none opacity-80">{label}</span>
            <span className="text-[10px] font-medium leading-tight truncate">{subLabel}</span>
        </div>
    </div>
);

export default function AgentStatusPanel({ intent, state, status }: AgentStatusPanelProps) {
    // Logic to determine active agent context
    const isHumanPending = status === "PENDING_HUMAN" || status === "escalated";
    const isSupport = !isHumanPending && (intent === "SUPPORT" || intent === "HANDOFF" || state === "support");
    // Sales is default if not support/human
    const isSales = !isHumanPending && !isSupport;

    return (
        <div className="flex items-center gap-1 p-2 mb-4 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl shadow-sm select-none">

            {/* 1. AGENTE VENDEDOR (Cadu) */}
            <AgentChip
                active={isSales}
                colorClass="bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                icon={MessageSquare}
                label="Vendedor"
                subLabel="Cadu (IA)"
            />

            <div className="w-px h-6 bg-[var(--border-default)]" />

            {/* 2. AGENTE ESTOQUE (Tool) - Always subtle/active as a service */}
            <div className={`flex flex-1 items-center gap-2 px-2 py-2 rounded-lg border border-transparent text-text-muted-light dark:text-text-muted-dark opacity-80`}>
                <div className="relative">
                    <PackageSearch size={16} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-[var(--bg-ring)]" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider leading-none opacity-70">Sistema</span>
                    <span className="text-[10px] font-medium leading-tight truncate">Estoque</span>
                </div>
            </div>

            <div className="w-px h-6 bg-border-light dark:bg-border-dark" />

            {/* 3. AGENTE SAC (Suporte/Humano) */}
            <AgentChip
                active={isHumanPending || isSupport}
                colorClass={isHumanPending ? "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400" : "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400"}
                icon={isHumanPending ? User : Shield}
                label={isHumanPending ? "Humano" : "Suporte"}
                subLabel={isHumanPending ? "Atendente" : "Auto-SAC"}
            />

        </div>
    );
}
