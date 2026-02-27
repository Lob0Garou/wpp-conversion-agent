"use client";

import { extractProductSummary, type ProductSummary as ProductSummaryData } from "./ProductSummaryBlock";
import type { ConversationCardData } from "./ConversationCard";

// ─────────────────────────────────────────────────────────────────────────────
// ProductSummary — single-layout product info block for VENDAS cards
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️  DESIGN SYSTEM GUARDRAIL — see DESIGN_SYSTEM.md
//
// LAYOUT RULES:
// 1. Always renders the SAME structure — never switches layouts.
// 2. Optional rows simply disappear; the container stays.
// 3. Shows empty-state "Produto não identificado" if zero data extracted.
// 4. Never shows empty labels like "Mod —".
//
// USAGE:
// • Used ONLY inside VENDAS cards via the CardShell `metadata` slot.
// • Do NOT use this component outside of CardShell.
// • Do NOT add grid/two-column layouts — always a single column of rows.
// • Colors must use CSS vars (--text-xs, --text-muted, --text-primary).
// ─────────────────────────────────────────────────────────────────────────────

interface ProductSummaryProps {
    data: ConversationCardData;
}

/** Capitalize first letter, or return undefined if absent */
function cap(s?: string): string | undefined {
    if (!s) return undefined;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build the headline: "{Category} · {Brand}" or fallback */
function buildHeadline(summary: ProductSummaryData | null, data: ConversationCardData): string {
    if (summary) {
        const parts = [summary.category, summary.brand].filter(Boolean);
        if (parts.length) return parts.join(" · ");
    }
    // Fallback to structured slots
    const slotParts = [
        cap(data.slots?.categoria),
        cap(data.slots?.marca),
    ].filter(Boolean);
    if (slotParts.length) return slotParts.join(" · ");

    return "Produto não identificado";
}

export default function ProductSummary({ data }: ProductSummaryProps) {
    const summary = extractProductSummary(data);
    const headline = buildHeadline(summary, data);

    const model = summary?.model ?? data.slots?.product ?? undefined;
    const size = summary?.size ?? data.slots?.size ?? undefined;
    const color = summary?.color ?? undefined;

    const hasDetails = model || size || color;

    return (
        <div className="bg-black/20 rounded-xl p-3 border border-[var(--border-subtle)] space-y-1">
            {/* Headline — always present */}
            <p className="text-[var(--text-sm)] font-bold text-[var(--text-primary)] truncate">
                {headline}
            </p>

            {/* Detail rows — only shown if data exists, never empty labels */}
            {hasDetails && (
                <div className="space-y-0.5">
                    {model && (
                        <div className="flex items-baseline gap-2">
                            <span className="text-[var(--text-xs)] uppercase font-bold text-[var(--text-muted)] w-7 shrink-0">Mod</span>
                            <span className="text-[var(--text-xs)] font-medium text-[var(--text-secondary)] truncate">{model}</span>
                        </div>
                    )}
                    {size && (
                        <div className="flex items-baseline gap-2">
                            <span className="text-[var(--text-xs)] uppercase font-bold text-[var(--text-muted)] w-7 shrink-0">Tam</span>
                            <span className="text-[var(--text-xs)] font-semibold text-[var(--text-primary)]">{size}</span>
                        </div>
                    )}
                    {color && (
                        <div className="flex items-baseline gap-2">
                            <span className="text-[var(--text-xs)] uppercase font-bold text-[var(--text-muted)] w-7 shrink-0">Cor</span>
                            <span className="text-[var(--text-xs)] font-medium text-[var(--text-secondary)]">{color}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
