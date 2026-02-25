"use client";

import { useMemo, useState } from "react";
import ConversationCard, { type ConversationCardData, isSACConversation } from "./ConversationCard";
import { MessageSquareOff, RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ConversationGridProps {
    conversations: ConversationCardData[];
    activeTab: "todos" | "vendas" | "duvidas" | "sac";
    loading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
}

const TABS = [
    { id: "todos", label: "Todos" },
    { id: "vendas", label: "Vendas" },
    { id: "duvidas", label: "Dúvidas" },
    { id: "sac", label: "SAC" },
] as const;

export default function ConversationGrid({ conversations, activeTab, loading, selectedId, onSelect }: ConversationGridProps) {
    const [localTab, setLocalTab] = useState<typeof activeTab>(activeTab);
    const [promotedIds, setPromotedIds] = useState<string[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const { topGrid, historyList } = useMemo(() => {
        const filtered = conversations.filter(c => {
            const isSAC = isSACConversation(c);
            const isStatusHuman = c.status === "PENDING_HUMAN" || c.status === "escalated";

            if (localTab === "todos") return c.status !== "closed";
            if (localTab === "vendas") return !isSAC && !isStatusHuman && c.status !== "closed";
            if (localTab === "duvidas") return c.intent === "DOUBT" || c.intent?.startsWith("INFO");
            if (localTab === "sac") return isSAC || isStatusHuman;
            return true;
        });

        const sorted = filtered.sort((a, b) => {
            const aPromoted = promotedIds.includes(a.id);
            const bPromoted = promotedIds.includes(b.id);
            if (aPromoted && !bPromoted) return -1;
            if (!aPromoted && bPromoted) return 1;
            const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tB - tA;
        });

        return {
            topGrid: sorted.slice(0, 9),
            historyList: sorted.slice(9),
        };
    }, [conversations, localTab, promotedIds]);

    const handlePromote = (id: string) => {
        setPromotedIds(prev => [id, ...prev.filter(pid => pid !== id)]);
        setIsHistoryOpen(false);
        onSelect(id);
    };

    if (loading && conversations.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0f1117] h-full w-full">
                <RefreshCw className="w-12 h-12 animate-spin mb-6 text-slate-700" />
                <span className="text-xl font-black uppercase tracking-widest text-slate-600">
                    Sincronizando Radar...
                </span>
            </div>
        );
    }

    return (
        <div className="bg-[#0f1117] min-h-full w-full flex flex-col overflow-x-hidden">

            {/* ── FILTER PILLS BAR (Stitch screen 2) ─────────────────── */}
            <div className="flex items-center gap-3 px-8 pt-8 pb-4 flex-wrap">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setLocalTab(tab.id)}
                        className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${localTab === tab.id
                            ? "bg-[#E3000F] text-white shadow-lg shadow-[#E3000F]/20"
                            : "bg-[#1a1d23] text-slate-400 border border-[#2e3440] hover:bg-[#2e3440] hover:text-white"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
                <div className="flex-1 border-t border-[#2e3440] ml-2 opacity-50" />
            </div>

            {topGrid.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center h-full py-20">
                    <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-[#1a1d23]">
                        <MessageSquareOff size={48} className="text-slate-700" />
                    </div>
                    <p className="text-2xl font-bold text-white mb-2">SISTEMA LIMPO</p>
                    <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                        Nenhuma operação pendente.
                    </p>
                </div>
            ) : (
                <div className="px-8 pb-16 relative">

                    {/* ── GRID 3-col (Stitch fixed-grid) ──────────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full auto-rows-[280px]">

                        <AnimatePresence mode="popLayout">
                            {topGrid.map(conv => (
                                <motion.div
                                    layoutId={`card-${conv.id}`}
                                    key={conv.id}
                                    initial={{ opacity: 0, scale: 0.92, y: 40 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                    className="h-full"
                                >
                                    <ConversationCard
                                        data={conv}
                                        isActive={selectedId === conv.id}
                                        isDimmed={!!selectedId && selectedId !== conv.id}
                                        onClick={() => onSelect(conv.id)}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* ── HISTORY PANEL ─────────────────────────────────── */}
                    {historyList.length > 0 && (
                        <div className="fixed bottom-8 left-8 z-40 flex flex-col items-start">
                            <AnimatePresence>
                                {isHistoryOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20, height: 0 }}
                                        animate={{ opacity: 1, y: 0, height: "auto" }}
                                        exit={{ opacity: 0, y: 20, height: 0 }}
                                        className="mb-4 bg-[#1a1d23] border border-[#2e3440] rounded-2xl shadow-2xl overflow-hidden w-[350px] max-h-[500px] flex flex-col"
                                    >
                                        <div className="bg-[#0f1117] px-5 py-4 border-b border-[#2e3440] flex justify-between items-center shrink-0">
                                            <h4 className="text-white font-bold uppercase tracking-widest text-sm">
                                                Histórico de Fila
                                            </h4>
                                            <button onClick={() => setIsHistoryOpen(false)} className="text-slate-500 hover:text-white">
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#2e3440 transparent" }}>
                                            {historyList.map(conv => (
                                                <motion.div
                                                    layoutId={`card-${conv.id}`}
                                                    key={conv.id}
                                                    onClick={() => handlePromote(conv.id)}
                                                    className="p-4 rounded-xl hover:bg-[#2e3440]/50 cursor-pointer border border-transparent hover:border-[#2e3440] transition-colors mb-2"
                                                >
                                                    <p className="text-white font-bold truncate">{conv.customerName || `Cliente ...${conv.customerPhone.slice(-4)}`}</p>
                                                    <p className="text-xs text-slate-500 truncate">{conv.lastMessage}</p>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button
                                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                className="group bg-[#1a1d23] hover:bg-[#2e3440] border border-[#2e3440] text-slate-400 hover:text-white rounded-full px-6 py-4 flex items-center gap-3 transition-all shadow-xl"
                            >
                                <span className="material-symbols-rounded text-lg group-hover:-rotate-45 transition-transform">history</span>
                                <span className="font-bold uppercase tracking-widest text-xs">
                                    Abrir Histórico ({historyList.length})
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
