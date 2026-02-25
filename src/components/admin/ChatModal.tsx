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
                    className="absolute top-6 left-6 z-50 p-2 text-slate-400 hover:text-[#E3000F] transition-colors"
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
                <div className="flex-[0.35] bg-slate-50 dark:bg-slate-800/30 border-l border-slate-100 dark:border-slate-800/50 flex flex-col p-12">
                    <div className="flex-1 flex flex-col items-center">

                        {/* Product image placeholder */}
                        <div className="w-full aspect-square bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-sm overflow-hidden flex items-center justify-center p-8 group mb-8 border border-slate-100 dark:border-slate-800/50">
                            <span className="material-symbols-rounded text-[100px] text-slate-200 dark:text-slate-700 group-hover:scale-110 transition-transform duration-700">
                                inventory_2
                            </span>
                        </div>

                        {/* Product title */}
                        <div className="text-center space-y-4 mb-12">
                            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                                {productTitle || "Produto"}
                            </h1>
                            {slots?.size && (
                                <div className="flex items-center justify-center gap-2 text-slate-400">
                                    <span className="material-symbols-rounded text-lg">straighten</span>
                                    <span className="text-sm font-bold uppercase tracking-widest">
                                        Tamanho {slots.size}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                                <span className="material-symbols-rounded text-lg">location_on</span>
                                <span className="text-sm font-bold uppercase tracking-widest">
                                    Loja Ibirapuera
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── CTA Buttons (Stitch: 3 buttons) ───────────────── */}
                    <div className="space-y-4 w-full">
                        {/* Primary CTA */}
                        <button className="w-full bg-[#E3000F] hover:bg-red-700 text-white font-black py-6 rounded-2xl shadow-2xl shadow-red-500/30 transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-widest active:scale-95">
                            <span className="material-symbols-rounded">task_alt</span>
                            Confirmar Reserva
                        </button>

                        {/* Success CTA */}
                        <button
                            onClick={() => { onResolve?.(); onClose(); }}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-6 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-widest active:scale-95"
                        >
                            <span className="material-symbols-rounded">check_circle</span>
                            ✓ Resolvido
                        </button>

                        {/* Ghost CTA */}
                        <button className="w-full py-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-xs uppercase tracking-[0.2em] transition-colors">
                            Consultar Outra Unidade
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
