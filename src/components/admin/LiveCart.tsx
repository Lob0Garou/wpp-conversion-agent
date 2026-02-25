"use client";

import { ShoppingCart, Target, Flame, Search, Shield } from "lucide-react";
import type { InferredSlots } from "./parseTimeline";

interface LiveCartProps {
    slots: InferredSlots & { goal?: string; product?: string; orderId?: string };
    currentState?: string;
    frustrationLevel?: number;
    messageCount?: number;
}

const SLOT_CONFIG: Record<string, { label: string; colorClass: string }> = {
    marca: { label: "Marca", colorClass: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    categoria: { label: "Categoria", colorClass: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
    size: { label: "Tamanho", colorClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
    uso: { label: "Uso", colorClass: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    goal: { label: "Objetivo", colorClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    genero: { label: "Gênero", colorClass: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
    product: { label: "Produto", colorClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

function BuyingSignal({ slots, state }: { slots: number; state?: string }) {
    if (state === "support") {
        return (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/5 border border-amber-500/20 rounded-md text-[10px] text-amber-400 font-medium">
                <Shield size={12} />
                <span>Resolução de Problema</span>
            </div>
        );
    }

    if (state === "closing" || state === "proposal" || slots >= 3) {
        return (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-md text-[10px] text-emerald-400 font-medium">
                <Flame size={12} className="text-emerald-500" />
                <span>Alta Intenção de Compra</span>
            </div>
        );
    }

    if (slots >= 1 || state === "discovery") {
        return (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/5 border border-blue-500/20 rounded-md text-[10px] text-blue-400 font-medium">
                <Search size={12} />
                <span>Explorando</span>
            </div>
        );
    }

    return null;
}

function FrustrationGradient({ level }: { level: number }) {
    // level 0 to 3
    const percent = Math.min(level * 33, 100);

    return (
        <div className="w-full space-y-1">
            <div className="flex justify-between data-label uppercase font-bold tracking-wider">
                <span>Estresse</span>
                <span>{level > 0 ? `${level}/3` : "Normal"}</span>
            </div>
            <div className="relative h-1.5 w-full bg-background-dark dark:bg-background-dark rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 opacity-80" />
                {/* Mask to hide right side */}
                <div
                    className="absolute inset-y-0 right-0 bg-[var(--bg-surface)] transition-all duration-500"
                    style={{ left: `${percent}%` }}
                />
                {/* Marker */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white dark:bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-500 z-10"
                    style={{ left: `${percent}%` }}
                />
            </div>
        </div>
    );
}

export default function LiveCart({ slots, currentState, frustrationLevel = 0 }: LiveCartProps) {
    const slotEntries = Object.entries(SLOT_CONFIG)
        .filter(([key]) => !!(slots as Record<string, string | undefined>)[key])
        .map(([key, config]) => ({
            key,
            ...config,
            value: (slots as Record<string, string | undefined>)[key]!,
        }));

    const hasSlots = slotEntries.length > 0;

    return (
        <div className="space-y-4">

            {/* Header / Signal */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <ShoppingCart size={14} style={{ color: "var(--text-muted)" }} />
                    <span className="data-label uppercase tracking-wider">
                        Contexto
                    </span>
                </div>
                <BuyingSignal slots={slotEntries.length} state={currentState} />
            </div>

            {/* Slots List */}
            <div className="flex flex-wrap gap-2">
                {!hasSlots ? (
                    <span className="text-xs italic px-1" style={{ color: "var(--text-muted)" }}>
                        Aguardando dados...
                    </span>
                ) : (
                    slotEntries.map(({ key, label, value, colorClass }) => (
                        <div
                            key={key}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium max-w-full ${colorClass}`}
                        >
                            <span className="opacity-70 mr-1">{label}:</span>
                            <span className="truncate critical-value">{value}</span>
                        </div>
                    ))
                )}
            </div>

            {/* Frustration Meter */}
            <div className="pt-2 border-t border-border-light/50 dark:border-border-dark/50">
                <FrustrationGradient level={frustrationLevel} />
            </div>
        </div>
    );
}