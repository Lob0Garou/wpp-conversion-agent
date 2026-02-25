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
        <div className="flex flex-col items-start mb-6 group animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="flex gap-2 max-w-[85%] items-start">

                {/* Customer Avatar Icon */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm font-black text-[11px] text-white mt-1"
                    style={{ background: "#475569" }}>
                    {initials}
                </div>

                <div className="flex flex-col items-start">
                    {/* Bubble */}
                    <div
                        className="relative p-3.5 text-[14px] leading-relaxed shadow-sm border rounded-[20px] rounded-tl-md shadow-black/5"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                    >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {/* Time */}
                    <div className="mt-1 flex items-center gap-1 opacity-50">
                        <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)]">
                            {time}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
