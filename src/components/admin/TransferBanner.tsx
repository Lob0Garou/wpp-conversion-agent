"use client";

import { UserCheck, AlertCircle } from "lucide-react";

interface TransferBannerProps {
    customerName?: string | null;
    onAssume?: () => void;
    isAssuming?: boolean;
}

export default function TransferBanner({
    customerName,
    onAssume,
    isAssuming = false,
}: TransferBannerProps) {
    const name = customerName ?? "cliente";

    return (
        <div
            className="flex items-center gap-3 px-4 py-3 animate-slide-top"
            style={{
                background:   "var(--color-transfer-bg)",
                borderBottom: "1px solid var(--color-transfer-border)",
            }}
        >
            {/* Icon */}
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse-ring"
                style={{
                    background:  "var(--color-transfer-bg)",
                    border:      "1.5px solid var(--color-transfer)",
                    color:       "var(--color-transfer)",
                }}
            >
                <AlertCircle size={15} />
            </div>

            {/* Message */}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-tight" style={{ color: "var(--color-transfer)" }}>
                    Aguardando atendente humano
                </p>
                <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {name} está aguardando sua resposta
                </p>
            </div>

            {/* Assume button */}
            {onAssume && (
                <button
                    onClick={onAssume}
                    disabled={isAssuming}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-60"
                    style={{
                        background: "var(--color-transfer)",
                        border:     "1px solid var(--color-transfer)",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                >
                    {isAssuming ? (
                        <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                        <UserCheck size={12} />
                    )}
                    Assumir
                </button>
            )}
        </div>
    );
}
