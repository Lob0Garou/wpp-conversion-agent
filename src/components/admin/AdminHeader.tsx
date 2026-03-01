"use client";

import { useAdminTab } from "@/contexts/AdminTabContext";

const NAV_TABS = [
    { id: "vendas", label: "Cockpit", icon: "dashboard" },
    { id: "estoque", label: "Estoque", icon: "inventory_2" },
    { id: "perdidos", label: "Perdidos", icon: "warning" },
] as const;

export default function AdminHeader() {
    const { activeTab, setActiveTab } = useAdminTab();

    return (
        <header className="sticky top-0 z-50 h-16 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0">

            {/* ── Left: Logo + Pill Nav ─────────────────────────────────────── */}
            <div className="flex items-center gap-6">

                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[var(--color-brand)] rounded-md flex items-center justify-center font-bold text-white text-lg shadow-lg shadow-[var(--color-brand)]/20">
                        C
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                            Centauro
                        </span>
                        <span className="text-sm font-bold tracking-wide text-[var(--text-primary)] uppercase">
                            Águias de Elite
                        </span>
                    </div>
                </div>

                {/* Pill Nav */}
                <nav className="hidden md:flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-1">
                    {NAV_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
                            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${activeTab === tab.id
                                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-default)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/50 border border-transparent"
                                }`}
                        >
                            <span className="material-symbols-rounded text-base leading-none">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* ── Right: System Status ───────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-[var(--color-success)]/20 bg-[var(--color-success)]/10 px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse shrink-0" />
                    <span className="text-xs font-medium text-[var(--color-success)] tracking-wide uppercase">System Live</span>
                </div>
            </div>
        </header>
    );
}
