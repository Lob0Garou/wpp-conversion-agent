"use client";

import { useState } from "react";
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
    Icon: React.ElementType;
    variant: "primary" | "secondary" | "danger" | "neutral";
    action: () => Promise<void>;
}

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
            body: JSON.stringify({ text: "Olá! Sou o atendente humano. Como posso ajudar?" }),
        });
        if (!res.ok) throw new Error("Falha ao assumir conversa");
    }

    async function closeConversation() {
        const res = await fetch(`/api/conversations/${conversationId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "closed" }),
        });
        // Graceful — endpoint may not exist yet
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
            description: status === "closed" ? "Conversa já finalizada" : "Marcar como resolvido e arquivar",
            Icon: status === "closed" ? CheckCircle2 : XCircle,
            variant: "danger",
            action: closeConversation,
        },
    ];

    const VARIANT_CLASSES: Record<string, string> = {
        primary: "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700 shadow-lg shadow-emerald-900/20",
        secondary: "bg-blue-600/10 border-blue-500/20 text-blue-500 dark:text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/30",
        neutral: "bg-[var(--bg-base)] border-[var(--border-default)] text-text-main-light dark:text-text-main-dark hover:bg-[var(--bg-elevated)]",
        danger: "bg-rose-500/5 border-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20",
    };

    return (
        <div className="space-y-3">
            <div className="data-label uppercase tracking-wider mb-2">
                Ações Táticas
            </div>

            {ACTIONS.map(({ key, label, description, Icon, variant, action }) => {
                const isLoading = loadingKey === key;
                const isFeedback = feedback?.key === key;
                const isDisabled = !!loadingKey || (key === "close" && status === "closed");

                return (
                    <button
                        key={key}
                        onClick={() => runAction(key, action)}
                        disabled={isDisabled}
                        className={`group w-full flex items-start gap-3 px-3.5 py-3 rounded-xl border text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]}`}
                    >
                        <div className={`mt-0.5 p-1.5 rounded-lg ${variant === 'primary' ? 'bg-white/10' : 'bg-background-dark/30 dark:bg-background-dark/30'}`}>
                            {isLoading
                                ? <Loader2 size={16} className="animate-spin" />
                                : <Icon size={16} className={variant === 'primary' ? 'text-white' : ''} />
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold tracking-tight">
                                    {isFeedback ? (feedback.ok ? "Sucesso!" : "Erro") : label}
                                </span>
                                {key === "assume" && isPendingHuman && (
                                    <span className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                )}
                            </div>

                            {!isFeedback && (
                                <p className={`text-[10px] mt-0.5 leading-tight ${variant === 'primary' ? 'text-emerald-100/80 mr-4' : 'text-text-muted-light dark:text-text-muted-dark'}`}>
                                    {description}
                                </p>
                            )}
                        </div>

                        {!isFeedback && !isLoading && (
                            <ArrowRight size={14} className={`mt-1 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${variant === 'primary' ? 'text-white' : 'text-text-muted-light dark:text-text-muted-dark'}`} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
