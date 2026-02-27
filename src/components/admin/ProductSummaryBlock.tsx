"use client";

import type { ConversationCardData } from "./ConversationCard";

// ─────────────────────────────────────────────────────────────────────────────
// Dictionaries
// ─────────────────────────────────────────────────────────────────────────────

const BRANDS = [
    "Nike", "Adidas", "Asics", "Mizuno", "Puma", "Under Armour", "Umbro",
    "Oakley", "Olympikus", "Penalty", "Fila", "New Balance", "Reebok",
    "Vans", "Converse", "Oxer", "Topper", "Speedo", "Centauro", "Dri-FIT",
    "Jordan", "Hering", "Billabong", "Quiksilver",
];

// key (lowercase) → display label
const CATEGORIES: Record<string, string> = {
    tenis: "Tênis", tênis: "Tênis",
    chuteira: "Chuteira",
    camisa: "Camisa", camiseta: "Camiseta",
    regata: "Regata",
    calca: "Calça", calção: "Calção", calçao: "Calção",
    bermuda: "Bermuda", short: "Short",
    top: "Top", legging: "Legging",
    meia: "Meia",
    sandalia: "Sandália", sandália: "Sandália", chinelo: "Chinelo",
    bota: "Bota",
    bolsa: "Bolsa", mochila: "Mochila",
};

const COLORS = [
    "preto", "preta", "branco", "branca", "azul", "vermelho", "vermelha",
    "cinza", "verde", "amarelo", "amarela", "laranja", "roxo", "rosa",
    "marinho", "cobre", "prata", "dourado", "coral", "bege", "off-white",
    "navy", "vinho", "caramelo",
];

// Matches: "tam 41", "tamanho: G", "tam-43", "size M"
const SIZE_RE = /\b(?:tam(?:anho)?|size)\s*[:\-]?\s*(pp|p|m|gg?|xg|\d{2})\b/i;
// Standalone numeric size (used only when we already have brand/category context)
const SIZE_NUM_RE = /\b(3[5-9]|4[0-9]|5[0-2])\b/;
const SIZE_LETTER_RE = /\b(PP|P|M|GG|XG)\b/;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductSummary {
    category?: string;
    brand?: string;
    model?: string;
    size?: string;
    color?: string;
    confidence: "high" | "medium" | "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction
// ─────────────────────────────────────────────────────────────────────────────

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Extracts a structured product summary from a ConversationCardData.
 * Priority: structured slots → heuristic parsing of lastMessage.
 * Returns null if no product signals are found.
 */
export function extractProductSummary(data: ConversationCardData): ProductSummary | null {
    const { slots, lastMessage } = data;
    const raw = lastMessage ?? "";
    const text = raw.toLowerCase();

    // ── 1. Seed from structured slots ────────────────────────────────────────
    let category: string | undefined = slots?.categoria
        ? (CATEGORIES[slots.categoria.toLowerCase()] ?? cap(slots.categoria))
        : undefined;

    let brand: string | undefined = slots?.marca ? cap(slots.marca) : undefined;
    // Normalise brand capitalisation against dictionary
    if (brand) {
        const match = BRANDS.find(b => b.toLowerCase() === brand!.toLowerCase());
        if (match) brand = match;
    }

    let model: string | undefined = slots?.product ?? undefined;
    let size: string | undefined = slots?.size ?? undefined;
    let color: string | undefined;

    // ── 2. Heuristic augmentation from lastMessage ───────────────────────────

    // Brand
    if (!brand && text) {
        for (const b of BRANDS) {
            if (text.includes(b.toLowerCase())) { brand = b; break; }
        }
    }

    // Category
    if (!category && text) {
        for (const [key, label] of Object.entries(CATEGORIES)) {
            if (text.includes(key)) { category = label; break; }
        }
    }

    // Size — explicit pattern first
    if (!size && text) {
        const m = text.match(SIZE_RE);
        if (m) {
            size = m[1].toUpperCase();
        } else if (brand || category) {
            // Standalone numeric/letter only when we have context (avoids false positives)
            const mn = text.match(SIZE_NUM_RE);
            if (mn) size = mn[1];
            else {
                const ml = text.match(SIZE_LETTER_RE);
                if (ml) size = ml[1];
            }
        }
    }

    // Color
    if (text) {
        for (const c of COLORS) {
            if (text.includes(c)) { color = cap(c); break; }
        }
    }

    // ── 3. Nothing found → let caller render fallback ────────────────────────
    if (!brand && !category && !size) return null;

    // ── 4. Confidence ────────────────────────────────────────────────────────
    const fields = [category, brand, model, size, color].filter(Boolean).length;
    const confidence: ProductSummary["confidence"] =
        fields >= 4 ? "high" : fields >= 2 ? "medium" : "low";

    return { category, brand, model, size, color, confidence };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    summary: ProductSummary;
    /** Optional 1-line intent snippet shown below the block (muted, italic) */
    snippet?: string;
}

export default function ProductSummaryBlock({ summary, snippet }: Props) {
    const { model, size, color } = summary;
    const hasAttributes = model || size || color;

    // ── Full-info layout — attributes only (title is in card h2) ─────────────
    if (hasAttributes) {
        return (
            <div className="flex flex-col gap-2">
                {/* Dark inset block — attributes only */}
                <div className="bg-black/30 rounded-xl p-3 border border-white/[0.04] space-y-1.5">
                    {model && (
                        <div className="flex items-baseline gap-2">
                            <span className="text-[9px] uppercase font-bold text-slate-500 w-6 shrink-0">Mod</span>
                            <span className="text-xs font-medium text-slate-300 truncate">{model}</span>
                        </div>
                    )}
                    {size && (
                        <div className="flex items-baseline gap-2">
                            <span className="text-[9px] uppercase font-bold text-slate-500 w-6 shrink-0">Tam</span>
                            <span className="text-xs font-semibold text-white">{size}</span>
                        </div>
                    )}
                    {color && (
                        <div className="flex items-baseline gap-2">
                            <span className="text-[9px] uppercase font-bold text-slate-500 w-6 shrink-0">Cor</span>
                            <span className="text-xs font-medium text-slate-300">{color}</span>
                        </div>
                    )}
                </div>

                {/* Intent snippet — 1 line, muted */}
                {snippet && (
                    <p className="text-[11px] text-slate-500 italic line-clamp-1 leading-snug">
                        &ldquo;{snippet}&rdquo;
                    </p>
                )}
            </div>
        );
    }

    // ── Partial / inline — only snippet, title already in h2 ─────────────────
    return snippet ? (
        <p className="text-[11px] text-slate-500 italic line-clamp-1 leading-snug">
            &ldquo;{snippet}&rdquo;
        </p>
    ) : null;
}
