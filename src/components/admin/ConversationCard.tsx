"use client";

import { useRef } from "react";
import type { InferredSlots } from "./parseTimeline";
import CountdownTimer from "./CountdownTimer";

export interface ConversationCardData {
    id: string;
    customerName: string | null;
    customerPhone: string;
    lastMessage?: string;
    lastMessageAt?: string;
    status: string;
    intent?: string;
    frustrationLevel?: number;
    slots?: InferredSlots;
}

interface ConversationCardProps {
    data: ConversationCardData;
    isActive?: boolean;
    isDimmed?: boolean;
    onClick: () => void;
    onResolve?: () => void;
}

export function isSACConversation(data: ConversationCardData): boolean {
    const isPendingHuman = data.status === "PENDING_HUMAN" || data.status === "escalated";
    if (isPendingHuman) return true;
    const intent = (data.intent || "").toUpperCase();
    if (intent === "SUPPORT" || intent === "HANDOFF" || (data.frustrationLevel ?? 0) >= 2) return true;
    return false;
}

function getInitials(name: string) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function timeAgo(dateIso?: string) {
    if (!dateIso) return "agora";
    const ms = Date.now() - new Date(dateIso).getTime();
    if (ms < 60000) return "agora";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
}

// Returns shorter subject label for display inside card
function getSubject(data: ConversationCardData): string {
    const { slots, intent, lastMessage, customerName, customerPhone } = data;
    if (slots?.marca) return `${slots.marca}${slots.categoria ? " · " + slots.categoria : ""}${slots.size ? " · T" + slots.size : ""}`;
    const intentStr = (intent || "").toUpperCase();
    if (intentStr === "INFO_HOURS") return "Horário de Funcionamento";
    if (intentStr === "INFO_ADDRESS") return "Endereço / Localização";
    if (intentStr === "INFO_SAC_POLICY") return "Política de Troca / Devolução";
    if (intentStr === "DOUBT" || intentStr.startsWith("INFO")) return lastMessage?.slice(0, 60) || "Dúvida geral";
    if (intentStr === "HANDOFF" || intentStr === "SUPPORT") return "Solicitou atendimento humano";
    return lastMessage?.slice(0, 60) || customerName || `Cliente ${customerPhone.slice(-4)}`;
}

export default function ConversationCard({ data, isActive, isDimmed, onClick, onResolve }: ConversationCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const { customerName, customerPhone, lastMessageAt, slots, status, frustrationLevel } = data;

    // ── Tighter critical detection: only when explicitly escalated + frustrated ─
    const isExplicitEscalated = status === "escalated";
    const isHighFrustration = (frustrationLevel ?? 0) >= 2;
    // PENDING_HUMAN is common — only treat as red/critical if also high frustration or explicit escalation
    const isPendingHuman = status === "PENDING_HUMAN";
    const isSAC = isSACConversation(data);

    // "CRÍTICO" only when the card is truly alarming — otherwise it's just a SAC ticket
    const isCritical = isExplicitEscalated || (isPendingHuman && isHighFrustration);

    const intentStr = (data.intent || "").toUpperCase();

    let variant: "VENDAS" | "SAC" | "DUVIDAS" | "PENDENTE" = "PENDENTE";
    if (isSAC) variant = "SAC";
    else if (intentStr === "INFO" || intentStr.startsWith("INFO") || intentStr === "DOUBT") variant = "DUVIDAS";
    else if (slots?.categoria || slots?.marca) variant = "VENDAS";

    const variantStyle = {
        VENDAS: { border: "border-l-emerald-500", badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label: "VENDAS", avatarBg: "bg-emerald-900/40 border-emerald-500/20 text-emerald-300" },
        SAC: { border: "border-l-red-500", badge: "bg-red-500/15 border-red-500/30 text-red-400", label: "SAC", avatarBg: "bg-red-900/40 border-red-500/20 text-red-300" },
        DUVIDAS: { border: "border-l-blue-500", badge: "bg-blue-500/15 border-blue-500/30 text-blue-400", label: "DÚVIDAS", avatarBg: "bg-blue-900/40 border-blue-500/20 text-blue-300" },
        PENDENTE: { border: "border-l-slate-600", badge: "bg-slate-500/15 border-slate-500/30 text-slate-400", label: "GERAL", avatarBg: "bg-slate-800 border-slate-700 text-slate-400" },
    }[variant];

    const displayName = customerName || `Cliente ...${customerPhone.slice(-4)}`;
    const initials = getInitials(displayName);
    const subject = getSubject(data);

    // ── Wrapper classes ───────────────────────────────────────────────────────
    let wrapper = [
        "relative flex flex-col h-full rounded-2xl border border-[#2e3440] bg-[#111827]",
        "shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer",
        "border-l-4", variantStyle.border,
        "overflow-hidden",
    ].join(" ");

    // Critical: red glow border but NOT full red overlay — keeps it readable
    if (isCritical) {
        wrapper = [
            "relative flex flex-col h-full rounded-2xl shadow-lg transition-all duration-200 cursor-pointer overflow-hidden",
            "border-2 border-red-500/60 bg-[#111827]",
            "shadow-red-900/30",
        ].join(" ");
    }

    if (!isCritical) {
        if (isActive) wrapper += " scale-[1.01] ring-1 ring-white/10 z-20";
        else if (isDimmed) wrapper += " opacity-40 grayscale-[0.6] hover:opacity-80 hover:grayscale-0";
    }

    return (
        <div ref={cardRef} onClick={onClick} className={wrapper}>

            {/* Subtle red glow for critical — no opaque overlay */}
            {isCritical && (
                <div className="absolute inset-0 bg-red-600/5 pointer-events-none" />
            )}

            {/* ── INNER CONTENT ──────────────────────────────────────────────── */}
            <div className="relative z-10 flex flex-col h-full p-4 2xl:p-5 gap-3 2xl:gap-4">

                {/* TOP: Badge + Time */}
                <div className="flex items-center justify-between">
                    {isCritical ? (
                        <span className="px-2.5 py-1 rounded-md bg-red-600/20 border border-red-500/40 text-red-400 text-[10px] font-black uppercase tracking-widest animate-pulse">
                            CRÍTICO
                        </span>
                    ) : (
                        <span className={`px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest ${variantStyle.badge}`}>
                            {variantStyle.label}
                        </span>
                    )}

                    {isCritical && lastMessageAt ? (
                        <div className="flex items-center gap-1 bg-red-950/60 border border-red-500/40 text-red-400 font-mono text-xs font-bold px-2 py-0.5 rounded">
                            <span className="material-symbols-rounded text-sm">warning</span>
                            <CountdownTimer targetDateIso={lastMessageAt} containerRef={cardRef} defaultSlaMinutes={10} />
                        </div>
                    ) : (
                        <span className="text-[11px] text-slate-500 font-medium">{timeAgo(lastMessageAt)}</span>
                    )}
                </div>

                {/* MIDDLE: Client + Subject */}
                <div className="flex-1 flex flex-col gap-2 min-h-0">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Cliente</p>
                        <h3 className="text-xl font-black text-white leading-tight truncate">{displayName}</h3>
                    </div>

                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Assunto</p>
                        <p className="text-sm text-slate-300 font-medium line-clamp-2 leading-snug">{subject}</p>
                    </div>

                    {/* VENDAS: size chip */}
                    {variant === "VENDAS" && slots?.size && (
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tamanho</span>
                            <span className="bg-slate-800 border border-slate-700 text-white text-xs font-black px-2.5 py-0.5 rounded-lg">
                                {slots.size}
                            </span>
                        </div>
                    )}
                </div>

                {/* BOTTOM: Avatar + CTA Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 gap-3">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black border shrink-0 ${isCritical ? "bg-red-600 text-white border-red-500" : variantStyle.avatarBg}`}>
                            {initials}
                        </div>
                        <span className="text-xs text-slate-400 font-semibold truncate hidden xl:block max-w-[100px]">
                            {displayName}
                        </span>
                    </div>

                    {/* Action buttons */}
                    {status === "closed" ? (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 border border-slate-700 px-3 py-1.5 rounded-lg">
                            Encerrado
                        </span>
                    ) : isCritical ? (
                        <button
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white border border-red-400 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide shadow-lg shadow-red-900/40 active:scale-95 transition-all shrink-0"
                        >
                            <span className="material-symbols-rounded text-sm">priority_high</span>
                            Priorizar
                        </button>
                    ) : (
                        <button
                            onClick={e => { e.stopPropagation(); onResolve?.(); }}
                            className="flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 w-8 h-8 rounded-xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all shrink-0"
                            title={variant === "DUVIDAS" ? "Responder" : "Resolvido"}
                        >
                            <span className="material-symbols-rounded text-lg">check_circle</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
