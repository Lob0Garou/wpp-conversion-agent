"use client";

interface TypingIndicatorProps {
    agentName?: string;
    type?: "sales" | "sac";
}

export default function TypingIndicator({
    agentName = "Cadu",
    type = "sales",
}: TypingIndicatorProps) {
    const color = type === "sac" ? "var(--color-ai-sac)" : "var(--color-ai-sales)";

    return (
        <div className="flex items-end gap-2 justify-end animate-fade-in">
            <div className="flex flex-col items-end max-w-[72%]">
                <div
                    className="flex items-center gap-2 px-3.5 py-3 rounded-2xl rounded-br-none"
                    style={{
                        background:   type === "sac" ? "var(--color-ai-sac-bg)"   : "var(--color-ai-sales-bg)",
                        border:       `1px solid ${type === "sac" ? "var(--color-ai-sac-border)" : "var(--color-ai-sales-border)"}`,
                    }}
                >
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {agentName} digitando
                    </span>
                    <div className="flex items-center gap-1" style={{ color }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing-1" />
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing-2" />
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing-3" />
                    </div>
                </div>
            </div>

            {/* Avatar dot */}
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-4 border"
                style={{
                    background:  type === "sac" ? "var(--color-ai-sac-bg)"   : "var(--color-ai-sales-bg)",
                    borderColor: type === "sac" ? "var(--color-ai-sac-border)" : "var(--color-ai-sales-border)",
                }}
            >
                <span className="text-[9px] font-bold" style={{ color }}>C</span>
            </div>
        </div>
    );
}
