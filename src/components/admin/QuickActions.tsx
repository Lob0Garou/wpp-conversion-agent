"use client";

import { useState, type CSSProperties, type ElementType } from "react";
import { UserCheck, Link2, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";

interface QuickActionsProps {
    conversationId: string;
    status: string;
    onStatusChange: () => void;
}

interface ActionButton {
    key: string;
    label: string;
    description: string;
    Icon: ElementType;
    variant: "primary" | "secondary" | "danger" | "neutral";
    action: () => Promise<void>;
}

interface VariantStyle {
    container: CSSProperties;
    icon: CSSProperties;
    description: CSSProperties;
    arrow: CSSProperties;
    ping: CSSProperties;
}

const VARIANT_STYLES: Record<ActionButton["variant"], VariantStyle> = {
    primary: {
        container: {
            color: "#fff",
            borderColor: "transparent",
            background: "var(--color-success)",
            boxShadow: "0 10px 22px rgba(22, 163, 74, 0.28)",
        },
        icon: { background: "rgba(255, 255, 255, 0.14)", color: "#fff" },
        description: { color: "rgba(255, 255, 255, 0.82)" },
        arrow: { color: "#fff" },
        ping: { background: "var(--color-success)" },
    },
    secondary: {
        container: {
            color: "var(--color-info)",
            borderColor: "var(--color-human-border)",
            background: "var(--color-human-bg)",
        },
        icon: { background: "var(--bg-overlay)", color: "var(--color-info)" },
        description: { color: "var(--text-secondary)" },
        arrow: { color: "var(--text-muted)" },
        ping: { background: "var(--color-info)" },
    },
    neutral: {
        container: {
            color: "var(--text-primary)",
            borderColor: "var(--border-default)",
            background: "var(--bg-base)",
        },
        icon: { background: "var(--bg-overlay)", color: "var(--text-secondary)" },
        description: { color: "var(--text-muted)" },
        arrow: { color: "var(--text-muted)" },
        ping: { background: "var(--text-muted)" },
    },
    danger: {
        container: {
            color: "var(--color-brand)",
            borderColor: "var(--color-brand-border)",
            background: "var(--color-brand-subtle)",
        },
        icon: { background: "var(--bg-overlay)", color: "var(--color-brand)" },
        description: { color: "var(--text-secondary)" },
        arrow: { color: "var(--text-muted)" },
        ping: { background: "var(--color-brand)" },
    },
};

export default function QuickActions({ conversationId, status, onStatusChange }: QuickActionsProps) {
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

    async function runAction(key: string, fn: () => Promise<void>) {
        setLoadingKey(key);
        setFeedback(null);
        try {
            await fn();
            setFeedback({ key, ok: true, msg: "Feito!" });
            onStatusChange();
        } catch (err) {
            setFeedback({ key, ok: false, msg: err instanceof Error ? err.message : "Erro" });
        } finally {
            setLoadingKey(null);
            setTimeout(() => setFeedback(null), 3000);
        }
    }

    async function assumeConversation() {
        const res = await fetch(`/api/conversations/${conversationId}/reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "Ola! Sou o atendente humano. Como posso ajudar?" }),
        });
        if (!res.ok) throw new Error("Falha ao assumir conversa");
    }

    async function closeConversation() {
        const res = await fetch(`/api/conversations/${conversationId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "closed" }),
        });
        if (!res.ok && res.status !== 404) throw new Error("Falha ao fechar");
    }

    const isPendingHuman = status === "PENDING_HUMAN";

    const ACTIONS: ActionButton[] = [
        {
            key: "assume",
            label: isPendingHuman ? "Assumir Pelo Humano" : "Entrar no Chat",
            description: isPendingHuman ? "Cliente aguardando! Clique para responder." : "Enviar mensagem manual",
            Icon: UserCheck,
            variant: isPendingHuman ? "primary" : "neutral",
            action: assumeConversation,
        },
        {
            key: "pix",
            label: "Link de Pagamento",
            description: "Gerar link Pix para fechar venda",
            Icon: Link2,
            variant: "secondary",
            action: async () => {
                await navigator.clipboard.writeText(`https://pix.example.com/${conversationId}`);
            },
        },
        {
            key: "close",
            label: "Encerrar Conversa",
            description: status === "closed" ? "Conversa ja finalizada" : "Marcar como resolvido e arquivar",
            Icon: status === "closed" ? CheckCircle2 : XCircle,
            variant: "danger",
            action: closeConversation,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="data-label uppercase tracking-wider mb-2">
                Acoes Taticas
            </div>

            {ACTIONS.map(({ key, label, description, Icon, variant, action }) => {
                const isLoading = loadingKey === key;
                const isFeedback = feedback?.key === key;
                const isDisabled = !!loadingKey || (key === "close" && status === "closed");
                const variantStyle = VARIANT_STYLES[variant];

                return (
                    <button
                        key={key}
                        onClick={() => runAction(key, action)}
                        disabled={isDisabled}
                        className="group w-full flex items-start gap-3 px-3.5 py-3 rounded-xl border text-left transition-all duration-200 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={variantStyle.container}
                    >
                        <div className="mt-0.5 p-1.5 rounded-lg" style={variantStyle.icon}>
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold tracking-tight">
                                    {isFeedback ? (feedback.ok ? "Sucesso!" : "Erro") : label}
                                </span>
                                {key === "assume" && isPendingHuman && (
                                    <span className="flex h-2 w-2 relative">
                                        <span
                                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                            style={variantStyle.ping}
                                        />
                                        <span
                                            className="relative inline-flex rounded-full h-2 w-2"
                                            style={variantStyle.ping}
                                        />
                                    </span>
                                )}
                            </div>

                            {!isFeedback && (
                                <p className="text-[10px] mt-0.5 leading-tight mr-4" style={variantStyle.description}>
                                    {description}
                                </p>
                            )}
                        </div>

                        {!isFeedback && !isLoading && (
                            <ArrowRight
                                size={14}
                                className="mt-1 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0"
                                style={variantStyle.arrow}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
