"use client";

import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️  DESIGN SYSTEM GUARDRAIL — see DESIGN_SYSTEM.md
//
// STRUCTURE RULES:
// • Header / Body / Footer layout is IMMUTABLE — do NOT add or remove zones.
// • Visual differences between variants come ONLY from VARIANT_STYLES below.
// • Body uses flex-1 + overflow-hidden — content can never break out of card.
// • Footer uses mt-auto — always pinned to bottom, no absolute positioning.
//
// TOKEN RULES:
// • Colors: always use CSS vars from design-system.css (--bg-*, --text-*, --border-*).
// • Typography: 3 tiers only — var(--text-xs), var(--text-sm), var(--text-base).
// • Never use hardcoded hex colors (#xxxxxx).
//
// VARIANT RULES:
// • To add a new variant: add entry to VARIANT_STYLES + CardVariant type.
// • Do NOT add per-variant layout logic inside the JSX.
// • Use extraClassName for animations only (e.g. animate-pulse-red).
// ─────────────────────────────────────────────────────────────────────────────

export type CardVariant = "CRITICAL" | "VENDAS" | "SAC" | "GERAL";

export interface CardShellProps {
    variant: CardVariant;
    isActive?: boolean;
    isDimmed?: boolean;
    isClosed?: boolean;
    onClick: () => void;

    // ── Header ──────────────────────────────────────────
    categoryLabel: string;            // e.g. "Nova Venda", "SAC", "Geral", "Chamado SAC"
    displayName: string;
    timeAgo: string;
    badge?: ReactNode;                // top-right badges (timer, "Crítico", statusPedido)

    // ── Body ────────────────────────────────────────────
    metadata?: ReactNode;             // rows (phone, orderId, motivo) or ProductSummaryBlock
    quote?: ReactNode;                // 1-line last message snippet
    intentSummary?: string;           // e.g. "Tênis Nike Tam 41" — sub-title under displayName

    // ── Footer ──────────────────────────────────────────
    avatar: { initials: string };
    footerCta: ReactNode;             // resolve button, "Encerrado" badge, or "Priorizar"

    // ── Extras ──────────────────────────────────────────
    extraClassName?: string;          // e.g. "animate-pulse-red" for CRITICAL
    innerRef?: React.Ref<HTMLDivElement>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant Style Map
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<CardVariant, {
    borderClass: string;
    labelColor: string;
    avatarBg: string;
    avatarText: string;
    shadowClass: string;
}> = {
    CRITICAL: {
        borderClass: "border-2 border-[var(--color-danger)]",
        labelColor: "text-[var(--color-danger)]",
        avatarBg: "bg-[rgba(220,38,38,0.2)]",
        avatarText: "text-[var(--color-danger)]",
        shadowClass: "shadow-2xl shadow-red-900/30",
    },
    VENDAS: {
        borderClass: "border border-[var(--border-subtle)]",
        labelColor: "text-[var(--color-ai-sales)]",
        avatarBg: "bg-[var(--bg-overlay)]",
        avatarText: "text-[var(--text-primary)]",
        shadowClass: "shadow-lg",
    },
    SAC: {
        borderClass: "border border-[var(--border-subtle)]",
        labelColor: "text-[var(--color-brand)]",
        avatarBg: "bg-[rgba(227,0,15,0.2)]",
        avatarText: "text-[var(--color-brand)]",
        shadowClass: "shadow-lg",
    },
    GERAL: {
        borderClass: "border border-[var(--border-subtle)]",
        labelColor: "text-[var(--text-muted)]",
        avatarBg: "bg-[var(--bg-overlay)]",
        avatarText: "text-[var(--text-secondary)]",
        shadowClass: "shadow-lg",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// CardShell — Shared template for all conversation card variants
// ─────────────────────────────────────────────────────────────────────────────
//
// Structure (immutable across variants):
//
// ┌─────────────────────────────────────────────┐
// │ HEADER: categoryLabel + badge  │  timeAgo   │
// │ Title: displayName (text-sm/14px)           │
// ├─────────────────────────────────────────────┤
// │ BODY: metadata? + quote?                    │
// ├─────────────────────────────────────────────┤
// │ FOOTER: avatar + name  │  footerCta         │
// └─────────────────────────────────────────────┘

export default function CardShell({
    variant,
    isActive = false,
    isDimmed = false,
    onClick,
    categoryLabel,
    displayName,
    timeAgo,
    badge,
    metadata,
    quote,
    intentSummary,
    avatar,
    footerCta,
    extraClassName,
    innerRef,
}: CardShellProps) {
    const styles = VARIANT_STYLES[variant];

    const wrapperClasses = [
        // Structure
        "relative flex flex-col h-full rounded-2xl p-4",
        // Surface
        "bg-[var(--bg-surface)]",
        styles.borderClass,
        styles.shadowClass,
        // Interaction
        "cursor-pointer transition-all duration-200",
        // State
        isActive ? "scale-[1.01] ring-1 ring-white/15 z-20" : "",
        isDimmed
            ? "opacity-40 grayscale-[0.5] hover:opacity-80 hover:grayscale-0"
            : "hover:border-[var(--border-strong)]",
        // Variant extras (e.g. animate-pulse-red)
        extraClassName ?? "",
    ].filter(Boolean).join(" ");

    return (
        <div ref={innerRef} onClick={onClick} className={wrapperClasses}>

            {/* ── HEADER ──────────────────────────────────────── */}
            <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <p className={`text-[var(--text-xs)] font-bold uppercase tracking-widest ${styles.labelColor}`}>
                            {categoryLabel}
                        </p>
                        {badge}
                    </div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)] leading-tight truncate">
                        {displayName}
                    </h2>
                    {intentSummary && (
                        <p className="text-[var(--text-xs)] text-[var(--text-muted)] truncate leading-tight mt-0.5">
                            {intentSummary}
                        </p>
                    )}
                </div>
                <span className="text-[var(--text-xs)] text-[var(--text-muted)] font-mono shrink-0 ml-3 mt-0.5">
                    {timeAgo}
                </span>
            </div>

            {/* ── BODY ────────────────────────────────────────── */}
            <div className="flex flex-col gap-2 mb-3 flex-1 overflow-hidden">
                {metadata}
                {quote && (
                    <div className="text-[var(--text-sm)] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                        {quote}
                    </div>
                )}
            </div>

            {/* ── FOOTER ──────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-auto pt-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-full ${styles.avatarBg} flex items-center justify-center text-[var(--text-xs)] font-bold ${styles.avatarText} shrink-0`}>
                        {avatar.initials}
                    </div>
                    <span className="text-[var(--text-sm)] text-[var(--text-secondary)] truncate max-w-[110px]">
                        {displayName}
                    </span>
                </div>
                {footerCta}
            </div>
        </div>
    );
}
