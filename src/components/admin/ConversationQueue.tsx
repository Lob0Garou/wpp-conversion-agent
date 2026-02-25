"use client";

import { useState, useMemo } from "react";
import { Search, ShoppingBag, ShieldCheck, RefreshCw, Headphones, Bot } from "lucide-react";
import ConversationCard, { type ConversationCardData, isSACConversation } from "./ConversationCard";

interface ConversationQueueProps {
    conversations: ConversationCardData[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
    onRefresh: () => void;
    hotLeadsCount?: number;
    totalConvsCount?: number;
}

type TabKey = "sales" | "sac";

export default function ConversationQueue({
    conversations, selectedId, onSelect, loading, onRefresh,
    hotLeadsCount = 0, totalConvsCount = 0,
}: ConversationQueueProps) {
    const [activeTab, setActiveTab] = useState<TabKey>("sales");
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const query = search.toLowerCase().trim();
        return conversations
            .filter(c => {
                const isSAC = isSACConversation(c);
                const matchesTab = activeTab === "sac" ? isSAC : (!isSAC && c.status !== "closed");
                if (!matchesTab) return false;
                if (!query) return true;
                return (
                    (c.customerName?.toLowerCase().includes(query)) ||
                    c.customerPhone.includes(query) ||
                    (c.lastMessage ?? "").toLowerCase().includes(query)
                );
            })
            .sort((a, b) => {
                const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                return tB - tA;
            });
    }, [conversations, activeTab, search]);

    return (
        <div className="w-[340px] flex-none flex flex-col z-10 h-full overflow-hidden" style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border-default)" }}>

            {/* Sidebar Headers & Stats */}
            <div className="p-4" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)" }}>
                <div className="flex gap-2 mb-4">
                    <div className="flex-1 rounded-xl p-3 text-center shadow-sm" style={{ background: "rgba(227, 28, 45, 0.15)", border: "1px solid rgba(227, 28, 45, 0.3)" }}>
                        <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "#E31C2D" }}>Leads Quentes</div>
                        <div className="text-2xl font-black tracking-tighter" style={{ color: "#E31C2D" }}>{hotLeadsCount}</div>
                    </div>
                    <div className="flex-1 rounded-xl p-3 text-center shadow-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                        <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Conversas</div>
                        <div className="text-2xl font-black tracking-tighter" style={{ color: "var(--text-main-dark)" }}>{totalConvsCount}</div>
                    </div>
                </div>

                <div className="relative mb-4 group">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-colors" style={{ color: "var(--text-muted)" }} />
                    <input
                        type="text"
                        placeholder="Pesquisar cliente ou conversa..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-xl text-xs font-medium transition-all outline-none"
                        style={{
                            background: "var(--bg-base)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)"
                        }}
                    />
                </div>

                {/* Tabs */}
                <div className="flex p-1 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                    <button
                        onClick={() => setActiveTab("sales")}
                        className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === "sales" ? 'shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                        style={{
                            background: activeTab === "sales" ? "var(--bg-surface)" : "transparent",
                            color: activeTab === "sales" ? "var(--color-brand)" : "var(--text-muted)"
                        }}
                    >
                        Em Venda
                    </button>
                    <button
                        onClick={() => setActiveTab("sac")}
                        className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === "sac" ? 'shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                        style={{
                            background: activeTab === "sac" ? "var(--bg-surface)" : "transparent",
                            color: activeTab === "sac" ? "var(--color-brand)" : "var(--text-muted)"
                        }}
                    >
                        SAC / Handoff
                    </button>
                </div>
            </div>

            {/* Chat List Scrollable Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loading && conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-30">
                        <RefreshCw className="w-6 h-6 animate-spin mb-2" style={{ color: "var(--text-muted)" }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Sincronizando...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-8 text-center opacity-40">
                        <Bot className="w-8 h-8 mb-3" style={{ color: "var(--text-muted)" }} />
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Nenhuma conversa ativa nesta fila</p>
                    </div>
                ) : (
                    filtered.map((conv) => (
                        <ConversationCard
                            key={conv.id}
                            data={conv}
                            isActive={conv.id === selectedId}
                            onClick={() => onSelect(conv.id)}
                        />
                    ))
                )}
            </div>

            {/* Refresh Action Footer */}
            <div className="p-3 border-t flex justify-center" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-default)" }}>
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="flex items-center gap-2 text-[10px] font-black transition-colors uppercase tracking-widest disabled:opacity-50"
                    style={{ color: "var(--color-brand)" }}
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    {loading ? "Atualizando..." : "Sincronizar Lista"}
                </button>
            </div>
        </div>
    );
}
