"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, RefreshCw, ShoppingBag, Headphones, Clock } from "lucide-react";
import type { InferredSlots } from "@/components/admin/parseTimeline";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface RawConv {
    id: string;
    customerName: string | null;
    customerPhone: string;
    status: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    frustrationLevel: number | null;
    slots: InferredSlots | null;
    conversationType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SLA_MS = 30 * 60 * 1000; // 30 min

function isExpired(conv: RawConv): boolean {
    if (!conv.lastMessageAt) return false;
    return Date.now() - new Date(conv.lastMessageAt).getTime() > SLA_MS;
}

function isSAC(conv: RawConv): boolean {
    return (
        conv.status === "PENDING_HUMAN" ||
        conv.status === "escalated" ||
        conv.slots?.intent === "support" ||
        conv.conversationType === "sac"
    );
}

function formatElapsed(lastMessageAt: string | null): string {
    if (!lastMessageAt) return "—";
    const ms = Date.now() - new Date(lastMessageAt).getTime();
    const totalMin = Math.floor(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m atrás`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LostCard
// ─────────────────────────────────────────────────────────────────────────────
interface LostCardProps {
    conv: RawConv;
    type: "vendas" | "sac";
}

function LostCard({ conv, type }: LostCardProps) {
    const elapsed = formatElapsed(conv.lastMessageAt);
    const title =
        conv.slots?.categoria ||
        conv.slots?.marca ||
        conv.customerName ||
        `…${conv.customerPhone.slice(-4)}`;
    const initials = (conv.customerName ?? "WA").slice(0, 2).toUpperCase();
    const isPending = conv.status === "PENDING_HUMAN" || conv.status === "escalated";

    const accentColor = type === "sac" ? "#E31D1A" : "#f59e0b";
    const accentBg = type === "sac" ? "bg-[#E31D1A]/8" : "bg-amber-500/8";
    const borderColor = type === "sac" ? "border-[#E31D1A]/30" : "border-amber-500/30";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={`rounded-xl border p-3.5 flex flex-col gap-2 ${accentBg} ${borderColor}`}
        >
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#2e3440] flex items-center justify-center text-[10px] font-bold text-[#8892a0] shrink-0">
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{title}</p>
                        {isPending && (
                            <span className="text-[9px] font-black uppercase border border-[#E31D1A]/40 text-[#E31D1A] px-1 rounded">
                                ESCALADO
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono font-bold" style={{ color: accentColor }}>
                    <Clock className="w-3 h-3" />
                    <span>{elapsed}</span>
                </div>
            </div>

            {/* Last message */}
            <p className="text-[11px] text-[#8892a0] line-clamp-2 leading-relaxed">
                &ldquo;{conv.lastMessage || "Nenhuma mensagem"}&rdquo;
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-[#2e3440]">
                <span className="text-[10px] text-[#8892a0] font-mono">
                    +{conv.customerPhone.slice(0, 2)} {conv.customerPhone.slice(2, 4)} {conv.customerPhone.slice(4, 9)}...
                </span>
                {(conv.frustrationLevel ?? 0) >= 2 && (
                    <div className="flex items-center gap-0.5 text-amber-400 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        Frustrado
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Column
// ─────────────────────────────────────────────────────────────────────────────
interface ColumnProps {
    type: "vendas" | "sac";
    convs: RawConv[];
}

function LostColumn({ type, convs }: ColumnProps) {
    const isVendas = type === "vendas";
    const Icon = isVendas ? ShoppingBag : Headphones;
    const accentColor = isVendas ? "text-amber-400" : "text-[#E31D1A]";
    const badgeBg = isVendas ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-[#E31D1A]/15 text-[#E31D1A] border-[#E31D1A]/30";
    const label = isVendas ? "Vendas" : "SAC";
    const borderLine = isVendas ? "border-amber-500/20" : "border-[#E31D1A]/20";

    return (
        <div className={`flex-1 flex flex-col min-w-0 border-r last:border-r-0 ${borderLine}`}>
            {/* Column header */}
            <div className="px-5 py-4 flex items-center gap-3 border-b border-[#2e3440] shrink-0">
                <Icon className={`w-4 h-4 ${accentColor}`} />
                <h2 className={`text-xs font-black uppercase tracking-widest ${accentColor}`}>
                    {label}
                </h2>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeBg}`}>
                    {convs.length}
                </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
                {convs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#2e3440]">
                        <Icon className="w-8 h-8 opacity-40" />
                        <p className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                            Nenhuma conversa perdida
                        </p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {convs.map(c => (
                            <LostCard key={c.id} conv={c} type={type} />
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PerdidosTab
// ─────────────────────────────────────────────────────────────────────────────
export default function PerdidosTab() {
    const [conversations, setConversations] = useState<RawConv[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/conversations", { cache: "no-store" });
            if (res.ok) setConversations(await res.json());
        } catch {
            // silencioso
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 10_000);
        return () => clearInterval(id);
    }, [load]);

    // Filter: SLA expired
    const expired = useMemo(() => conversations.filter(isExpired), [conversations]);

    const vendasLost = useMemo(
        () => expired.filter(c => !isSAC(c)).sort(
            (a, b) => new Date(a.lastMessageAt ?? 0).getTime() - new Date(b.lastMessageAt ?? 0).getTime()
        ),
        [expired]
    );

    const sacLost = useMemo(
        () => expired.filter(c => isSAC(c)).sort(
            (a, b) => new Date(a.lastMessageAt ?? 0).getTime() - new Date(b.lastMessageAt ?? 0).getTime()
        ),
        [expired]
    );

    const totalLost = expired.length;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#0f1117]">

            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <div className="px-6 py-4 flex items-center gap-4 border-b border-[#2e3440] shrink-0">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#E31D1A]" />
                    <h1 className="text-sm font-black uppercase tracking-widest text-white">
                        Conversas Perdidas
                    </h1>
                </div>

                {/* Counter pills */}
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1.5 rounded-xl border border-[#E31D1A]/25 bg-[#E31D1A]/10 flex items-center gap-1.5">
                        <span className="text-[9px] uppercase font-black tracking-widest text-[#E31D1A]/80">Total</span>
                        <span className="text-base font-black text-white">{totalLost}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 flex items-center gap-1.5">
                        <ShoppingBag className="w-3 h-3 text-amber-400" />
                        <span className="text-base font-black text-white">{vendasLost.length}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl border border-[#E31D1A]/25 bg-[#E31D1A]/10 flex items-center gap-1.5">
                        <Headphones className="w-3 h-3 text-[#E31D1A]" />
                        <span className="text-base font-black text-white">{sacLost.length}</span>
                    </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <p className="text-[10px] text-[#8892a0] uppercase tracking-wide hidden lg:block">
                        SLA &gt; 30 min sem resposta
                    </p>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="p-1.5 rounded-lg bg-[#1a1d23] border border-[#2e3440] hover:bg-[#242830] opacity-70 hover:opacity-100 transition-all"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 text-[#8892a0] ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* ── Two-column layout ───────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden">
                <LostColumn type="vendas" convs={vendasLost} />
                <LostColumn type="sac" convs={sacLost} />
            </div>
        </div>
    );
}
