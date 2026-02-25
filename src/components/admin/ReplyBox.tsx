"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, Smile, Send, ShieldAlert, AlertCircle } from "lucide-react";

interface ReplyBoxProps {
    conversationId: string;
    status: string;
    intent?: string;
    onReplySent: () => void;
}

const MAX_CHARS = 1000;

export default function ReplyBox({ conversationId, status, onReplySent }: ReplyBoxProps) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isPendingHuman = status === "PENDING_HUMAN" || status === "escalated";

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }, [text]);

    const handleSend = useCallback(async () => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/conversations/${conversationId}/reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: trimmed }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Falha ao enviar mensagem");
            }
            setText("");
            onReplySent();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        } finally {
            setLoading(false);
        }
    }, [text, loading, conversationId, onReplySent]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const remaining = MAX_CHARS - text.length;
    const isOverLimit = remaining < 0;

    return (
        <div className="z-20">
            {/* Pending-human badge */}
            {isPendingHuman && (
                <div className="flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-sm animate-pulse border"
                    style={{ background: "var(--color-brand-subtle)", color: "var(--color-brand)", borderColor: "var(--color-brand-border)" }}>
                    <ShieldAlert size={14} />
                    Modo Humano Ativo — Você está no comando
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-3 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-2 border"
                    style={{ background: "rgba(227, 0, 15, 0.1)", color: "var(--color-brand)", borderColor: "rgba(227, 0, 15, 0.2)" }}>
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            {/* Input Box Container */}
            <div
                className={`flex flex-col p-1.5 border rounded-[32px] transition-all shadow-inner group focus-within:ring-2 focus-within:ring-[var(--color-brand-subtle)] ${isOverLimit ? "border-[var(--color-brand)]" : "border-[var(--border-default)]"
                    }`}
                style={{ background: "var(--bg-elevated)" }}
            >
                <div className="flex items-center gap-2 px-2">
                    <button
                        className="p-2.5 rounded-full transition-all text-[var(--text-muted)] hover:bg-white/5 hover:text-white"
                        title="Anexo"
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>

                    <button
                        className="p-2.5 rounded-full transition-all text-[var(--text-muted)] hover:bg-white/5 hover:text-white hidden sm:block"
                        title="Emojis"
                    >
                        <Smile className="w-5 h-5" />
                    </button>

                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isPendingHuman ? "Mensagem manual..." : "Digite sua mensagem..."}
                        className="flex-1 bg-transparent border-none resize-none focus:ring-0 text-[14px] py-3 max-h-32 min-h-[44px] outline-none font-medium placeholder:opacity-40 custom-scrollbar"
                        style={{ color: "var(--text-primary)" }}
                        rows={1}
                    />

                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black tabular-nums mr-1 ${isOverLimit ? "text-[var(--color-brand)]" : "opacity-40"}`}
                            style={{ color: isOverLimit ? "var(--color-brand)" : "var(--text-muted)" }}>
                            {remaining}
                        </span>
                        <button
                            onClick={handleSend}
                            disabled={!text.trim() || loading || isOverLimit}
                            className="w-11 h-11 flex items-center justify-center rounded-full transition-all shadow-lg active:scale-95 text-white disabled:opacity-30 disabled:shadow-none shrink-0"
                            style={{ background: "var(--color-brand)" }}
                        >
                            {loading ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4 ml-0.5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Replies */}
            {!isPendingHuman && (
                <div className="flex items-center gap-2 mt-4 ml-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setText(t => t + (t ? " " : "") + "Reserva Confirmada!")}
                        className="text-[10px] font-black tracking-widest uppercase px-4 py-2 rounded-full border transition-all shrink-0 hover:bg-white/5 active:scale-95"
                        style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    >
                        Reserva Confirmada
                    </button>
                    <button
                        onClick={() => setText(t => t + (t ? " " : "") + "Aqui está o link de pagamento: ")}
                        className="text-[10px] font-black tracking-widest uppercase px-4 py-2 rounded-full border transition-all shrink-0 hover:bg-white/5 active:scale-95"
                        style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
                    >
                        Link Pagamento
                    </button>
                </div>
            )}
        </div>
    );
}

import { RefreshCw } from "lucide-react";
