"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

export default function AdminPage() {
    // State
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const [convStatus, setConvStatus] = useState("open");
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Debug panel
    const [showDebug, setShowDebug] = useState(false);
    const [testPhoneNumber, setTestPhoneNumber] = useState("5585985963329");
    const [testMessage, setTestMessage] = useState("Teste de entrega");
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [testType, setTestType] = useState<"text" | "template">("text");

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Only render after hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch conversations
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

    // Fetch messages
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

    // Test send
    const handleTestSend = async () => {
        if (!testPhoneNumber.trim()) {
            setTestResult({ error: "Número de telefone obrigatório" });
            return;
        }

        setTestLoading(true);
        setTestResult(null);

        try {
            const endpoint =
                testType === "text" ? "/api/test-send" : "/api/test-template";
            const url = `${endpoint}?to=${encodeURIComponent(testPhoneNumber)}&text=${encodeURIComponent(testMessage)}`;

            const res = await fetch(url);
            const data = await res.json();

            setTestResult({
                status: res.status,
                success: res.ok,
                data: data,
                timestamp: new Date().toLocaleTimeString("pt-BR"),
            });

            if (res.ok) {
                alert("✅ Teste enviado! Observe o console (F12) para logs de status");
            }
        } catch (err) {
            setTestResult({
                error: err instanceof Error ? err.message : "Erro desconhecido",
                timestamp: new Date().toLocaleTimeString("pt-BR"),
            });
        } finally {
            setTestLoading(false);
        }
    };

    // Auto refresh
    useEffect(() => {
        if (!mounted) return;

        fetchConversations();
        const interval = setInterval(() => {
            fetchConversations();
            if (selectedId) fetchMessages(selectedId);
        }, 5000);

        return () => clearInterval(interval);
    }, [selectedId, fetchConversations, fetchMessages, mounted]);

    // Select conversation
    const selectConversation = (id: string) => {
        setSelectedId(id);
        setMessages([]);
        setLoadingMsgs(true);
        fetchMessages(id);
    };

    // Auto scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Send reply
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendReply();
        }
    };

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            return d.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "??:??";
        }
    };

    const formatDate = (ts: string) => {
        try {
            const d = new Date(ts);
            const today = new Date();
            if (d.toDateString() === today.toDateString()) return "Hoje";
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (d.toDateString() === yesterday.toDateString()) return "Ontem";
            return d.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
            });
        } catch {
            return "??/??";
        }
    };

    if (!mounted) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-[#111b21]">
                <div className="text-[#8696a0]">Carregando...</div>
            </div>
        );
    }

    return (
        <div className="flex h-full">
            {/* SIDEBAR */}
            <div className="w-[380px] min-w-[320px] flex flex-col border-r border-[#2a3942] bg-[#111b21]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#202c33]">
                    <h1 className="text-[#e9edef] font-semibold text-lg">
                        💬 Atendimento
                    </h1>
                    <button
                        onClick={() => setShowDebug(!showDebug)}
                        className="text-xs text-[#8696a0] hover:text-[#e9edef] px-2 py-1 rounded bg-[#111b21]"
                    >
                        🔧
                    </button>
                </div>

                {/* Debug Panel */}
                {showDebug && (
                    <div className="border-b border-[#2a3942] bg-[#1a252d] p-3 space-y-2 text-sm">
                        <div>
                            <label className="text-xs text-[#8696a0]">
                                Tipo
                            </label>
                            <div className="flex gap-1 mt-1">
                                <button
                                    onClick={() => setTestType("text")}
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                        testType === "text"
                                            ? "bg-[#00a884] text-white"
                                            : "bg-[#202c33] text-[#8696a0]"
                                    }`}
                                >
                                    📝
                                </button>
                                <button
                                    onClick={() => setTestType("template")}
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                        testType === "template"
                                            ? "bg-[#00a884] text-white"
                                            : "bg-[#202c33] text-[#8696a0]"
                                    }`}
                                >
                                    📧
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-[#8696a0]">
                                Número
                            </label>
                            <input
                                type="text"
                                value={testPhoneNumber}
                                onChange={(e) =>
                                    setTestPhoneNumber(e.target.value)
                                }
                                className="w-full mt-1 bg-[#202c33] text-[#e9edef] text-xs px-2 py-1 rounded border border-[#2a3942]"
                            />
                        </div>

                        {testType === "text" && (
                            <div>
                                <label className="text-xs text-[#8696a0]">
                                    Msg
                                </label>
                                <input
                                    type="text"
                                    value={testMessage}
                                    onChange={(e) =>
                                        setTestMessage(e.target.value)
                                    }
                                    className="w-full mt-1 bg-[#202c33] text-[#e9edef] text-xs px-2 py-1 rounded border border-[#2a3942]"
                                />
                            </div>
                        )}

                        <button
                            onClick={handleTestSend}
                            disabled={testLoading}
                            className="w-full bg-[#00a884] hover:bg-[#06cf9c] disabled:bg-[#2a3942] text-white text-xs py-1 rounded"
                        >
                            {testLoading ? "⏳" : "▶"} Testar
                        </button>

                        {testResult && (
                            <div
                                className={`text-[10px] p-1.5 rounded font-mono ${
                                    testResult.success
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : "bg-red-500/20 text-red-300"
                                }`}
                            >
                                {testResult.success ? "✅" : "❌"}
                                {testResult.data?.messageId && (
                                    <div className="truncate">
                                        ID: {testResult.data.messageId}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Search */}
                <div className="px-3 py-2 bg-[#111b21]">
                    <div className="bg-[#202c33] rounded-lg px-3 py-2 text-xs text-[#8696a0]">
                        Pesquisar...
                    </div>
                </div>

                {/* Conversations */}
                <div className="flex-1 overflow-y-auto">
                    {loadingConvs ? (
                        <div className="flex items-center justify-center h-20 text-[#8696a0] text-sm">
                            Carregando...
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-[#8696a0] text-sm">
                            Nenhuma conversa
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <button
                                key={conv.id}
                                onClick={() => selectConversation(conv.id)}
                                className={`w-full text-left px-3 py-3 border-b border-[#2a3942]/50 ${
                                    selectedId === conv.id
                                        ? "bg-[#2a3942]"
                                        : "hover:bg-[#202c33]"
                                }`}
                            >
                                <div className="flex items-start gap-2">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-[#2a3942]">
                                        {conv.customerPhone.slice(-2)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[#e9edef] font-medium text-sm truncate">
                                            {conv.customerName ||
                                                conv.customerPhone}
                                        </div>
                                        <div className="text-[#8696a0] text-xs truncate">
                                            {conv.lastMessage || "..."}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* CHAT AREA */}
            <div className="flex-1 flex flex-col bg-[#0b141a]">
                {!selectedId ? (
                    <div className="flex-1 flex items-center justify-center text-[#8696a0]">
                        <div>Selecione uma conversa</div>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="flex items-center px-4 py-3 bg-[#202c33] border-b border-[#2a3942]">
                            <div className="flex-1">
                                <h2 className="text-[#e9edef] font-medium">
                                    {conversations.find(
                                        (c) => c.id === selectedId
                                    )?.customerName ||
                                        conversations.find(
                                            (c) => c.id === selectedId
                                        )?.customerPhone ||
                                        "..."}
                                </h2>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-[#0b141a]">
                            {loadingMsgs ? (
                                <div className="text-[#8696a0] text-sm">
                                    Carregando...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-[#8696a0] text-sm">
                                    Nenhuma mensagem
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const isOutbound =
                                        msg.direction === "outbound";
                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex ${
                                                isOutbound
                                                    ? "justify-end"
                                                    : "justify-start"
                                            }`}
                                        >
                                            <div
                                                className={`max-w-xs px-3 py-2 rounded-lg ${
                                                    isOutbound
                                                        ? "bg-[#005c4b] text-[#e9edef]"
                                                        : "bg-[#202c33] text-[#e9edef]"
                                                }`}
                                            >
                                                <p className="text-sm break-words">
                                                    {msg.content}
                                                </p>
                                                <div className="text-xs mt-1 opacity-70">
                                                    {formatTime(msg.timestamp)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Reply Input */}
                        <div className="bg-[#202c33] px-4 py-3 flex gap-2 border-t border-[#2a3942]">
                            <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Digite..."
                                className="flex-1 bg-[#2a3942] text-[#e9edef] px-3 py-2 rounded text-sm outline-none"
                                disabled={sending}
                            />
                            <button
                                onClick={handleSendReply}
                                disabled={sending || !replyText.trim()}
                                className={`px-4 py-2 rounded text-sm ${
                                    replyText.trim() && !sending
                                        ? "bg-[#00a884] text-white"
                                        : "bg-[#2a3942] text-[#8696a0]"
                                }`}
                            >
                                {sending ? "⏳" : "📤"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
