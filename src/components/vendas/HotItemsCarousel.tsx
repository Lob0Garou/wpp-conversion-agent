"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Package, ChevronLeft, ChevronRight, Flame } from "lucide-react";

interface HotItem {
    name: string;
    brand: string;
    stock: number;
}

interface InventorySummaryRow {
    groupName: string | null;
    brand: string | null;
    totalStock: number;
}

interface InventoryData {
    summary: InventorySummaryRow[];
}

export default function HotItemsCarousel() {
    const [items, setItems] = useState<HotItem[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/inventory/upload", { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as InventoryData;
            const hot = data.summary
                .filter((r) => r.totalStock > 0)
                .sort((a, b) => b.totalStock - a.totalStock)
                .slice(0, 10)
                .map((r) => ({
                    name: r.groupName ?? "Produto",
                    brand: r.brand ?? "",
                    stock: r.totalStock,
                }));
            setItems(hot);
        } catch {
            // silent — empty state shown
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const scroll = (dir: "left" | "right") => {
        scrollRef.current?.scrollBy({ left: dir === "left" ? -140 : 140, behavior: "smooth" });
    };

    return (
        <div className="px-4 py-3 shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                    <Flame size={12} style={{ color: "var(--color-stock)" }} />
                    <span
                        className="text-[11px] font-semibold"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        Inventário — Hot Items
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => scroll("left")}
                        className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                        style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-muted)",
                        }}
                        aria-label="Anterior"
                    >
                        <ChevronLeft size={11} />
                    </button>
                    <button
                        onClick={() => scroll("right")}
                        className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                        style={{
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-muted)",
                        }}
                        aria-label="Próximo"
                    >
                        <ChevronRight size={11} />
                    </button>
                </div>
            </div>

            {/* Scrollable row */}
            <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
                {loading ? (
                    [...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-[108px] h-[96px] rounded-xl animate-pulse"
                            style={{ background: "var(--bg-elevated)" }}
                        />
                    ))
                ) : items.length === 0 ? (
                    <div
                        className="flex items-center gap-2 py-3"
                        style={{ color: "var(--text-muted)", fontSize: "11px" }}
                    >
                        <Package size={14} style={{ opacity: 0.3 }} />
                        Sem itens em estoque
                    </div>
                ) : (
                    items.map((item, i) => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-[108px] rounded-xl p-2.5 flex flex-col gap-1.5 cursor-default"
                            style={{
                                background: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                            }}
                        >
                            {/* Image placeholder */}
                            <div
                                className="w-full h-[44px] rounded-lg flex items-center justify-center"
                                style={{ background: "var(--bg-overlay)" }}
                            >
                                <Package size={18} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                            </div>
                            {/* Name */}
                            <span
                                className="text-[10px] font-medium leading-tight line-clamp-2"
                                style={{ color: "var(--text-primary)" }}
                            >
                                {item.brand ? `${item.brand} ` : ""}{item.name}
                            </span>
                            {/* Stock badge */}
                            <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded self-start"
                                style={{
                                    background: "var(--color-ai-sales-bg)",
                                    color: "var(--color-ai-sales)",
                                    border: "1px solid var(--color-ai-sales-border)",
                                }}
                            >
                                {item.stock} un.
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
