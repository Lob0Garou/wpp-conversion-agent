"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Bot, CheckCircle, X, Package, HeadphonesIcon } from "lucide-react";
import CustomerBubble from "./CustomerBubble";
import AgentBubble from "./AgentBubble";
import SystemLogCard from "./SystemLogCard";
import ReplyBox from "./ReplyBox";
import TypingIndicator from "./TypingIndicator";
import { parseTimelineItems, type RawMessage, type InferredSlots } from "./parseTimeline";

interface ChatTimelineProps {
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
    onSaleClosed?: () => void;
}

export default function ChatTimeline({
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
    onSaleClosed,
}: ChatTimelineProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Tick every second
    const [now, setNow] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Auto-scroll on new messages
    useEffect(() => {
        if (!containerRef.current || !bottomRef.current) return;
        const c = containerRef.current;
        if (c.scrollHeight - c.scrollTop - c.clientHeight < 400) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages.length]);

    const timelineItems = parseTimelineItems(messages);

    const lastOutbound = [...messages].reverse().find(m => m.direction === "outbound");
    const currentIntent = intent || lastOutbound?.metadata?.intent;

    // Show typing indicator when last message is recent inbound (< 20s) and not in human mode
    const lastMsg = messages[messages.length - 1];
    const isPending = status === "PENDING_HUMAN" || status === "escalated";
    const isTyping =
        now > 0 &&
        !isPending &&
        lastMsg?.direction === "inbound" &&
        (now - new Date(lastMsg.timestamp).getTime()) < 20_000;

    const typingType: "sales" | "sac" =
        currentIntent === "SUPPORT" || currentIntent === "HANDOFF" ? "sac" : "sales";

    // Modal Fechar Venda
    const [showSaleModal, setShowSaleModal] = useState(false);
    const [saleDesc, setSaleDesc] = useState(slots?.categoria ?? "");
    const [salePrice, setSalePrice] = useState("");
    const [saleQty, setSaleQty] = useState("1");
    const [saleLoading, setSaleLoading] = useState(false);
    const [saleError, setSaleError] = useState("");

    useEffect(() => {
        if (slots?.categoria && !saleDesc) setSaleDesc(slots.categoria);
    }, [slots?.categoria, saleDesc]);

    const handleCloseSale = useCallback(async () => {
        if (!saleDesc || !salePrice) {
            setSaleError("Preencha produto e preço");
            return;
        }
        const price = parseFloat(salePrice.replace(",", "."));
        if (isNaN(price) || price <= 0) {
            setSaleError("Preço inválido");
            return;
        }
        setSaleLoading(true);
        setSaleError("");
        try {
            const res = await fetch("/api/sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId,
                    productDescription: saleDesc,
                    quantity: parseInt(saleQty) || 1,
                    unitPrice: price,
                }),
            });
            if (!res.ok) {
                const err = await res.json() as { error?: string };
                throw new Error(err.error ?? "Erro ao fechar venda");
            }
            setShowSaleModal(false);
            setSaleDesc(""); setSalePrice(""); setSaleQty("1");
            onSaleClosed?.();
            onReplySent();
        } catch (e) {
            setSaleError(e instanceof Error ? e.message : "Erro desconhecido");
        } finally {
            setSaleLoading(false);
        }
    }, [conversationId, saleDesc, salePrice, saleQty, onSaleClosed, onReplySent]);

    const isActive = !isPending && status !== "closed";
    const agentLabel = isPending ? "Aguardando Atendimento" : currentIntent === "SUPPORT" || currentIntent === "HANDOFF" ? "Cadu • SAC" : "Cadu • Vendas";

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-base)" }}>

            {/* Messages area */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar"
                style={{ background: "var(--bg-surface)" }}
            >
                {/* System Message Divider */}
                <div className="flex justify-center mb-10 mt-2">
                    <span className="text-[10px] font-black px-4 py-1.5 rounded-full flex items-center gap-2 border shadow-sm uppercase tracking-widest" style={{ background: "var(--color-ai-sales-bg)", color: "var(--color-ai-sales)", borderColor: "var(--color-ai-sales-border)" }}>
                        <Bot className="w-3.5 h-3.5" />
                        {agentLabel} assumiu o atendimento
                    </span>
                </div>

                {timelineItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                        <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4" style={{ background: "var(--bg-elevated)" }}>
                            <MessageSquare size={32} style={{ color: "var(--text-muted)" }} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Iniciando nova conversa...</p>
                    </div>
                ) : (
                    timelineItems.map((item, i) => {
                        if (item.kind === "customer") {
                            return <CustomerBubble key={item.message.id} message={item.message} />;
                        }
                        if (item.kind === "agent") {
                            let bubbleType: "ai_sales" | "ai_support" | "manual" = "ai_sales";
                            const msgIntent = item.message.metadata?.intent;
                            if (item.isManual) {
                                bubbleType = "manual";
                            } else if (msgIntent === "SUPPORT" || msgIntent === "HANDOFF") {
                                bubbleType = "ai_support";
                            }
                            return <AgentBubble key={item.message.id} message={item.message} type={bubbleType} />;
                        }
                        return (
                            <SystemLogCard
                                key={`log-${i}`}
                                logType={item.logType}
                                data={item.data}
                                timestamp={item.timestamp}
                            />
                        );
                    })
                )}

                {/* Typing indicator */}
                {isTyping && <TypingIndicator type={typingType} />}

                <div ref={bottomRef} className="h-4" />
            </div>

            {/* Action Area + ReplyBox */}
            <div className="flex-none" style={{ background: "var(--bg-base)", borderTop: "1px solid var(--border-default)" }}>
                {/* Sale modal */}
                {showSaleModal && (
                    <div
                        className="mx-6 my-4 rounded-2xl p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 shadow-2xl"
                        style={{
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-strong)",
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bot className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
                                    Registrar Venda Centauro
                                </span>
                            </div>
                            <button
                                onClick={() => setShowSaleModal(false)}
                                className="p-1 rounded-full transition-colors"
                                style={{ color: "var(--text-muted)", backgroundColor: "transparent" }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-elevated)"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <input
                                value={saleDesc}
                                onChange={e => setSaleDesc(e.target.value)}
                                placeholder="Descrição do Produto (ex: Camiseta Nike Dri-FIT)"
                                className="text-sm rounded-xl px-4 py-2.5 w-full outline-none transition-all font-medium"
                                style={{
                                    background: "var(--bg-base)",
                                    border: "1px solid var(--border-default)",
                                    color: "var(--text-primary)"
                                }}
                            />

                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold opacity-40">R$</span>
                                    <input
                                        value={salePrice}
                                        onChange={e => setSalePrice(e.target.value)}
                                        placeholder="Valor Unitário"
                                        className="text-sm rounded-xl pl-10 pr-4 py-2.5 w-full outline-none transition-all font-medium"
                                        style={{
                                            background: "var(--bg-base)",
                                            border: "1px solid var(--border-default)",
                                            color: "var(--text-primary)"
                                        }}
                                    />
                                </div>
                                <input
                                    value={saleQty}
                                    onChange={e => setSaleQty(e.target.value)}
                                    placeholder="Qtd"
                                    className="text-sm rounded-xl px-4 py-2.5 w-20 outline-none text-center transition-all font-medium"
                                    style={{
                                        background: "var(--bg-base)",
                                        border: "1px solid var(--border-default)",
                                        color: "var(--text-primary)"
                                    }}
                                />
                            </div>
                        </div>

                        {saleError && (
                            <p className="text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 border" style={{ background: "var(--color-brand-subtle)", color: "var(--color-brand)", borderColor: "var(--color-brand-border)" }}>
                                <CheckCircle className="w-3.5 h-3.5 rotate-180" />
                                {saleError}
                            </p>
                        )}

                        <button
                            onClick={handleCloseSale}
                            disabled={saleLoading}
                            className="flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] text-white disabled:opacity-50 shadow-lg"
                            style={{ background: "var(--color-brand)" }}
                        >
                            {saleLoading ? "Processando..." : "Confirmar e Vincular"}
                        </button>
                    </div>
                )}

                {/* Quick Action Buttons */}
                {isActive && (
                    <div className="px-6 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar" style={{ borderBottom: "1px solid var(--border-default)" }}>
                        <button
                            onClick={() => setShowSaleModal(v => !v)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all text-white shadow-sm shrink-0"
                            style={{ background: "#E31C2D" }}
                        >
                            <CheckCircle size={14} />
                            Fechar venda
                        </button>

                        <button
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 shadow-sm"
                            style={{
                                background: "transparent",
                                color: "var(--text-muted)"
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                        >
                            <Package size={14} />
                            Estoque
                        </button>

                        <button
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 shadow-sm"
                            style={{
                                background: "transparent",
                                color: "var(--text-muted)"
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                        >
                            <HeadphonesIcon size={14} />
                            SAC
                        </button>
                    </div>
                )}

                {/* ReplyBox Integration */}
                <div className="px-4 pb-4">
                    <ReplyBox
                        conversationId={conversationId}
                        status={status}
                        intent={currentIntent}
                        onReplySent={onReplySent}
                    />
                </div>
            </div>
        </div>
    );
}
