"use client";

import { useAdminTab } from "@/contexts/AdminTabContext";

export default function AdminHeader() {
    const { activeTab, setActiveTab } = useAdminTab();

    return (
        <header className="h-16 w-full bg-[var(--bg-deep)] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 z-50 shrink-0 shadow-2xl">

            {/* ── Left: Logo + Tabs ───────────────────────────────── */}
            <div className="flex items-center space-x-8">
                <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-[var(--color-brand)] rounded flex items-center justify-center font-black text-white text-xl shadow-lg shadow-[var(--color-brand)]/20">C</div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-sm tracking-tighter leading-none text-white">CENTAURO</h1>
                        <p className="text-[var(--text-xs)] uppercase font-bold text-[var(--color-brand)] tracking-[0.2em] leading-none mt-1">ÁGUIAS DE ELITE</p>
                    </div>
                </div>

                <div className="hidden xl:flex items-center space-x-1">
                    {[
                        { id: "vendas", label: "Cockpit", icon: "dashboard" },
                        { id: "estoque", label: "Estoque", icon: "inventory_2" },
                        { id: "perdidos", label: "Perdidos", icon: "warning" },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === tab.id
                                ? "bg-white/10 text-white"
                                : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                                }`}
                        >
                            <span className="material-symbols-rounded text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Right: Metrics + Status ────────────────────────── */}
            <div className="hidden xl:flex items-center space-x-10 ml-10">

                <div className="flex flex-col">
                    <span className="text-[var(--text-xs)] uppercase font-bold text-slate-500 tracking-widest mb-0.5">Leads Quentes</span>
                    <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-black text-white">15</span>
                        <span className="material-symbols-rounded text-emerald-500 text-sm">trending_up</span>
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-[var(--text-xs)] uppercase font-bold text-slate-500 tracking-widest mb-0.5">Taxa de Conversão</span>
                    <span className="text-2xl font-black text-white">
                        64<span className="text-lg font-bold">%</span>
                    </span>
                </div>

                <div className="flex flex-col">
                    <span className="text-[var(--text-xs)] uppercase font-bold text-slate-500 tracking-widest mb-0.5">Tempo Médio (SLA)</span>
                    <div className="flex items-center space-x-2">
                        <span className="material-symbols-rounded text-amber-500 text-lg">bolt</span>
                        <span className="text-2xl font-black text-white font-mono">02:45</span>
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-[var(--text-xs)] uppercase font-bold text-slate-500 tracking-widest mb-0.5">Bot Ativo</span>
                    <div className="flex items-center space-x-2 mt-1">
                        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-xs font-bold text-emerald-500 uppercase tracking-tighter">System Live</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
