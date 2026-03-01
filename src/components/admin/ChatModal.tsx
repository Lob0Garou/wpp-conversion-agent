"use client";

import { X, Search, CheckCircle2, ShoppingBag } from "lucide-react";
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
    conversationId,
    customerName,
    customerPhone,
    status,
    messages,
    intent,
    frustrationLevel,
    slots,
    ticketNumber,
    onReplySent,
    onClose,
    onResolve,
}: ChatModalProps) {
    const displayName = customerName || `Cliente ...${customerPhone.slice(-4)}`;
    const initials = displayName
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();

    const productTitle = slots?.marca ? `${slots.marca} ${slots.categoria || ""}`.trim() : null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 md:p-6 overflow-hidden">
            <div className="bg-[var(--bg-deep)] w-full max-w-[1320px] h-[95vh] md:h-[92vh] rounded-xl md:rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col md:flex-row">
                <div className="flex-1 flex flex-col h-full bg-[var(--bg-deep)] min-w-0">
                    <div className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/55 shrink-0">
                        <div className="flex items-center gap-3 min-w-0 pr-3">
                            <div className="w-10 h-10 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center font-bold text-[var(--text-secondary)] text-sm shrink-0">
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <h2 className="font-semibold text-[var(--text-primary)] leading-tight truncate">
                                    {displayName}
                                </h2>
                                <p className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--text-muted)] truncate">
                                    {status === "PENDING_HUMAN" ? "Aguardando Atendimento" : "Cliente"} - +{customerPhone}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="h-9 w-9 rounded-lg border border-[var(--border-default)] flex items-center justify-center transition-all hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            style={{ color: "var(--text-muted)" }}
                            aria-label="Fechar chat"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

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
                            onSaleClosed={onReplySent}
                        />
                    </div>
                </div>

                <aside className="flex w-full md:w-80 shrink-0 flex-col border-t md:border-t-0 md:border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]/30">
                    <div className="flex-1 p-6">
                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-overlay)]/20 text-[var(--text-muted)] text-center px-4">
                            {productTitle ? (
                                <>
                                    <ShoppingBag className="w-12 h-12 mb-4 opacity-70" />
                                    <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest">
                                        Produto Identificado
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Search className="w-12 h-12 mb-4 opacity-50" />
                                    <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest">
                                        Aguardando Dados
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/55 p-6">
                        <div className="mb-6 text-center">
                            <p className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                                {productTitle ? "Produto" : "Informacoes"}
                            </p>
                            <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-tight">
                                {productTitle || "Produto nao identificado"}
                            </h3>
                            {slots?.size && productTitle && (
                                <div className="flex items-center justify-center gap-1.5 mt-2 text-[var(--text-muted)]">
                                    <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest">Tam. {slots.size}</span>
                                </div>
                            )}
                            {!productTitle && (
                                <p className="text-[var(--text-sm)] text-[var(--text-muted)] leading-relaxed mt-2">
                                    O produto sera identificado conforme a conversa avanca.
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 w-full">
                            {productTitle && (
                                <button
                                    className="flex w-full items-center justify-center gap-2 rounded-xl text-white font-bold py-3 text-[var(--text-xs)] uppercase tracking-widest transition-all active:scale-95 hover:brightness-110 shadow-lg"
                                    style={{
                                        background: "var(--color-brand)",
                                        boxShadow: "0 12px 22px rgba(227, 0, 15, 0.30)",
                                    }}
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Confirmar Reserva
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    onResolve?.();
                                    onClose();
                                }}
                                className="flex w-full items-center justify-center gap-2 rounded-xl text-white font-bold py-3 text-[var(--text-xs)] uppercase tracking-widest transition-all active:scale-95 hover:brightness-110 shadow-lg"
                                style={{
                                    background: "var(--color-success)",
                                    boxShadow: "0 12px 22px rgba(22, 163, 74, 0.30)",
                                }}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Resolvido
                            </button>

                            <button
                                className="w-full py-2.5 rounded-xl border text-[var(--text-xs)] font-bold uppercase tracking-[0.2em] transition-colors hover:bg-[var(--bg-elevated)]"
                                style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                            >
                                Consultar Outra Unidade
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
