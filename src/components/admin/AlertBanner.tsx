"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    UserCheck,
    Package,
    ShieldAlert,
    TrendingUp,
    X,
    Sparkles
} from "lucide-react";
import type { RawMessage } from "./parseTimeline";

export type AlertType =
    | "CRITICAL"
    | "HANDOFF_NEEDED"
    | "STOCK_LOW"
    | "FRAUD_RISK"
    | "UPSELL";

interface AlertBannerProps {
    type: AlertType;
    message: string;
    action?: string;
    onAction?: () => void;
    onDismiss?: () => void;
}

interface AlertConfig {
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    glow: string;
    label: string;
}

const ALERT_CONFIGS: Record<AlertType, AlertConfig> = {
    CRITICAL: {
        icon: ShieldAlert,
        color: "var(--color-danger)",
        bg: "rgba(239, 68, 68, 0.08)",
        border: "rgba(239, 68, 68, 0.18)",
        glow: "rgba(239, 68, 68, 0.15)",
        label: "Crítico"
    },
    HANDOFF_NEEDED: {
        icon: UserCheck,
        color: "var(--color-transfer)",
        bg: "var(--color-transfer-bg)",
        border: "var(--color-transfer-border)",
        glow: "var(--color-transfer-glow)",
        label: "Transferência"
    },
    STOCK_LOW: {
        icon: Package,
        color: "var(--color-warning)",
        bg: "rgba(245, 158, 11, 0.08)",
        border: "rgba(245, 158, 11, 0.18)",
        glow: "rgba(245, 158, 11, 0.15)",
        label: "Estoque"
    },
    FRAUD_RISK: {
        icon: AlertTriangle,
        color: "var(--color-danger)",
        bg: "rgba(239, 68, 68, 0.08)",
        border: "rgba(239, 68, 68, 0.18)",
        glow: "rgba(239, 68, 68, 0.15)",
        label: "Fraude"
    },
    UPSELL: {
        icon: TrendingUp,
        color: "var(--color-ai-sales)",
        bg: "var(--color-ai-sales-bg)",
        border: "var(--color-ai-sales-border)",
        glow: "var(--color-ai-sales-glow)",
        label: "Oportunidade"
    }
};

function AlertBanner({ type, message, action, onAction, onDismiss }: AlertBannerProps) {
    const config = ALERT_CONFIGS[type];
    const Icon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="relative overflow-hidden"
            style={{
                background: config.bg,
                borderBottom: `1px solid ${config.border}`,
            }}
        >
            {/* Glow effect */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `radial-gradient(ellipse at center, ${config.glow} 0%, transparent 70%)`,
                }}
            />

            <div className="relative px-4 py-3 flex items-center gap-3">
                {/* Icon */}
                <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                        background: config.bg,
                        border: `1px solid ${config.border}`,
                        color: config.color,
                    }}
                >
                    <Icon size={16} />
                </div>

                {/* Message */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: config.color }}
                        >
                            {config.label}
                        </span>
                    </div>
                    <p
                        className="text-xs mt-0.5 truncate"
                        style={{ color: "var(--text-primary)" }}
                    >
                        {message}
                    </p>
                </div>

                {/* Action Button */}
                {action && onAction && (
                    <button
                        onClick={onAction}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-90"
                        style={{
                            background: config.color,
                            color: "#fff",
                            border: `1px solid ${config.color}`,
                        }}
                    >
                        <Sparkles size={12} />
                        {action}
                    </button>
                )}

                {/* Dismiss Button */}
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="flex-shrink-0 p-1 rounded-lg transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        </motion.div>
    );
}

// ─── Alert Detector Hook ─────────────────────────────────────────────

const CRITICAL_KEYWORDS = [
    "advogado", "procon", "reclamar", "denunciar", " processo",
    "vou投诉", "customer service", "manager", "chefia", "diretor",
    "não aguento mais", "já tentei", "múltiplas vezes", "vezes que"
];

const FRAUD_KEYWORDS = [
    "estorno", "chargeback", "não autorizei", "meu cartão", "clonado",
    "fraude", "golpe", "não comprei", "desconheço"
];

interface UseAlertDetectorOptions {
    messages: RawMessage[];
    status: string;
    frustrationLevel?: number;
    detectedProduct?: string;
    productStock?: number;
    isVIP?: boolean;
    hasOpenCart?: boolean;
}

interface DetectedAlert {
    id: string;
    type: AlertType;
    message: string;
    action?: string;
}

export function useAlertDetector({
    messages,
    status,
    frustrationLevel,
    detectedProduct,
    productStock,
    isVIP = false,
    hasOpenCart = false,
}: UseAlertDetectorOptions): DetectedAlert[] {
    return useMemo(() => {
        const alerts: DetectedAlert[] = [];

        // Get recent messages (last 3)
        const recentMessages = messages.slice(-3);

        // 1. Check for critical/frustration
        if (frustrationLevel !== undefined && frustrationLevel >= 3) {
            alerts.push({
                id: "critical-frustration",
                type: "CRITICAL",
                message: "Cliente com alto nível de frustração detectado",
                action: "Verificar",
            });
        }

        // Check critical keywords in recent messages
        const recentText = recentMessages
            .filter(m => m.direction === "inbound")
            .map(m => m.content.toLowerCase())
            .join(" ");

        if (CRITICAL_KEYWORDS.some(kw => recentText.includes(kw))) {
            alerts.push({
                id: "critical-keywords",
                type: "CRITICAL",
                message: "Cliente mencionou palavras-chave sensíveis (advogado/procon)",
                action: "Revisar",
            });
        }

        // 2. Check for fraud risk
        if (FRAUD_KEYWORDS.some(kw => recentText.includes(kw))) {
            alerts.push({
                id: "fraud-risk",
                type: "FRAUD_RISK",
                message: "Possível risco de chargeback ou fraude detectado",
                action: "Analisar",
            });
        }

        // 3. Check for handoff needed
        if (status === "PENDING_HUMAN" || status === "escalated") {
            alerts.push({
                id: "handoff-needed",
                type: "HANDOFF_NEEDED",
                message: "Cliente aguardando atendimento humano",
                action: "Assumir",
            });
        }

        // 4. Check for stock low
        if (detectedProduct && productStock !== undefined && productStock <= 3 && productStock > 0) {
            alerts.push({
                id: "stock-low",
                type: "STOCK_LOW",
                message: `${detectedProduct} tem apenas ${productStock} unidades em estoque`,
                action: "Ver opções",
            });
        }

        // 5. Check for out of stock
        if (detectedProduct && productStock === 0) {
            alerts.push({
                id: "stock-out",
                type: "STOCK_LOW",
                message: `${detectedProduct} está sem estoque`,
                action: "Sugerir similar",
            });
        }

        // 6. Check for upsell opportunity (VIP with no cart)
        if (isVIP && !hasOpenCart && status !== "closed") {
            alerts.push({
                id: "upsell-vip",
                type: "UPSELL",
                message: "Cliente VIP sem carrinho ativo - oportunidade de upsell",
                action: "Ver catálogo",
            });
        }

        return alerts;
    }, [messages, status, frustrationLevel, detectedProduct, productStock, isVIP, hasOpenCart]);
}

// ─── Alert Banner List Component ─────────────────────────────────────

interface AlertBannerListProps {
    alerts: DetectedAlert[];
    onAction?: (alert: DetectedAlert) => void;
    onDismiss?: (alertId: string) => void;
}

export function AlertBannerList({ alerts, onAction, onDismiss }: AlertBannerListProps) {
    return (
        <AnimatePresence>
            {alerts.map((alert) => (
                <AlertBanner
                    key={alert.id}
                    type={alert.type}
                    message={alert.message}
                    action={alert.action}
                    onAction={() => onAction?.(alert)}
                    onDismiss={() => onDismiss?.(alert.id)}
                />
            ))}
        </AnimatePresence>
    );
}

export default AlertBanner;
