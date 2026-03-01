"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Bot } from "lucide-react";
import CustomerBubble from "./CustomerBubble";
import AgentBubble from "./AgentBubble";
import SystemLogCard from "./SystemLogCard";
import ReplyBox from "./ReplyBox";
import TypingIndicator from "./TypingIndicator";
import CloseSaleModal from "./CloseSaleModal";
import QuickActionBar from "./QuickActionBar";
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
    void customerPhone;
    void frustrationLevel;
    void ticketNumber;

    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const quickInsertSeq = useRef(0);

    const [now, setNow] = useState(0);
    const [showSaleModal, setShowSaleModal] = useState(false);
    const [quickInsert, setQuickInsert] = useState<{ id: number; text: string } | null>(null);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!containerRef.current || !bottomRef.current) return;
        const container = containerRef.current;
        if (container.scrollHeight - container.scrollTop - container.clientHeight < 400) {
            bottomRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages.length]);

    const timelineItems = parseTimelineItems(messages);
    const lastOutbound = [...messages].reverse().find((m) => m.direction === "outbound");
    const currentIntent = intent || lastOutbound?.metadata?.intent;

    const lastMessage = messages[messages.length - 1];
    const isPending = status === "PENDING_HUMAN" || status === "escalated";
    const isTyping =
        now > 0 &&
        !isPending &&
        lastMessage?.direction === "inbound" &&
        now - new Date(lastMessage.timestamp).getTime() < 20_000;

    const typingType: "sales" | "sac" =
        currentIntent === "SUPPORT" || currentIntent === "HANDOFF" ? "sac" : "sales";

    const isActive = !isPending && status !== "closed";
    const agentLabel =
        isPending
            ? "Aguardando Atendimento"
            : currentIntent === "SUPPORT" || currentIntent === "HANDOFF"
                ? "Cadu - SAC"
                : "Cadu - Vendas";

    const enqueueQuickReply = useCallback((text: string) => {
        quickInsertSeq.current += 1;
        setQuickInsert({ id: quickInsertSeq.current, text });
    }, []);

    const handleSaleSuccess = useCallback(() => {
        onSaleClosed?.();
        onReplySent();
    }, [onReplySent, onSaleClosed]);

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-5 scroll-smooth custom-scrollbar"
                style={{ background: "var(--bg-surface)" }}
            >
                <div className="flex justify-center mb-6 mt-2">
                    <span
                        className="text-[10px] font-black px-3.5 py-1.5 rounded-lg flex items-center gap-2 border uppercase tracking-widest"
                        style={{
                            background: "var(--color-ai-sales-bg)",
                            color: "var(--color-ai-sales)",
                            borderColor: "var(--color-ai-sales-border)",
                        }}
                    >
                        <Bot className="w-3 h-3" />
                        {agentLabel} assumiu o atendimento
                    </span>
                </div>

                {timelineItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                        <div
                            className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
                            style={{ background: "var(--bg-elevated)" }}
                        >
                            <MessageSquare size={32} style={{ color: "var(--text-muted)" }} />
                        </div>
                        <p
                            className="text-[var(--text-xs)] font-black uppercase tracking-widest"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Iniciando nova conversa...
                        </p>
                    </div>
                ) : (
                    timelineItems.map((item, i) => {
                        if (item.kind === "customer") {
                            return (
                                <CustomerBubble
                                    key={item.message.id}
                                    message={item.message}
                                    customerName={customerName}
                                />
                            );
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

                {isTyping && <TypingIndicator type={typingType} />}

                <div ref={bottomRef} className="h-4" />
            </div>

            <div className="flex-none border-t" style={{ background: "var(--bg-base)", borderColor: "var(--border-default)" }}>
                <CloseSaleModal
                    open={showSaleModal}
                    conversationId={conversationId}
                    initialDescription={slots?.categoria}
                    onClose={() => setShowSaleModal(false)}
                    onSuccess={handleSaleSuccess}
                />

                <QuickActionBar
                    visible={isActive}
                    saleModalOpen={showSaleModal}
                    onToggleSaleModal={() => setShowSaleModal((prev) => !prev)}
                    onStockClick={() => enqueueQuickReply("Vou verificar o estoque para voce agora.")}
                    onSacClick={() => enqueueQuickReply("Vou acionar o suporte e te atualizo em instantes.")}
                />

                <div className="px-5 py-4">
                    <ReplyBox
                        conversationId={conversationId}
                        status={status}
                        intent={currentIntent}
                        quickInsert={quickInsert}
                        onQuickReply={enqueueQuickReply}
                        onReplySent={onReplySent}
                    />
                </div>
            </div>
        </div>
    );
}
