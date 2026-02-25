"use client";

import { useState, useEffect, useCallback } from "react";
import { HeadphonesIcon, AlertTriangle, Clock, CheckCircle2, Plus, RefreshCw, X, Copy, FileText, ClipboardList } from "lucide-react";
import ConversationQueue from "@/components/admin/ConversationQueue";
import ChatTimeline from "@/components/admin/ChatTimeline";
import type { ConversationCardData } from "@/components/admin/ConversationCard";
import type { RawMessage, InferredSlots } from "@/components/admin/parseTimeline";
import { inferSlotsFromMessages } from "@/components/admin/parseTimeline";

// Tipos
interface RawConv {
    id: string;
    customerName: string | null;
    customerPhone: string;
    status: string;
    startedAt: string;
    conversationType: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    frustrationLevel: number | null;
    slots: InferredSlots | null;
}

interface TicketData {
    id: string;
    ticketNumber: string | null;
    status: string;
    category: string | null;
    orderId: string | null;
    email: string | null;
}

// Utilitários
function mapToCardData(item: RawConv, msgs?: RawMessage[]): ConversationCardData {
    const slots = (msgs && msgs.length > 0) ? inferSlotsFromMessages(msgs) : (item.slots ?? undefined);
    return {
        id: item.id,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        status: item.status,
        lastMessage: item.lastMessage ?? undefined,
        lastMessageAt: item.lastMessageAt ?? undefined,
        frustrationLevel: item.frustrationLevel ?? undefined,
        slots: slots ?? undefined,
        conversationType: (item.conversationType as "sales" | "sac") ?? "sac",
    };
}

function getIntent(status: string, frustrationLevel?: number, slots?: InferredSlots): string {
    if (status === "PENDING_HUMAN" || status === "escalated") return "HANDOFF";
    if (frustrationLevel && frustrationLevel >= 3) return "SUPPORT";
    if (slots?.intent) return slots.intent;
    return "SUPPORT";
}

// Removido formatSLA

// Ordenar por prioridade
function sortByPriority(convs: RawConv[]): RawConv[] {
    return [...convs].sort((a, b) => {
        // Prioridade 1: Escalados/Aguardando humano
        if (a.status === "PENDING_HUMAN" && b.status !== "PENDING_HUMAN") return -1;
        if (b.status === "PENDING_HUMAN" && a.status !== "PENDING_HUMAN") return 1;
        // Prioridade 2: Alta frustração
        if ((a.frustrationLevel ?? 0) >= 3 && (b.frustrationLevel ?? 0) < 3) return -1;
        if ((b.frustrationLevel ?? 0) >= 3 && (a.frustrationLevel ?? 0) < 3) return 1;
        // Prioridade 3: Tempo mais longo
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
}

// Removido PriorityBadge

// Painel de Ação SAC
function ActionPanel({
    conversationId,
    customerName,
    customerPhone,
    onCreated
}: {
    conversationId: string;
    customerName: string | null;
    customerPhone: string;
    onCreated: () => void;
}) {
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [category, setCategory] = useState("troca");
    const [orderId, setOrderId] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const loadTickets = useCallback(async () => {
        try {
            const res = await fetch(`/api/tickets?conversationId=${conversationId}`, { cache: "no-store" });
            if (res.ok) setTickets((await res.json() as TicketData[]) ?? []);
        } catch { /* silencioso */ }
    }, [conversationId]);

    useEffect(() => { loadTickets(); }, [loadTickets]);

    const createTicket = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId, category, orderId: orderId || undefined, email: email || undefined }),
            });
            if (!res.ok) {
                const err = await res.json() as { error?: string };
                throw new Error(err.error ?? "Erro ao criar ticket");
            }
            setShowForm(false);
            setOrderId(""); setEmail(""); setCategory("troca");
            await loadTickets();
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Erro desconhecido");
        } finally {
            setLoading(false);
        }
    };

    const copyData = () => {
        const text = `Cliente: ${customerName ?? customerPhone}\nTelefone: ${customerPhone}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const CATEGORY_OPTS = ["troca", "devolucao", "reclamacao", "duvida", "outros"];

    return (
        <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto custom-scrollbar" style={{ background: "var(--bg-surface)" }}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ClipboardList size={13} style={{ color: "var(--color-sac)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Painel de Ação</span>
                </div>
            </div>

            {/* Dados do Cliente - Copiar */}
            <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Dados do Cliente</span>
                    <button
                        onClick={copyData}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
                        style={{ background: copied ? "var(--color-ai-sales-bg)" : "var(--bg-surface)", color: copied ? "var(--color-ai-sales)" : "var(--text-secondary)" }}
                    >
                        {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                        {copied ? "Copiado!" : "Copiar"}
                    </button>
                </div>
                <div className="text-xs" style={{ color: "var(--text-primary)" }}>{customerName ?? "—"}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{customerPhone}</div>
            </div>

            {/* Checklist de campos pendentes */}
            <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                <span className="text-[10px] uppercase tracking-wide mb-2 block" style={{ color: "var(--text-muted)" }}>Pendências</span>
                <div className="flex flex-col gap-1.5">
                    {[
                        { label: "Pedido informado", done: false },
                        { label: "E-mail confirmado", done: false },
                        { label: "Ticket criado", done: tickets.length > 0 },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                style={{
                                    background: item.done ? "var(--color-ai-sales)" : "var(--bg-surface)",
                                    border: item.done ? "none" : "1px solid var(--border-default)"
                                }}>
                                {item.done && <CheckCircle2 size={8} className="text-white" />}
                            </div>
                            <span className="text-[11px]" style={{ color: item.done ? "var(--text-muted)" : "var(--text-secondary)" }}>
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Botão Novo Ticket */}
            <button
                onClick={() => setShowForm(v => !v)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                    background: showForm ? "var(--color-sac-bg)" : "var(--color-sac)",
                    border: `1px solid ${showForm ? "var(--color-sac-border)" : "var(--color-sac)"}`,
                    color: showForm ? "var(--color-sac)" : "#fff",
                }}
            >
                {showForm ? <X size={12} /> : <Plus size={12} />}
                {showForm ? "Cancelar" : "Criar Ticket"}
            </button>

            {/* Formulário */}
            {showForm && (
                <div className="rounded-xl p-3 flex flex-col gap-2 animate-fade-in"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--color-sac-border)" }}>
                    <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        className="text-xs rounded-lg px-3 py-2 w-full outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    >
                        {CATEGORY_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input
                        value={orderId}
                        onChange={e => setOrderId(e.target.value)}
                        placeholder="Nº do pedido (opcional)"
                        className="text-xs rounded-lg px-3 py-2 w-full outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                    <input
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="E-mail (opcional)"
                        className="text-xs rounded-lg px-3 py-2 w-full outline-none"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                    {error && <p className="text-[11px]" style={{ color: "var(--color-danger)" }}>{error}</p>}
                    <button
                        onClick={createTicket}
                        disabled={loading}
                        className="rounded-lg py-2 text-xs font-bold"
                        style={{ background: "var(--color-sac)", color: "#fff", opacity: loading ? 0.6 : 1 }}
                    >
                        {loading ? "Criando..." : "Criar ticket"}
                    </button>
                </div>
            )}

            {/* Lista de Tickets */}
            <div>
                <span className="text-[10px] uppercase tracking-wide mb-2 block" style={{ color: "var(--text-muted)" }}>
                    Tickets ({tickets.length})
                </span>
                {tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 gap-1">
                        <FileText size={16} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Nenhum ticket</p>
                    </div>
                ) : (
                    tickets.map(t => (
                        <div key={t.id} className="rounded-lg p-2 mb-1"
                            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold" style={{ color: "var(--color-sac)" }}>
                                    #{t.ticketNumber ?? t.id.slice(0, 6)}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded uppercase"
                                    style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}>
                                    {t.status}
                                </span>
                            </div>
                            {t.category && <p className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>{t.category}</p>}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// SACTab principal
export default function SACTab() {
    const [conversations, setConversations] = useState<RawConv[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [convLoading, setConvLoading] = useState(true);
    const [messagesData, setMessagesData] = useState<{ messages: RawMessage[]; status: string; frustrationLevel?: number; slots?: InferredSlots } | null>(null);
    const [msgLoading, setMsgLoading] = useState(false);

    const loadConversations = useCallback(async () => {
        setConvLoading(true);
        try {
            const res = await fetch("/api/conversations?type=sac", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json() as RawConv[];
                setConversations(sortByPriority(data));
            }
        } finally {
            setConvLoading(false);
        }
    }, []);

    const loadMessages = useCallback(async (id: string) => {
        setMsgLoading(true);
        try {
            const res = await fetch(`/api/messages?conversationId=${id}`, { cache: "no-store" });
            if (res.ok) setMessagesData(await res.json());
        } finally {
            setMsgLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConversations();
        const id = setInterval(loadConversations, 15_000);
        return () => clearInterval(id);
    }, [loadConversations]);

    const handleSelect = useCallback((id: string) => {
        setSelectedId(id);
        setMessagesData(null);
        loadMessages(id);
    }, [loadMessages]);

    const handleRefresh = useCallback(() => {
        loadConversations();
        if (selectedId) loadMessages(selectedId);
    }, [loadConversations, loadMessages, selectedId]);

    const cardData: ConversationCardData[] = conversations.map(item =>
        mapToCardData(item, selectedId === item.id ? (messagesData?.messages ?? undefined) : undefined)
    );

    const selectedConv = conversations.find(c => c.id === selectedId);
    const currentStatus = messagesData?.status ?? selectedConv?.status ?? "open";
    const currentFrustrationLevel = messagesData?.frustrationLevel ?? selectedConv?.frustrationLevel ?? undefined;
    const currentSlots = messagesData?.slots ?? selectedConv?.slots ?? undefined;
    const currentIntent = getIntent(currentStatus, currentFrustrationLevel, currentSlots);

    // Contadores por status
    const criticalCount = conversations.filter(c => c.status === "PENDING_HUMAN" || (c.frustrationLevel ?? 0) >= 3).length;
    const totalCount = conversations.length;

    const EmptyState = () => (
        <div className="flex flex-col items-center justify-center h-full gap-2">
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--bg-elevated)" }}
            >
                <HeadphonesIcon size={20} style={{ color: "var(--text-muted)" }} />
            </div>
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Selecione uma conversa</p>
        </div>
    );

    return (
        <div className="flex h-full overflow-hidden">
            {/* COL 1: Lista por Prioridade */}
            <div
                className="w-[28%] min-w-[260px] max-w-[320px] flex flex-col overflow-hidden"
                style={{ borderRight: "1px solid var(--border-default)", background: "var(--bg-surface)" }}
            >
                {/* Header com contadores */}
                <div
                    className="px-3 py-2 flex items-center gap-2"
                    style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}
                >
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                        style={{
                            background: "var(--color-brand-subtle)",
                            color: "var(--color-brand)",
                            border: "1px solid var(--color-brand-border)",
                        }}
                    >
                        <AlertTriangle size={9} />
                        {criticalCount} críticos
                    </div>
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px]"
                        style={{
                            background: "var(--bg-elevated)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border-default)",
                        }}
                    >
                        <Clock size={9} />
                        {totalCount} total
                    </div>
                    <button
                        onClick={handleRefresh}
                        className="ml-auto p-1.5 rounded-lg transition"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                        <RefreshCw size={12} className={convLoading ? "animate-spin" : ""} />
                    </button>
                </div>

                <ConversationQueue
                    conversations={cardData}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    loading={convLoading}
                    onRefresh={handleRefresh}
                />
            </div>

            {/* COL 2: Chat */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
                {!selectedId ? (
                    <EmptyState />
                ) : msgLoading && !messagesData ? (
                    <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--text-muted)" }}>
                        Carregando…
                    </div>
                ) : (
                    <ChatTimeline
                        conversationId={selectedId}
                        customerName={selectedConv?.customerName ?? null}
                        customerPhone={selectedConv?.customerPhone ?? ""}
                        status={currentStatus}
                        messages={messagesData?.messages ?? []}
                        intent={currentIntent}
                        frustrationLevel={currentFrustrationLevel}
                        slots={currentSlots}
                        ticketNumber={null}
                        onReplySent={() => {
                            loadConversations();
                            loadMessages(selectedId);
                        }}
                    />
                )}
            </div>

            {/* COL 3: Painel de Ação */}
            <div
                className="w-[28%] min-w-[260px] max-w-[320px] flex flex-col overflow-hidden"
                style={{ borderLeft: "1px solid var(--border-default)", background: "var(--bg-surface)" }}
            >
                {selectedId ? (
                    <ActionPanel
                        conversationId={selectedId}
                        customerName={selectedConv?.customerName ?? null}
                        customerPhone={selectedConv?.customerPhone ?? ""}
                        onCreated={() => {
                            loadConversations();
                            loadMessages(selectedId);
                        }}
                    />
                ) : (
                    <EmptyState />
                )}
            </div>
        </div>
    );
}
