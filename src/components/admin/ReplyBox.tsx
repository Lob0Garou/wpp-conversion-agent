"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, Smile, Send, ShieldAlert, AlertCircle, RefreshCw } from "lucide-react";

interface ReplyBoxProps {
    conversationId: string;
    status: string;
    intent?: string;
    quickInsert?: { id: number; text: string } | null;
    onQuickReply?: (text: string) => void;
    onReplySent: () => void;
}

const MAX_CHARS = 1000;

export default function ReplyBox({ conversationId, status, quickInsert, onQuickReply, onReplySent }: ReplyBoxProps) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const appliedQuickInsertRef = useRef<number | null>(null);

    const isPendingHuman = status === "PENDING_HUMAN" || status === "escalated";

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }, [text]);

    useEffect(() => {
        if (!quickInsert) return;
        if (appliedQuickInsertRef.current === quickInsert.id) return;
        appliedQuickInsertRef.current = quickInsert.id;

        setText((prev) => {
            if (!prev) return quickInsert.text;
            const spacer = prev.endsWith(" ") ? "" : " ";
            return `${prev}${spacer}${quickInsert.text}`;
        });

        textareaRef.current?.focus();
    }, [quickInsert]);

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
    const handleQuickReply = (value: string) => {
        if (onQuickReply) {
            onQuickReply(value);
            return;
        }
        setText((prev) => `${prev}${prev ? " " : ""}${value}`);
    };

    return (
        <div className="z-20 flex flex-col gap-2.5">
            {/* Pending-human badge */}
            {isPendingHuman && (
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3.5 py-2 rounded-lg animate-pulse border"
                    style={{ background: "var(--color-brand-subtle)", color: "var(--color-brand)", borderColor: "var(--color-brand-border)" }}>
                    <ShieldAlert size={13} />
                    Modo Humano — Você Comanda
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="text-[10px] font-black uppercase tracking-widest px-3.5 py-2 rounded-lg flex items-center gap-2 border"
                    style={{ background: "var(--color-brand-subtle)", color: "var(--color-brand)", borderColor: "var(--color-brand-border)" }}>
                    <AlertCircle size={13} />
                    {error}
                </div>
            )}

            {/* Input Box Container */}
            <div
                className={`flex flex-col p-1 border rounded-lg transition-all focus-within:ring-2 focus-within:ring-[var(--color-brand)]/30 ${isOverLimit ? "border-[var(--color-brand)]" : "border-[var(--border-default)]"
                    }`}
                style={{ background: "var(--bg-elevated)" }}
            >
                <div className="flex items-center gap-1.5 px-3">
                    <button
                        className="p-2 rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]"
                        title="Anexo"
                    >
                        <Paperclip className="w-4.5 h-4.5" />
                    </button>

                    <button
                        className="p-2 rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] hidden sm:flex"
                        title="Emojis"
                    >
                        <Smile className="w-4.5 h-4.5" />
                    </button>

                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isPendingHuman ? "Mensagem manual..." : "Digite sua resposta..."}
                        className="flex-1 bg-transparent border-none resize-none focus:ring-0 text-sm py-3 px-1 max-h-24 min-h-[40px] outline-none font-medium placeholder:text-[var(--text-muted)] placeholder:opacity-50 custom-scrollbar"
                        style={{ color: "var(--text-primary)" }}
                        rows={1}
                    />

                    <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black tabular-nums ${isOverLimit ? "text-[var(--color-brand)]" : "text-[var(--text-muted)]"}`}
                            style={{ opacity: isOverLimit ? 1 : 0.5 }}>
                            {remaining}
                        </span>
                        <button
                            onClick={handleSend}
                            disabled={!text.trim() || loading || isOverLimit}
                            className="w-10 h-10 flex items-center justify-center rounded-lg transition-all text-white disabled:opacity-40 shrink-0 hover:brightness-110 active:scale-95"
                            style={{
                                background: "var(--color-brand)",
                                boxShadow: "0 10px 20px rgba(227, 0, 15, 0.32)",
                            }}
                        >
                            {loading ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-3.5 h-3.5 ml-0.5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {!isPendingHuman && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => handleQuickReply("Reserva Confirmada!")}
                        className="text-[10px] font-black tracking-widest uppercase px-3.5 py-1.5 rounded-lg border transition-all shrink-0 hover:bg-[var(--bg-overlay)] active:scale-95"
                        style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                    >
                        Reserva Confirmada
                    </button>
                    <button
                        onClick={() => handleQuickReply("Link Pagamento: ")}
                        className="text-[10px] font-black tracking-widest uppercase px-3.5 py-1.5 rounded-lg border transition-all shrink-0 hover:bg-[var(--bg-overlay)] active:scale-95"
                        style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
                    >
                        Link Pagamento
                    </button>
                </div>
            )}
        </div>
    );
}
