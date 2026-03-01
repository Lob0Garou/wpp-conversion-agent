"use client";

import type { RawMessage } from "./parseTimeline";

function fmtTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

interface CustomerBubbleProps {
    message: RawMessage;
    customerName?: string | null;
}

export default function CustomerBubble({ message, customerName }: CustomerBubbleProps) {
    const time = fmtTime(message.timestamp);
    const initials = customerName
        ? customerName.slice(0, 2).toUpperCase()
        : "WA";

    return (
        <div className="flex flex-col items-start mb-4 group animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="flex gap-3 max-w-[88%] md:max-w-[76%] items-end">

                {/* Customer Avatar Icon */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]"
                    style={{ background: "var(--bg-overlay)", color: "var(--text-primary)" }}>
                    {initials}
                </div>

                <div className="flex flex-col items-start">
                    {/* Bubble */}
                    <div
                        className="px-4 py-2.5 text-sm leading-relaxed border rounded-2xl rounded-bl-sm max-w-full"
                        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                    >
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                    </div>

                    {/* Time */}
                    <span className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] mt-1.5 ml-2 opacity-60">
                        {time}
                    </span>
                </div>
            </div>
        </div>
    );
}
