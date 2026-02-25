"use client";

import { ShoppingCart, Package, HeadphonesIcon } from "lucide-react";

export type AdminTab = "vendas" | "estoque" | "sac";

interface TabBarProps {
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
}

const TABS: {
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    accentColor: string;
    accentBg: string;
    accentBorder: string;
}[] = [
        {
            id: "vendas",
            label: "Vendas",
            icon: <ShoppingCart size={13} />,
            accentColor: "var(--color-ai-sales)",
            accentBg: "var(--color-ai-sales-bg)",
            accentBorder: "var(--color-ai-sales-border)",
        },
        {
            id: "estoque",
            label: "Estoque",
            icon: <Package size={13} />,
            accentColor: "var(--color-stock)",
            accentBg: "var(--color-stock-bg)",
            accentBorder: "var(--color-stock-border)",
        },
        {
            id: "sac",
            label: "SAC",
            icon: <HeadphonesIcon size={13} />,
            accentColor: "var(--color-sac)",
            accentBg: "var(--color-sac-bg)",
            accentBorder: "var(--color-sac-border)",
        },
    ];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
    return (
        <div
            className="flex items-center px-4 border-b shrink-0"
            style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-default)",
                height: "56px",
            }}
        >
            {/* App label */}
            <span className="text-[10px] font-bold tracking-[0.1em] uppercase mr-auto"
                style={{ color: "var(--text-muted)" }}>
                CADU CONSOLE
            </span>

            {/* Pill group */}
            <div className="flex items-center gap-0.5 p-1 rounded-full"
                style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200"
                            style={
                                isActive
                                    ? {
                                        background: tab.accentColor,
                                        color: "#fff",
                                    }
                                    : {
                                        background: "transparent",
                                        color: "var(--text-muted)",
                                    }
                            }
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
