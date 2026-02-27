"use client";

import ChatTimeline from "./ChatTimeline";
import type { RawMessage, InferredSlots } from "./parseTimeline";

interface ChatModalProps {
    conversationId: string;
    customerName: string | null;
    customerPhone: string;
    status: string;
    messages: RawMessage[];
    intent?: string;
    frustrationLevel?: number;
    slots?: InferredSlots;
    ticketNumber?: string | null;
    onReplySent: () => void;
    onClose: () => void;
    onResolve?: () => void;
}

export default function ChatModal({
    conversationId, customerName, customerPhone, status, messages, intent, frustrationLevel, slots, ticketNumber, onReplySent, onClose, onResolve
}: ChatModalProps) {

    const displayName = customerName || `Cliente ...${customerPhone.slice(-4)}`;
    const initials = displayName.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
    const productTitle = slots?.marca ? `${slots.marca} ${slots.categoria || ""}`.trim() : null;

    return (
        /* ── Backdrop ─────────────────────────────────────────────────── */
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-0 md:p-12 overflow-hidden">

            {/* ── Modal shell — matches Stitch: white bg + rounded-[2.5rem] ── */}
            <div className="bg-white dark:bg-slate-900 w-full max-w-[1400px] h-full md:h-[90vh] rounded-none md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row relative">

                {/* Close button — top-left, absolute */}
                <button
                    onClick={onClose}
                    className="absolute top-6 left-6 z-50 p-2 text-slate-400 hover:text-[var(--color-brand)] transition-colors"
                >
                    <span className="material-symbols-rounded text-3xl">close</span>
                </button>

                {/* ── LEFT: Chat panel (65%) ─────────────────────────────── */}
                <div className="flex-[0.65] flex flex-col h-full bg-white dark:bg-slate-900 relative">

                    {/* Chat Header */}
                    <div className="h-24 px-12 flex items-center border-b border-slate-50 dark:border-slate-800/50 shrink-0">
                        <div className="flex items-center gap-4 ml-12">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-base">
                                {initials}
                            </div>
                            <div>
                                <h2 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
                                    {displayName}
                                </h2>
                                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    {status === "PENDING_HUMAN" ? "Aguardando Atendimento" : "Cliente"} • +{customerPhone}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Chat Timeline (scrollable) */}
                    <div className="flex-1 relative overflow-hidden">
                        <ChatTimeline
                            conversationId={conversationId}
                            customerName={customerName}
                            customerPhone={customerPhone}
                            status={status}
                            messages={messages}
                            intent={intent}
                            frustrationLevel={frustrationLevel}
                            slots={slots}
                            ticketNumber={ticketNumber}
                            onReplySent={onReplySent}
                        />
                    </div>
                </div>

                {/* ── RIGHT: Product focus panel (35%) ──────────────────── */}
                <div className="flex-[0.35] bg-slate-50 dark:bg-slate-800/30 border-l border-slate-100 dark:border-slate-800/50 flex flex-col p-8">
                    <div className="flex-1 flex flex-col items-center justify-center">

                        {/* ── Product visual ─────────────────────────────── */}
                        <div className="w-full aspect-[4/3] bg-white dark:bg-slate-900 rounded-3xl shadow-sm overflow-hidden flex flex-col items-center justify-center p-6 mb-6 border border-slate-100 dark:border-slate-800/50">
                            {productTitle ? (
                                <>
                                    <span className="material-symbols-rounded text-6xl text-slate-300 dark:text-slate-600 mb-3">
                                        shopping_bag
                                    </span>
                                    <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-slate-400">
                                        Produto Identificado
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-rounded text-5xl text-slate-200 dark:text-slate-700 mb-3">
                                        help_center
                                    </span>
                                    <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600">
                                        Aguardando Dados
                                    </span>
                                </>
                            )}
                        </div>

                        {/* ── Product details ────────────────────────────── */}
                        <div className="text-center space-y-3 mb-8 w-full">
                            {/* Label tier */}
                            <p className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                {productTitle ? "Produto" : "Informações"}
                            </p>

                            {/* Title tier */}
                            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                                {productTitle || "Produto não identificado"}
                            </h1>

                            {/* Detail rows — only when we have product data */}
                            {productTitle && (
                                <div className="space-y-2 pt-2">
                                    {slots?.size && (
                                        <div className="flex items-center justify-center gap-2 text-slate-400">
                                            <span className="material-symbols-rounded text-base">straighten</span>
                                            <span className="text-[var(--text-sm)] font-bold uppercase tracking-widest">
                                                Tam. {slots.size}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-center gap-2 text-slate-400">
                                        <span className="material-symbols-rounded text-base">location_on</span>
                                        <span className="text-[var(--text-sm)] font-bold uppercase tracking-widest">
                                            Reserva na Loja
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Empty state helper — when no product data */}
                            {!productTitle && (
                                <p className="text-[var(--text-sm)] text-slate-400 leading-relaxed mt-2">
                                    O produto será identificado conforme a conversa avança.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── CTA Buttons ────────────────────────────────────── */}
                    <div className="space-y-3 w-full">
                        {/* Primary CTA — only if product exists */}
                        {productTitle && (
                            <button className="w-full bg-[var(--color-brand)] hover:brightness-110 text-white font-black py-4 rounded-2xl shadow-2xl shadow-red-500/30 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest active:scale-95">
                                <span className="material-symbols-rounded text-xl">task_alt</span>
                                Confirmar Reserva
                            </button>
                        )}

                        {/* Success CTA */}
                        <button
                            onClick={() => { onResolve?.(); onClose(); }}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest active:scale-95"
                        >
                            <span className="material-symbols-rounded text-xl">check_circle</span>
                            Resolvido
                        </button>

                        {/* Ghost CTA */}
                        <button className="w-full py-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-[var(--text-xs)] uppercase tracking-[0.2em] transition-colors">
                            Consultar Outra Unidade
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
