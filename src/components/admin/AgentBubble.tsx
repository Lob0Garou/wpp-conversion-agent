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
        <div className="flex flex-col items-end mb-4 group animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex gap-3 max-w-[88%] md:max-w-[76%] items-end">
                {/* Agent Avatar Icon */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
                    style={{ background: style.avatarBg }}>
                    {style.AvatarInitial}
                </div>

                {/* Bubble Container */}
                <div className="flex flex-col items-end">
                    <div
                        className="px-4 py-2.5 text-sm leading-relaxed border rounded-2xl rounded-br-sm max-w-full"
                        style={{ ...style.bubbleStyle, color: "var(--text-primary)" }}
                    >
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {message.content}
                        </p>
                    </div>
                    {/* Time Label (below bubble) */}
                    <span className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] mt-1.5 mr-2 opacity-60">
                        {style.labelText} • {time}
                    </span>
                </div>
            </div>
        </div>
    );
}
