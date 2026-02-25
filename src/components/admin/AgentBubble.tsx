"use client";

import type { RawMessage } from "./parseTimeline";

function fmtTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

interface AgentBubbleProps {
    message: RawMessage;
    type?: "ai_sales" | "ai_support" | "manual";
}

const BUBBLE_STYLES = {
    ai_sales: {
        labelText: "Bot",
        avatarBg: "var(--color-brand)", // Red #E31C2D
        AvatarInitial: "C",
        bubbleStyle: { background: "var(--bg-elevated)", borderColor: "rgba(227, 28, 45, 0.4)" },
    },
    ai_support: {
        labelText: "Bot SAC",
        avatarBg: "var(--color-ai-support)",
        AvatarInitial: "C",
        bubbleStyle: { background: "var(--bg-elevated)", borderColor: "var(--color-ai-support-border)" },
    },
    manual: {
        labelText: "Humano",
        avatarBg: "var(--color-human-bg)",
        AvatarInitial: "H",
        bubbleStyle: { background: "var(--color-human-bg)", borderColor: "var(--color-human-border)" },
    },
} as const;

export default function AgentBubble({ message, type = "ai_sales" }: AgentBubbleProps) {
    const time = fmtTime(message.timestamp);
    const style = BUBBLE_STYLES[type];
    return (
        <div className="flex flex-col items-end mb-6 group animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex gap-2 max-w-[85%] items-start">
                {/* Bubble Container */}
                <div className="flex flex-col items-end">
                    <div
                        className="relative p-3.5 text-[14px] leading-relaxed shadow-md border rounded-[20px] rounded-tr-md"
                        style={{ ...style.bubbleStyle, color: "var(--text-primary)" }}
                    >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {/* Time Label (below bubble) */}
                    <div className="flex items-center gap-1 mt-1 opacity-50">
                        <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)]">
                            {style.labelText} • {time}
                        </span>
                    </div>
                </div>

                {/* Agent Avatar Icon */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md text-white font-black text-sm mt-1"
                    style={{ background: style.avatarBg }}>
                    {style.AvatarInitial}
                </div>
            </div>
        </div>
    );
}
