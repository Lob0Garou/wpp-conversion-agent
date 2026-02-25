"use client";

interface MetricCardProps {
    label: string;
    value: string | number;
    subtitle?: string;
    accentColor?: string;
    loading?: boolean;
}

export default function MetricCard({
    label,
    value,
    subtitle,
    accentColor = "var(--color-ai-sales)",
    loading = false,
}: MetricCardProps) {
    return (
        <div
            className="flex flex-col gap-1 rounded-xl p-4 min-w-0"
            style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
            }}
        >
            <span className="text-xs font-medium truncate" style={{ color: "var(--text-muted)" }}>
                {label}
            </span>

            {loading ? (
                <div
                    className="h-6 w-16 rounded-md animate-pulse"
                    style={{ background: "var(--bg-surface)" }}
                />
            ) : (
                <span
                    className="text-xl font-bold tracking-tight"
                    style={{ color: accentColor }}
                >
                    {value}
                </span>
            )}

            {subtitle && (
                <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {subtitle}
                </span>
            )}
        </div>
    );
}
