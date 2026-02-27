"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { InferredSlots } from "./parseTimeline";
import ProductSummary from "./ProductSummary";
import CardShell from "./CardShell";
import type { CardVariant } from "./CardShell";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationCardData {
    id: string;
    customerName: string | null;
    customerPhone: string;
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

function formatPhone(raw: string): string {
    // "558578747045" → "+55 85 78747045"
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) {
        const ddd = digits.slice(2, 4);
        const num = digits.slice(4);
        return `+55 ${ddd} ${num}`;
    }
    return `+${digits}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant detection
// ─────────────────────────────────────────────────────────────────────────────

function getVariant(data: ConversationCardData, isCritical: boolean): CardVariant {
    if (isCritical) return "CRITICAL";

    const { slots, intent, status } = data;
    const intentStr = (intent || "").toUpperCase();

    // Explicit SAC status
    if (status === "PENDING_HUMAN" || status === "escalated") return "SAC";

    // SAC signals from slots
    if (slots?.motivoTroca || slots?.orderId || slots?.statusPedido) return "SAC";

    // SAC signals from intent
    if (intentStr === "SUPPORT" || intentStr === "HANDOFF") return "SAC";

    // VENDAS signals: has product brand or explicit product
    if (slots?.marca || slots?.product) return "VENDAS";

    // VENDAS: has product category that implies a purchase intent
    if (slots?.categoria === "tenis" || slots?.categoria === "chuteira" || slots?.categoria === "sandalia") return "VENDAS";

    // Default: GERAL (info requests, general queries, etc.)
    return "GERAL";
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
            className="material-symbols-rounded text-emerald-400 hover:text-emerald-300 text-2xl active:scale-90 transition-all"
            title="Resolvido"
        >
            check_circle
        </button>
    );
}

function PrioritizeBtn({ onClick }: { onClick?: () => void }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            className="bg-[var(--color-danger)] hover:brightness-110 active:scale-95 text-white px-4 py-2 rounded-xl text-[var(--text-xs)] font-bold uppercase tracking-widest transition-all"
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
        return (
            <CardShell
                variant="CRITICAL"
                isActive={isActive}
                isDimmed={isDimmed}
                isClosed={isClosed}
                onClick={onClick}
                innerRef={cardRef}
                extraClassName="animate-pulse-red"
                categoryLabel="Chamado SAC"
                displayName={displayName}
                timeAgo={timeAgo(lastMessageAt)}
                intentSummary={summary}
                avatar={{ initials }}
                badge={
                    <div className="flex gap-1.5 shrink-0">
                        <span className="bg-[var(--color-danger)] text-white text-[var(--text-xs)] font-black px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                            <span className="material-symbols-rounded text-[11px]">timer</span>
                            {timer}
                        </span>
                        <span className="bg-red-500/20 text-[var(--color-danger)] text-[var(--text-xs)] font-black px-2 py-0.5 rounded border border-red-500/30 uppercase animate-pulse">
                            Crítico
                        </span>
                    </div>
                }
                metadata={
                    <div className="space-y-0">
                        <div className="flex justify-between items-center py-1.5 border-b border-[var(--border-subtle)]">
                            <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">Telefone</span>
                            <span className="text-[var(--text-xs)] font-semibold text-[var(--text-primary)]">{formatPhone(customerPhone)}</span>
                        </div>
                        {slots?.orderId ? (
                            <div className="flex justify-between items-center py-1.5">
                                <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">Pedido</span>
                                <span className="text-[var(--text-xs)] font-mono font-bold text-[var(--color-danger)]"># {slots.orderId}</span>
                            </div>
                        ) : (
                            <div className="flex justify-between items-center py-1.5">
                                <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">Motivo</span>
                                <span className="text-[var(--text-xs)] font-semibold text-[var(--text-primary)] truncate max-w-[140px]">
                                    {slots?.motivoTroca || "Escalado"}
                                </span>
                            </div>
                        )}
                    </div>
                }
                quote={
                    lastMessage ? (
                        <span className="italic">&ldquo;{lastMessage}&rdquo;</span>
                    ) : undefined
                }
                footerCta={footerCtaFor(variant, isClosed, onResolve)}
            />
        );
    }

    // ── VENDAS ────────────────────────────────────────────────────────────────
    if (variant === "VENDAS") {
        const statusPedido = slots?.statusPedido;
        const summary = intentSummaryFor(data);
        const leadTemp = getLeadTemp(data, variant);
        return (
            <CardShell
                variant="VENDAS"
                isActive={isActive}
                isDimmed={isDimmed}
                isClosed={isClosed}
                onClick={onClick}
                innerRef={cardRef}
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
                metadata={<ProductSummary data={data} />}
                footerCta={footerCtaFor(variant, isClosed, onResolve)}
            />
        );
    }

    // ── SAC ───────────────────────────────────────────────────────────────────
    if (variant === "SAC") {
        const summary = intentSummaryFor(data);
        const leadTemp = getLeadTemp(data, variant);
        return (
            <CardShell
                variant="SAC"
                isActive={isActive}
                isDimmed={isDimmed}
                isClosed={isClosed}
                onClick={onClick}
                innerRef={cardRef}
                categoryLabel="SAC"
                displayName={displayName}
                timeAgo={timeAgo(lastMessageAt)}
                intentSummary={summary}
                avatar={{ initials }}
                badge={<LeadBadge temp={leadTemp} />}
                metadata={
                    <div className="space-y-0">
                        <div className="flex justify-between items-center py-1.5 border-b border-[var(--border-subtle)]">
                            <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">Telefone</span>
                            <span className="text-[var(--text-xs)] font-semibold text-[var(--text-primary)]">{formatPhone(customerPhone)}</span>
                        </div>
                        {slots?.orderId ? (
                            <div className="flex justify-between items-center py-1.5">
                                <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">Pedido</span>
                                <span className="text-[var(--text-xs)] font-mono font-bold text-[var(--text-secondary)]"># {slots.orderId}</span>
                            </div>
                        ) : slots?.motivoTroca ? (
                            <div className="flex justify-between items-center py-1.5">
                                <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">Motivo</span>
                                <span className="text-[var(--text-xs)] font-semibold text-[var(--text-primary)] truncate max-w-[140px]">{slots.motivoTroca}</span>
                            </div>
                        ) : null}
                    </div>
                }
                quote={
                    lastMessage && data.lastMessageDirection !== "outbound" ? (
                        <div className="bg-[var(--bg-elevated)] p-2 rounded-lg border-l-2 border-[var(--color-brand)]/50 italic">
                            &ldquo;{lastMessage}&rdquo;
                        </div>
                    ) : undefined
                }
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
