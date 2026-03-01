"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { InferredSlots } from "./parseTimeline";
import { extractProductSummary } from "./ProductSummaryBlock";
import CardShell from "./CardShell";
import type { CardVariant } from "./CardShell";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationCardData {
    id: string;
    customerName: string | null;
    customerPhone: string;
    conversationType?: string;
    lastMessage?: string;
    lastMessageAt?: string;
    status: string;
    intent?: string;
    frustrationLevel?: number;
    slots?: InferredSlots;
    lastMessageDirection?: string;
}

interface ConversationCardProps {
    data: ConversationCardData;
    isActive?: boolean;
    isDimmed?: boolean;
    onClick: () => void;
    onResolve?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isSACConversation(data: ConversationCardData): boolean {
    if (data.status === "PENDING_HUMAN" || data.status === "escalated") return true;
    const intent = (data.intent || "").toUpperCase();
    if (intent === "SUPPORT" || intent === "HANDOFF" || (data.frustrationLevel ?? 0) >= 2) return true;
    return false;
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function timeAgo(dateIso?: string): string {
    if (!dateIso) return "agora";
    const ms = Date.now() - new Date(dateIso).getTime();
    if (ms < 60000) return "agora";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
}

/** SLA is 30 minutes. Returns signed elapsed-minutes string, e.g. "-42:17" */
function slaTimer(dateIso?: string, slaMinutes = 30): string {
    if (!dateIso) return "00:00";
    const elapsed = Math.floor((Date.now() - new Date(dateIso).getTime()) / 1000);
    const sla = slaMinutes * 60;
    const delta = elapsed - sla; // positive = breached
    const sign = delta >= 0 ? "-" : "+";
    const abs = Math.abs(delta);
    const mm = String(Math.floor(abs / 60)).padStart(2, "0");
    const ss = String(abs % 60).padStart(2, "0");
    return `${sign}${mm}:${ss}`;
}

function asText(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

function titleize(raw?: string): string | undefined {
    const text = asText(raw);
    if (!text) return undefined;
    const cleaned = text.replace(/[_-]+/g, " ");
    return cleaned
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

function truncateText(text: string | undefined, max = 56): string | undefined {
    if (!text) return undefined;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function extractOrderId(text?: string): string | undefined {
    if (!text) return undefined;
    const match = text.match(/\b(?:pedido|order|#)\s*:?\s*([A-Z0-9-]{5,})\b/i);
    return match?.[1]?.toUpperCase();
}

function extractEmail(text?: string): string | undefined {
    if (!text) return undefined;
    const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    return match?.[0]?.toLowerCase();
}

interface SummaryField {
    label: string;
    value: string;
}

function getSalesSummaryFields(data: ConversationCardData): { description: string; fields: SummaryField[] } {
    const slots = (data.slots ?? {}) as InferredSlots & Record<string, unknown>;
    const summary = extractProductSummary(data);
    const categoria = titleize(asText(slots.categoria) ?? summary?.category);
    const model = asText(slots.product) ?? asText(summary?.model);

    const description = truncateText(
        categoria ??
        (model && model.toLowerCase() !== (summary?.brand ?? "").toLowerCase() ? model : undefined) ??
        [summary?.category, summary?.brand].filter(Boolean).join(" ")
    ) ?? "Produto em negociacao";

    const brand = titleize(summary?.brand ?? asText(slots.marca));
    const size = asText(summary?.size ?? asText(slots.size));
    const color = titleize(summary?.color ?? asText(slots.color) ?? asText(slots.cor));

    const fields: SummaryField[] = [
        { label: "Marca", value: brand ?? "Nao informado" },
        { label: "Tamanho", value: size ?? "Nao informado" },
    ];
    if (color) {
        fields.push({ label: "Cor", value: color });
    }

    return {
        description,
        fields,
    };
}

function hasRequiredSalesData(data: ConversationCardData): boolean {
    const slots = (data.slots ?? {}) as InferredSlots & Record<string, unknown>;
    const summary = extractProductSummary(data);

    const item = asText(slots.categoria) ?? asText(slots.product) ?? asText(summary?.category) ?? asText(summary?.model);
    const size = asText(slots.size) ?? asText(summary?.size);

    return Boolean(item && size);
}

function hasRequiredSacData(data: ConversationCardData): boolean {
    const summary = getSacSummaryFields(data);
    const hasName = summary.name !== "Cliente nao identificado";
    const hasOrder = summary.orderId !== "Nao informado";
    const hasEmail = summary.email !== "Nao informado";
    return hasName || hasOrder || hasEmail;
}

function loud(value: string): string {
    return value.toUpperCase();
}

function contourStyle(strength: "soft" | "strong" = "soft"): CSSProperties {
    if (strength === "strong") {
        return {
            textShadow:
                "0 1px 0 rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.5), 0 0 14px rgba(0,0,0,0.34)",
            letterSpacing: "0.02em",
        };
    }
    return {
        textShadow:
            "0 1px 0 rgba(0,0,0,0.78), 0 1px 4px rgba(0,0,0,0.4), 0 0 10px rgba(0,0,0,0.28)",
        letterSpacing: "0.012em",
    };
}

function getSacSummaryFields(data: ConversationCardData): { name: string; orderId: string; email: string } {
    const slots = (data.slots ?? {}) as InferredSlots & Record<string, unknown>;
    const name = asText(data.customerName) ?? asText(slots.customerName) ?? "Cliente nao identificado";
    const orderId = asText(slots.orderId) ?? extractOrderId(data.lastMessage) ?? "Nao informado";
    const email = asText(slots.email) ?? extractEmail(data.lastMessage) ?? "Nao informado";
    return { name, orderId, email };
}

function SalesHandoffSummary({ data }: { data: ConversationCardData }) {
    const { description, fields } = getSalesSummaryFields(data);
    const slots = (data.slots ?? {}) as InferredSlots & Record<string, unknown>;
    const valueByLabel = new Map(fields.map(field => [field.label, field.value]));
    const model = loud(asText(slots.product) ?? description);
    const color = loud(valueByLabel.get("Cor") ?? "A definir");
    const size = loud(valueByLabel.get("Tamanho") ?? "A definir");
    const status = loud(titleize(asText(slots.statusPedido)) ?? (data.status === "PENDING_HUMAN" ? "Aguardando" : "Em atendimento"));
    const cells = [
        { label: "Modelo", value: model },
        { label: "Cor", value: color },
        { label: "Tamanho", value: size },
        { label: "Status", value: status },
    ];

    return (
        <div
            className="rounded-xl border px-3 py-3 h-full flex flex-col gap-2"
            style={{ background: "var(--color-ai-sales-bg)", borderColor: "var(--color-ai-sales-border)" }}
        >
            <p className="text-center text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--color-ai-sales)" }}>
                Venda
            </p>
            <h3 className="text-center text-[clamp(1.9rem,4.6vw,2.55rem)] font-black leading-[0.9] uppercase break-words" style={{ color: "var(--text-primary)", ...contourStyle("strong") }}>
                {loud(description)}
            </h3>
            <div className="grid grid-cols-2 auto-rows-fr gap-2 flex-1">
                {cells.map((cell, idx) => (
                    <div
                        key={`${cell.label}-${idx}`}
                        className="rounded-xl border p-2.5 min-w-0 flex flex-col items-center justify-center text-center gap-1"
                        style={{
                            borderColor: "color-mix(in srgb, var(--color-ai-sales-border) 60%, transparent)",
                            background: "color-mix(in srgb, var(--color-ai-sales-bg) 80%, transparent)",
                        }}
                    >
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-center" style={{ color: "var(--text-muted)" }}>
                            {cell.label}
                        </p>
                        <p
                            className="text-[clamp(1.22rem,2.7vw,1.72rem)] font-black leading-[0.9] uppercase break-words text-center"
                            style={{ color: cell.value.includes("NAO INFORMADO") || cell.value.includes("A DEFINIR") ? "var(--text-secondary)" : "var(--text-primary)", ...contourStyle("strong") }}
                            title={cell.value}
                        >
                            {cell.value}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
type SacSummaryMode = "sac" | "critical";

function SacHandoffSummary({
    data,
    mode = "sac",
}: {
    data: ConversationCardData;
    mode?: SacSummaryMode;
}) {
    const summary = getSacSummaryFields(data);
    const isCritical = mode === "critical";
    const accent = isCritical ? "var(--color-danger)" : "var(--color-warning)";
    const background = `color-mix(in srgb, ${accent} 14%, transparent)`;
    const borderColor = `color-mix(in srgb, ${accent} 42%, transparent)`;
    const title = loud(asText(data.slots?.motivoTroca) ?? asText(data.lastMessage) ?? "Atendimento em andamento");

    return (
        <div
            className="rounded-xl border px-3 py-3 h-full flex flex-col gap-2"
            style={{ background, borderColor }}
        >
            <p className="text-center text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: accent }}>
                {isCritical ? "Chamado SAC" : "SAC"}
            </p>
            <h3 className="text-center text-[clamp(1.45rem,3.9vw,2.2rem)] font-black leading-[0.9] uppercase break-words line-clamp-2" style={{ color: "var(--text-primary)", ...contourStyle("strong") }}>
                {title}
            </h3>
            <div className="grid grid-rows-3 flex-1 rounded-xl border overflow-hidden" style={{ borderColor: "color-mix(in srgb, var(--border-subtle) 72%, transparent)" }}>
                <div className="px-2.5 py-2 text-center flex flex-col items-center justify-center gap-1" style={{ background: "color-mix(in srgb, var(--bg-elevated) 68%, transparent)" }}>
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] block text-center" style={{ color: "var(--text-muted)" }}>
                        Nome
                    </span>
                    <p className="text-[clamp(1.16rem,2.55vw,1.66rem)] font-black leading-[0.9] uppercase break-words text-center" style={{ color: accent, ...contourStyle("strong") }}>
                        {loud(summary.name)}
                    </p>
                </div>
                <div className="px-2.5 py-2 border-t border-[var(--border-subtle)] text-center flex flex-col items-center justify-center gap-1" style={{ background: "color-mix(in srgb, var(--bg-elevated) 58%, transparent)" }}>
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] block text-center" style={{ color: "var(--text-muted)" }}>
                        Pedido
                    </span>
                    <p className="text-[clamp(1.16rem,2.55vw,1.66rem)] font-black leading-[0.9] uppercase break-words text-center" style={{ color: "var(--text-primary)", ...contourStyle("strong") }}>
                        {loud(summary.orderId)}
                    </p>
                </div>
                <div className="px-2.5 py-2 border-t border-[var(--border-subtle)] text-center flex flex-col items-center justify-center gap-1" style={{ background: "color-mix(in srgb, var(--bg-elevated) 48%, transparent)" }}>
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] block text-center" style={{ color: "var(--text-muted)" }}>
                        E-mail
                    </span>
                    <p className="text-[clamp(0.95rem,2.15vw,1.18rem)] font-black leading-[0.9] uppercase break-all text-center" style={{ color: "var(--text-secondary)", ...contourStyle() }}>
                        {loud(summary.email)}
                    </p>
                </div>
            </div>
        </div>
    );
}
function getBaseVariant(data: ConversationCardData): Exclude<CardVariant, "CRITICAL"> {
    const { slots, intent, status } = data;
    const intentStr = (intent || "").toUpperCase();
    const conversationType = (data.conversationType || "").toLowerCase();
    const lastMessageLower = (data.lastMessage || "").toLowerCase();
    const summary = extractProductSummary(data);
    const hasSalesSignals = Boolean(
        slots?.product ||
        slots?.marca ||
        slots?.categoria ||
        slots?.size ||
        slots?.color ||
        slots?.cor ||
        summary?.brand ||
        summary?.category ||
        summary?.size ||
        summary?.model
    );
    const hasSacSignals = Boolean(slots?.motivoTroca || slots?.orderId || slots?.statusPedido || slots?.email);
    const hasSalesHandoffLanguage = Boolean(
        lastMessageLower.includes("vendedor") ||
        lastMessageLower.includes("time de vendas") ||
        lastMessageLower.includes("consultor") ||
        lastMessageLower.includes("te direcionar para um vendedor")
    );
    const isInfoIntent = intentStr.startsWith("INFO") || intentStr === "CLARIFICATION";
    const isSalesIntent = intentStr === "SALES" || intentStr === "NEGOTIATION" || intentStr === "PURCHASE" || intentStr === "CLOSING_SALE";

    // Backend type should guide, but not force a false sales card when there's no product signal.
    if (conversationType === "sac") {
        if (!hasSacSignals && hasSalesHandoffLanguage) return "VENDAS";
        return "SAC";
    }
    if (conversationType === "sales") {
        if (hasSalesSignals || isSalesIntent || hasSalesHandoffLanguage) return "VENDAS";
        if (isInfoIntent || !hasSacSignals) return "GERAL";
    }

    // Strong SAC signals first
    if (hasSacSignals || intentStr === "SUPPORT") return "SAC";
    // HANDOFF without product context behaves as SAC
    if (intentStr === "HANDOFF" && !hasSalesSignals) return "SAC";

    // Sales signals: product context from slots or inferred summary
    if (hasSalesSignals) return "VENDAS";
    // VENDAS: known categories that imply purchase intent
    if (slots?.categoria === "tenis" || slots?.categoria === "chuteira" || slots?.categoria === "sandalia") return "VENDAS";
    // Sales-oriented intents
    if (isSalesIntent) return "VENDAS";
    // Escalations without context default to SAC
    if (status === "PENDING_HUMAN" || status === "escalated") return "SAC";

    // Default
    return "GERAL";
}

function getVariant(data: ConversationCardData, isCritical: boolean): CardVariant {
    if (isCritical) return "CRITICAL";
    return getBaseVariant(data);
}

// ───────────────────────────────────────────────────────────────────────────────
// Intent summary helpers
// ───────────────────────────────────────────────────────────────────────────────

/** Build a compact intent summary string: "Tênis Nike Tam 41" or a lastMessage snippet */
function intentSummaryFor(data: ConversationCardData): string | undefined {
    const { slots, lastMessage } = data;

    // Product path: at most 3 pieces of info
    if (slots) {
        const parts: string[] = [];
        if (slots.categoria) parts.push(cap(slots.categoria));
        if (slots.marca) parts.push(cap(slots.marca));
        if (slots.size) parts.push(`Tam ${slots.size}`);
        if (parts.length) return parts.slice(0, 3).join(" ");
    }

    // Fallback: first ~40 chars of last message
    if (lastMessage) {
        const trimmed = lastMessage.trim();
        return trimmed.length > 42 ? trimmed.slice(0, 40).trimEnd() + "…" : trimmed;
    }

    return undefined;
}

function cap(s?: string): string {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Lead status badge
// ───────────────────────────────────────────────────────────────────────────────

type LeadTemp = "QUENTE" | "MORNO" | "FRIO";

function getLeadTemp(data: ConversationCardData, variant: CardVariant): LeadTemp {
    // CRITICAL is always QUENTE
    if (variant === "CRITICAL") return "QUENTE";
    // High frustration or explicit SAC escalation = QUENTE
    if ((data.frustrationLevel ?? 0) >= 2 || data.status === "PENDING_HUMAN") return "QUENTE";
    // Active product signals = MORNO
    if (variant === "VENDAS") return "MORNO";
    // SAC without escalation = MORNO
    if (variant === "SAC") return "MORNO";
    // GERAL with a message = FRIO
    return "FRIO";
}

const LEAD_BADGE_STYLES: Record<LeadTemp, string> = {
    QUENTE: "bg-red-500/10   text-red-400   border-red-500/20",
    MORNO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    FRIO: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function LeadBadge({ temp }: { temp: LeadTemp }) {
    return (
        <span
            className={`text-[var(--text-xs)] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${LEAD_BADGE_STYLES[temp]
                }`}
        >
            {temp}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared CTA helpers — unified across all variants
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️  DESIGN SYSTEM GUARDRAIL — see DESIGN_SYSTEM.md
//
// CTA RULES:
// • All card CTAs MUST use footerCtaFor() — never inline CTA markup per variant.
// • CTAs live in the CardShell footer zone ONLY — never float or overlap content.
// • All CTAs call e.stopPropagation() to prevent card click-through.
// • Hover states are standardized: emerald-300 (resolve), brightness-110 (prioritize).
// • Never apply custom opacity per variant (e.g. opacity-50 hover:opacity-100).
// • Never use absolute positioning for buttons.
// ─────────────────────────────────────────────────────────────────────────────

function EncerradoBadge() {
    return (
        <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--text-muted)] border border-[var(--border-default)] px-3 py-1.5 rounded-lg">
            Encerrado
        </span>
    );
}

function ResolveBtn({ onClick }: { onClick?: () => void }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            className="px-3 py-1.5 rounded-lg text-[var(--text-xs)] font-bold uppercase tracking-widest text-white transition-all hover:brightness-110 active:scale-95 shadow-lg"
            style={{
                background: "var(--color-success)",
                boxShadow: "0 10px 18px rgba(22, 163, 74, 0.30)",
            }}
            title="Resolvido"
        >
            Resolver
        </button>
    );
}

function PrioritizeBtn({ onClick }: { onClick?: () => void }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            className="bg-[var(--color-danger)] hover:brightness-110 active:scale-95 text-white px-4 py-2 rounded-xl text-[var(--text-xs)] font-bold uppercase tracking-widest transition-all"
            style={{ boxShadow: "0 10px 18px rgba(220, 38, 38, 0.30)" }}
        >
            Priorizar
        </button>
    );
}

/** Pick the right CTA for the footer: Encerrado, Priorizar, or Resolver */
function footerCtaFor(variant: CardVariant, isClosed: boolean, onResolve?: () => void): ReactNode {
    if (isClosed) return <EncerradoBadge />;
    if (variant === "CRITICAL") return <PrioritizeBtn onClick={onResolve} />;
    return <ResolveBtn onClick={onResolve} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConversationCard
// ─────────────────────────────────────────────────────────────────────────────

export default function ConversationCard({
    data, isActive = false, isDimmed = false, onClick, onResolve,
}: ConversationCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const { customerName, customerPhone, lastMessage, lastMessageAt, slots, status } = data;

    const isExplicitEscalated = status === "escalated";
    const isPendingHuman = status === "PENDING_HUMAN";
    const isHighFrustration = (data.frustrationLevel ?? 0) >= 2;
    const isCritical = isExplicitEscalated || (isPendingHuman && isHighFrustration);

    const baseVariant = getBaseVariant(data);
    const variant = getVariant(data, isCritical);
    const isClosed = status === "closed";

    const displayName = customerName || `Cliente ...${customerPhone.slice(-4)}`;
    const initials = getInitials(displayName);

    // Tick timer every second only for CRITICAL cards
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (variant !== "CRITICAL") return;
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [variant]);
    void tick; // used to trigger re-render

    // ── CRITICAL ─────────────────────────────────────────────────────────────
    if (variant === "CRITICAL") {
        const timer = slaTimer(lastMessageAt, 30);
        const summary = intentSummaryFor(data);
        const criticalAsSales = baseVariant === "VENDAS";
        const criticalAsSac = baseVariant === "SAC";
        const salesReady = criticalAsSales && hasRequiredSalesData(data);
        const sacReady = criticalAsSac && hasRequiredSacData(data);
        const criticalTone = criticalAsSales ? "var(--color-ai-sales)" : criticalAsSac ? "var(--color-warning)" : "var(--color-danger)";
        const criticalGlowStrength = salesReady || sacReady ? 52 : 30;
        const criticalSurfaceStyle = {
            borderColor: criticalTone,
            boxShadow: `0 0 0 1px color-mix(in srgb, ${criticalTone} 88%, transparent), 0 0 36px color-mix(in srgb, ${criticalTone} ${criticalGlowStrength}%, transparent)`,
        };

        return (
            <CardShell
                variant="CRITICAL"
                isActive={isActive}
                isDimmed={isDimmed}
                isClosed={isClosed}
                onClick={onClick}
                innerRef={cardRef}
                extraClassName=""
                surfaceStyle={criticalSurfaceStyle}
                categoryLabel={criticalAsSales ? "Chamado Vendas" : "Chamado SAC"}
                displayName={displayName}
                timeAgo={timeAgo(lastMessageAt)}
                intentSummary={summary}
                avatar={{ initials }}
                badge={
                    <div className="flex gap-1.5 shrink-0">
                        <span
                            className="text-white text-[var(--text-xs)] font-black px-2 py-0.5 rounded flex items-center gap-1 font-mono"
                            style={{ background: criticalTone }}
                        >
                            <span className="material-symbols-rounded text-[11px]">timer</span>
                            {timer}
                        </span>
                        <span
                            className="text-[var(--text-xs)] font-black px-2 py-0.5 rounded border uppercase"
                            style={{
                                color: criticalTone,
                                borderColor: `color-mix(in srgb, ${criticalTone} 52%, transparent)`,
                                background: `color-mix(in srgb, ${criticalTone} 18%, transparent)`,
                            }}
                        >
                            Crítico
                        </span>
                    </div>
                }
                metadata={criticalAsSales ? <SalesHandoffSummary data={data} /> : <SacHandoffSummary data={data} mode="critical" />}
                footerCta={footerCtaFor(variant, isClosed, onResolve)}
            />
        );
    }

    // ── VENDAS ────────────────────────────────────────────────────────────────
    if (variant === "VENDAS") {
        const statusPedido = slots?.statusPedido;
        const summary = intentSummaryFor(data);
        const leadTemp = getLeadTemp(data, variant);
        const salesReady = hasRequiredSalesData(data);
        const salesSurfaceStyle = {
            borderColor: "var(--color-ai-sales)",
            boxShadow: salesReady
                ? "0 0 0 1px color-mix(in srgb, var(--color-ai-sales) 78%, transparent), 0 0 30px color-mix(in srgb, var(--color-ai-sales) 45%, transparent)"
                : "0 0 0 1px color-mix(in srgb, var(--color-ai-sales) 46%, transparent), 0 0 18px color-mix(in srgb, var(--color-ai-sales) 24%, transparent)",
        };
        return (
            <CardShell
                variant="VENDAS"
                isActive={isActive}
                isDimmed={isDimmed}
                isClosed={isClosed}
                onClick={onClick}
                innerRef={cardRef}
                surfaceStyle={salesSurfaceStyle}
                categoryLabel="Nova Venda"
                displayName={displayName}
                timeAgo={timeAgo(lastMessageAt)}
                intentSummary={summary}
                avatar={{ initials }}
                badge={
                    <div className="flex gap-1.5 shrink-0">
                        <LeadBadge temp={leadTemp} />
                        {statusPedido && (
                            <span className="text-[var(--text-xs)] font-black uppercase tracking-widest text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                {statusPedido}
                            </span>
                        )}
                    </div>
                }
                metadata={<SalesHandoffSummary data={data} />}
                footerCta={footerCtaFor(variant, isClosed, onResolve)}
            />
        );
    }

    // ── SAC ───────────────────────────────────────────────────────────────────
    if (variant === "SAC") {
        const summary = intentSummaryFor(data);
        const leadTemp = getLeadTemp(data, variant);
        const sacReady = hasRequiredSacData(data);
        const sacSurfaceStyle = {
            borderColor: "var(--color-warning)",
            boxShadow: sacReady
                ? "0 0 0 1px color-mix(in srgb, var(--color-warning) 76%, transparent), 0 0 30px color-mix(in srgb, var(--color-warning) 42%, transparent)"
                : "0 0 0 1px color-mix(in srgb, var(--color-warning) 48%, transparent), 0 0 18px color-mix(in srgb, var(--color-warning) 26%, transparent)",
        };
        return (
            <CardShell
                variant="SAC"
                isActive={isActive}
                isDimmed={isDimmed}
                isClosed={isClosed}
                onClick={onClick}
                innerRef={cardRef}
                surfaceStyle={sacSurfaceStyle}
                categoryLabel="SAC"
                displayName={displayName}
                timeAgo={timeAgo(lastMessageAt)}
                intentSummary={summary}
                avatar={{ initials }}
                badge={<LeadBadge temp={leadTemp} />}
                metadata={<SacHandoffSummary data={data} />}
                footerCta={footerCtaFor(variant, isClosed, onResolve)}
            />
        );
    }

    // ── GERAL (default) ─────────────────────────────────────────────────────────────────────────────
    const geralSummary = intentSummaryFor(data);
    const geralTemp = getLeadTemp(data, variant);
    return (
        <CardShell
            variant="GERAL"
            isActive={isActive}
            isDimmed={isDimmed}
            isClosed={isClosed}
            onClick={onClick}
            innerRef={cardRef}
            categoryLabel="Geral"
            displayName={displayName}
            timeAgo={timeAgo(lastMessageAt)}
            intentSummary={geralSummary}
            avatar={{ initials }}
            badge={<LeadBadge temp={geralTemp} />}
            quote={
                lastMessage && data.lastMessageDirection !== "outbound" ? (
                    lastMessage
                ) : undefined
            }
            footerCta={footerCtaFor(variant, isClosed, onResolve)}
        />
    );
}


