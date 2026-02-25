"use client";

import { Phone, MessageSquare, Clock, Zap } from "lucide-react";
import LiveCart from "./LiveCart";
import QuickActions from "./QuickActions";
import AgentStatusPanel from "./AgentStatusPanel";
import { inferSlotsFromMessages, type RawMessage } from "./parseTimeline";

interface CustomerContextProps {
    customerName: string | null;
    customerPhone: string;
    conversationId: string;
    status: string;
    messages: RawMessage[];
    onStatusChange: () => void;
    // Customer stats for "Novo cliente" tag
    ltv?: number;
    pedidos?: number;
    // Potential level for banner
    potential?: "alta" | "média" | "baixa";
}

const AVATAR_COLORS = [
    "from-blue-600 to-blue-400",
    "from-violet-600 to-violet-400",
    "from-rose-600 to-rose-400",
    "from-amber-600 to-amber-400",
    "from-cyan-600 to-cyan-400",
    "from-emerald-600 to-emerald-400",
];

function getAvatarGradient(phone: string): string {
    const digit = parseInt(phone[phone.length - 1] ?? "0");
    return AVATAR_COLORS[digit % AVATAR_COLORS.length];
}

function getInitials(name: string | null, phone: string): string {
    if (name) {
        const parts = name.trim().split(" ");
        return parts.length >= 2
            ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
            : parts[0].slice(0, 2).toUpperCase();
    }
    return phone.slice(-2);
}

function getIntentFromMessages(messages: RawMessage[]): string | undefined {
    const lastOutbound = [...messages].reverse().find(m => m.direction === "outbound");
    return lastOutbound?.metadata?.intent ?? undefined;
}

function getStateFromMessages(messages: RawMessage[]): string | undefined {
    const lastOutbound = [...messages].reverse().find(m => m.direction === "outbound");
    return lastOutbound?.metadata?.state ?? undefined;
}

function getFrustrationIndicator(messages: RawMessage[]): number {
    // Heuristic: count messages with CAPS or repeated punctuation
    const inbound = messages.filter(m => m.direction === "inbound");
    let count = 0;
    for (const m of inbound) {
        if (/[A-Z]{4,}/.test(m.content) || /[!?]{3,}/.test(m.content)) count++;
    }
    return Math.min(count, 3);
}

// Determine potential based on slots and state
function inferPotential(messages: RawMessage[], slots: ReturnType<typeof inferSlotsFromMessages>): "alta" | "média" | "baixa" {
    const state = getStateFromMessages(messages);
    const slotCount = Object.values(slots).filter(Boolean).length;

    if (state === "closing" || state === "proposal") return "alta";
    if (slotCount >= 3) return "alta";
    if (slotCount >= 1 || state === "discovery") return "média";
    return "baixa";
}

export default function CustomerContext({
    customerName,
    customerPhone,
    conversationId,
    status,
    messages,
    onStatusChange,
    ltv = 0,
    pedidos = 0,
    potential,
}: CustomerContextProps) {
    const initials = getInitials(customerName, customerPhone);
    const gradient = getAvatarGradient(customerPhone);
    const inferredSlots = inferSlotsFromMessages(messages);
    const currentIntent = getIntentFromMessages(messages);
    const currentState = getStateFromMessages(messages);
    const frustrationLevel = getFrustrationIndicator(messages);
    const messageCount = messages.length;

    // Determine if new customer
    const isNewCustomer = ltv === 0 && pedidos === 0;

    // Determine potential level
    const potentialLevel = potential ?? inferPotential(messages, inferredSlots);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] overflow-y-auto custom-scrollbar">

            {/* POTENCIAL Banner - full width at top */}
            <div className={`potential-banner potential-${potentialLevel}`}>
                {potentialLevel === "alta" && <Zap size={14} className="inline mr-1" />}
                {potentialLevel === "alta" && "Alta Probabilidade de Fechamento"}
                {potentialLevel === "média" && "Média Probabilidade de Fechamento"}
                {potentialLevel === "baixa" && "Baixa Probabilidade de Fechamento"}
            </div>

            {/* 1. Header Profile - sidebar section with proper padding */}
            <div className="sidebar-section">
                <div className="flex items-center gap-4">
                    {/* Avatar Large */}
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-lg font-bold shadow-lg ring-2 ring-[var(--bg-ring)]`}>
                        {initials}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <h2 className="section-title truncate leading-tight">
                            {customerName ?? "Cliente Desconhecido"}
                        </h2>
                        <div className="flex items-center gap-1.5 mt-1 data-label">
                            <Phone size={11} />
                            <span className="font-mono tracking-wide">{customerPhone}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 data-label">
                            <div className="flex items-center gap-1">
                                <MessageSquare size={10} />
                                <span>{messageCount} mensagens</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock size={10} />
                                <span>Online agora</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Customer stats - Novo cliente tag or LTV/Pedidos */}
                <div className="mt-4 flex items-center gap-3">
                    {isNewCustomer ? (
                        <span className="tag-new-client">Novo cliente</span>
                    ) : (
                        <>
                            <div>
                                <span className="data-label block">LTV</span>
                                <span className="critical-value">R$ {ltv.toLocaleString("pt-BR")}</span>
                            </div>
                            <div>
                                <span className="data-label block">Pedidos</span>
                                <span className="critical-value">{pedidos}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 2. Agent Status Panel */}
            <div className="sidebar-section">
                <div className="data-label mb-3">
                    Status dos Agentes
                </div>
                <AgentStatusPanel
                    intent={currentIntent}
                    state={currentState}
                    status={status}
                />
            </div>

            {/* 3. Live Cart & Intent */}
            <div className="sidebar-section">
                <LiveCart
                    slots={inferredSlots}
                    currentState={currentState}
                    frustrationLevel={frustrationLevel}
                    messageCount={messageCount}
                />
            </div>

            {/* 4. Quick Actions */}
            <div className="sidebar-section">
                <QuickActions
                    conversationId={conversationId}
                    status={status}
                    onStatusChange={onStatusChange}
                />
            </div>
        </div>
    );
}