"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ───

interface ConversationItem {
    id: string;
    status: string;
    customerPhone: string;
    customerName: string | null;
    lastMessage: string;
    lastMessageAt: string;
    lastMessageDirection: string;
}

interface MessageItem {
    id: string;
    direction: string;
    content: string;
    timestamp: string;
    metadata: Record<string, unknown> | null;
}

// ─── Main Page ───

export default function AdminPage() {
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const [convStatus, setConvStatus] = useState<string>("");
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // ─── Fetch Conversations ───
    const fetchConversations = useCallback(async () => {
        try {
            const res = await fetch("/api/conversations");
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } catch (err) {
            console.error("Erro ao buscar conversas:", err);
        } finally {
            setLoadingConvs(false);
        }
    }, []);

    // ─── Fetch Messages ───
    const fetchMessages = useCallback(async (convId: string) => {
        try {
            const res = await fetch(`/api/conversations/${convId}/messages`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages);
                setConvStatus(data.status);
            }
        } catch (err) {
            console.error("Erro ao buscar mensagens:", err);
        } finally {
            setLoadingMsgs(false);
        }
    }, []);

    // ─── Auto-refresh (5s) ───
    useEffect(() => {
        fetchConversations();
        const interval = setInterval(() => {
            fetchConversations();
            if (selectedId) fetchMessages(selectedId);
        }, 5000);
        return () => clearInterval(interval);
    }, [selectedId, fetchConversations, fetchMessages]);

    // ─── Select Conversation ───
    const selectConversation = (id: string) => {
        setSelectedId(id);
        setMessages([]);
        setLoadingMsgs(true);
        fetchMessages(id);
    };

    // ─── Auto-scroll ───
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ─── Send Reply ───
    const handleSendReply = async () => {
        if (!selectedId || !replyText.trim() || sending) return;

        setSending(true);
        try {
            const res = await fetch(`/api/conversations/${selectedId}/reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: replyText.trim() }),
            });

            if (res.ok) {
                setReplyText("");
                // Refresh imediato
                await fetchMessages(selectedId);
                await fetchConversations();
            } else {
                const err = await res.json();
                alert(`Erro ao enviar: ${err.error || "Erro desconhecido"}`);
            }
        } catch (err) {
            console.error("Erro ao enviar resposta:", err);
            alert("Erro de rede ao enviar resposta");
        } finally {
            setSending(false);
        }
    };

    // ─── Key handler (Enter) ───
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendReply();
        }
    };

    // ─── Format timestamp ───
    const formatTime = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const formatDate = (ts: string) => {
        const d = new Date(ts);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return "Hoje";
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return "Ontem";
        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    };

    // ─── Render ───
    return (
        <div className="flex h-full">
            {/* ══════ SIDEBAR ══════ */}
            <div className="w-[380px] min-w-[320px] flex flex-col border-r border-[#2a3942] bg-[#111b21]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#202c33]">
                    <h1 className="text-[#e9edef] font-semibold text-lg tracking-tight">
                        💬 Atendimento
                    </h1>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[#8696a0] bg-[#111b21] px-2 py-1 rounded-full">
                            {conversations.length} conversas
                        </span>
                    </div>
                </div>

                {/* Search placeholder */}
                <div className="px-3 py-2 bg-[#111b21]">
                    <div className="bg-[#202c33] rounded-lg px-4 py-2 flex items-center gap-3">
                        <svg className="w-4 h-4 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="text-sm text-[#8696a0]">Pesquisar conversas</span>
                    </div>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {loadingConvs ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="text-[#8696a0] text-sm animate-pulse">Carregando...</div>
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-[#8696a0] gap-2">
                            <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span className="text-sm">Nenhuma conversa</span>
                        </div>
                    ) : (
                        conversations.map((conv) => {
                            const isPending = conv.status === "PENDING_HUMAN";
                            const isSelected = conv.id === selectedId;

                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => selectConversation(conv.id)}
                                    className={`w-full text-left px-3 py-3 flex items-start gap-3 transition-colors border-b border-[#2a3942]/50 cursor-pointer
                                        ${isSelected ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}
                                    `}
                                >
                                    {/* Avatar */}
                                    <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg
                                        ${isPending ? "bg-gradient-to-br from-amber-500 to-red-500" : "bg-[#2a3942]"}
                                    `}>
                                        {conv.customerPhone.slice(-2)}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[#e9edef] font-medium text-[15px] truncate">
                                                {conv.customerName || conv.customerPhone}
                                            </span>
                                            <span className="text-[11px] text-[#8696a0] flex-shrink-0 ml-2">
                                                {formatDate(conv.lastMessageAt)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center mt-0.5">
                                            <p className="text-sm text-[#8696a0] truncate pr-2">
                                                {conv.lastMessageDirection === "outbound" && (
                                                    <span className="text-[#53bdeb] mr-1">✓✓</span>
                                                )}
                                                {conv.lastMessage || "..."}
                                            </p>
                                            {isPending && (
                                                <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                    Pendente
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ══════ CHAT AREA ══════ */}
            <div className="flex-1 flex flex-col bg-[#0b141a]">
                {!selectedId ? (
                    /* Empty state */
                    <div className="flex-1 flex flex-col items-center justify-center text-[#8696a0] gap-4">
                        <div className="w-72 h-72 rounded-full bg-[#202c33]/50 flex items-center justify-center">
                            <svg className="w-40 h-40 text-[#364147]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-light text-[#e9edef]">Painel de Atendimento</h2>
                        <p className="text-sm max-w-md text-center leading-relaxed">
                            Selecione uma conversa para visualizar as mensagens e responder ao cliente.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#202c33] border-b border-[#2a3942]">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold
                                ${convStatus === "PENDING_HUMAN" ? "bg-gradient-to-br from-amber-500 to-red-500" : "bg-[#2a3942]"}
                            `}>
                                {conversations.find((c) => c.id === selectedId)?.customerPhone.slice(-2) || "?"}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-[#e9edef] font-medium text-base">
                                    {conversations.find((c) => c.id === selectedId)?.customerName ||
                                        conversations.find((c) => c.id === selectedId)?.customerPhone || "..."}
                                </h2>
                                <div className="flex items-center gap-2">
                                    {convStatus === "PENDING_HUMAN" ? (
                                        <span className="text-xs text-amber-400 font-medium flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                            Aguardando atendente
                                        </span>
                                    ) : (
                                        <span className="text-xs text-[#8696a0]">
                                            {convStatus === "open" ? "Conversa ativa" : convStatus}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div
                            className="flex-1 overflow-y-auto px-12 py-4 space-y-1"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 15 L30 12 L25 15 Z' fill='%23111b21' opacity='0.3'/%3E%3C/svg%3E")`,
                                backgroundColor: "#0b141a",
                            }}
                        >
                            {loadingMsgs ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="text-[#8696a0] text-sm animate-pulse">Carregando mensagens...</div>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="text-[#8696a0] text-sm">Nenhuma mensagem nesta conversa</div>
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const isOutbound = msg.direction === "outbound";
                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm mb-0.5 relative
                                                    ${isOutbound
                                                        ? "bg-[#005c4b] text-[#e9edef] rounded-tr-none"
                                                        : "bg-[#202c33] text-[#e9edef] rounded-tl-none"
                                                    }
                                                `}
                                            >
                                                {/* Engine metadata badge */}
                                                {isOutbound && msg.metadata && typeof msg.metadata === "object" && "engineIntent" in msg.metadata && (
                                                    <div className="text-[10px] text-emerald-300/60 mb-0.5 font-mono">
                                                        🤖 {(msg.metadata as Record<string, string>).engineIntent}
                                                    </div>
                                                )}
                                                {isOutbound && msg.metadata && typeof msg.metadata === "object" && "source" in msg.metadata && (msg.metadata as Record<string, string>).source === "manual_reply" && (
                                                    <div className="text-[10px] text-blue-300/60 mb-0.5 font-mono">
                                                        👤 manual
                                                    </div>
                                                )}
                                                <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words">
                                                    {msg.content}
                                                </p>
                                                <div className={`text-[11px] mt-1 flex items-center gap-1 justify-end
                                                    ${isOutbound ? "text-[#ffffff99]" : "text-[#8696a0]"}
                                                `}>
                                                    <span>{formatTime(msg.timestamp)}</span>
                                                    {isOutbound && <span className="text-[#53bdeb]">✓✓</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Reply Input */}
                        <div className="bg-[#202c33] px-4 py-3 flex items-end gap-2 border-t border-[#2a3942]">
                            <div className="flex-1 bg-[#2a3942] rounded-lg px-4 py-2.5">
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Digite uma mensagem"
                                    rows={1}
                                    className="w-full bg-transparent text-[#e9edef] placeholder-[#8696a0] text-sm outline-none resize-none max-h-32"
                                    style={{ minHeight: "20px" }}
                                    disabled={sending}
                                />
                            </div>
                            <button
                                onClick={handleSendReply}
                                disabled={sending || !replyText.trim()}
                                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                                    ${replyText.trim() && !sending
                                        ? "bg-[#00a884] hover:bg-[#06cf9c] text-white cursor-pointer"
                                        : "bg-[#2a3942] text-[#8696a0] cursor-not-allowed"
                                    }
                                `}
                            >
                                {sending ? (
                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
