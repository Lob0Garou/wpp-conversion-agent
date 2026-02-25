"use client";

import { useEffect, useState, useCallback } from "react";

type Range = "today" | "7d" | "30d";

interface MetricsData {
    range: string;
    interestedCount: number;
    reservationCount: number;
    saleCount: number;
    totalRevenue: string;
    avgTicket: string;
    soldItems: {
        id: string;
        description: string;
        quantity: number;
        totalPrice: number;
        soldAt: string;
    }[];
}

function formatCurrency(value: string | number): string {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(n)) return "—";
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n);
}

// ── Mock Customer Profile ─────────────────────────────────────────
const MOCK_PROFILE = {
    name: "Camila Lopes",
    initials: "CL",
    location: "São Paulo, SP",
    clientSince: "2024",
    ltv: 0,
    orders: 0,
    avgTicket: 0,
    shoeSize: "37",
    categoria: "Corrida",
};

export default function SalesMetricsPanel() {
    const [range, setRange] = useState<Range>("today");
    const [data, setData] = useState<MetricsData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (r: Range) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/metrics?range=${r}`, { cache: "no-store" });
            if (!res.ok) throw new Error("Falha ao buscar métricas");
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error("[SalesMetricsPanel]", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(range);
        const id = setInterval(() => load(range), 30_000);
        return () => clearInterval(id);
    }, [load, range]);

    const interested = data?.interestedCount ?? 0;
    const reservas = data?.reservationCount ?? 0;
    const vendas = data?.saleCount ?? 0;
    const receita = data?.totalRevenue ?? "0";

    const profile = MOCK_PROFILE;

    const RANGE_LABELS: Record<Range, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias" };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-surface)]">
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

                {/* ── Profile Header ── */}
                <div className="text-center">
                    {/* Avatar with ring-4 + green online dot */}
                    <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-3 shadow-xl shadow-red-500/20 ring-4 ring-[var(--bg-ring)] relative">
                        {profile.initials}
                        <span className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-[var(--bg-ring)]" />
                    </div>
                    <h3 className="text-lg font-bold text-text-main-light dark:text-text-main-dark">
                        {profile.name}
                    </h3>
                    <div className="flex items-center justify-center gap-1 text-sm text-text-muted-light dark:text-text-muted-dark mt-1">
                        <span className="material-icons-outlined text-xs">location_on</span>
                        {profile.location}
                    </div>
                    <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
                        Cliente desde {profile.clientSince}
                    </p>

                    {/* 3-col stats with vertical dividers */}
                    <div className="grid grid-cols-3 gap-2 mt-6 border-t border-b border-border-light dark:border-border-dark py-4">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark font-semibold">LTV</span>
                            <div className="text-sm font-bold text-text-main-light dark:text-text-main-dark mt-1">
                                {formatCurrency(profile.ltv)}
                            </div>
                        </div>
                        <div className="border-l border-r border-[var(--border-default)]">
                            <span className="text-[10px] uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark font-semibold">Pedidos</span>
                            <div className="text-sm font-bold text-text-main-light dark:text-text-main-dark mt-1">
                                {profile.orders}
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark font-semibold">Ticket</span>
                            <div className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">
                                {formatCurrency(profile.avgTicket)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Potencial ── */}
                <div className="bg-background-light dark:bg-background-dark rounded-xl p-4 border border-border-light dark:border-border-dark relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-text-main-light dark:text-text-main-dark uppercase tracking-wide flex items-center gap-1">
                            <span className="material-icons-outlined text-sm">trending_up</span> Potencial
                        </h4>
                        <span className="text-xs font-bold text-green-600 dark:text-green-400">Alta Probabilidade</span>
                    </div>
                    <div className="h-2 bg-border-strong dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full w-[85%] bg-gradient-to-r from-green-400 to-green-600 rounded-full" />
                    </div>
                    <p className="text-[10px] text-text-muted-light dark:text-text-muted-dark mt-2 text-right">85/100 Score</p>
                </div>

                {/* ── Preferências ── */}
                <div>
                    <h4 className="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wide mb-3 flex items-center gap-1">
                        <span className="material-icons-outlined text-sm">tune</span> Preferências
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[var(--bg-base)] p-2 rounded-lg border border-[var(--border-default)]">
                            <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark block">Tamanho Calçado</span>
                            <span className="font-medium text-sm text-text-main-light dark:text-text-main-dark">{profile.shoeSize}</span>
                        </div>
                        <div className="bg-[var(--bg-base)] p-2 rounded-lg border border-[var(--border-default)]">
                            <span className="text-[10px] text-text-muted-light dark:text-text-muted-dark block">Categoria</span>
                            <span className="font-medium text-sm text-text-main-light dark:text-text-main-dark">{profile.categoria}</span>
                        </div>
                    </div>
                </div>

                {/* ── Top Recomendados (metrics table) ── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wide flex items-center gap-1">
                            <span className="material-icons-outlined text-sm">insights</span> Top Recomendados
                        </h4>
                        <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                            IA Suggest
                        </span>
                    </div>

                    <div className="bg-[var(--bg-base)] rounded-xl overflow-hidden border border-[var(--border-default)]">
                        {/* Range tabs header */}
                        <div className="grid grid-cols-3 text-[10px] font-semibold text-text-muted-light dark:text-text-muted-dark bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                            {(["today", "7d", "30d"] as Range[]).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => { setRange(r); load(r); }}
                                    className={`p-2 text-center transition-colors ${range === r
                                        ? "text-primary font-bold"
                                        : "text-text-muted-light/50 dark:text-text-muted-dark/50 hover:text-text-muted-light dark:hover:text-text-muted-dark"
                                        }`}
                                >
                                    {RANGE_LABELS[r]}
                                </button>
                            ))}
                        </div>

                        {/* Metrics rows */}
                        {loading ? (
                            <div className="divide-y divide-border-light dark:divide-border-dark">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="p-2 h-8 animate-pulse bg-background-light dark:bg-background-dark" />
                                ))}
                            </div>
                        ) : (
                            <div className="divide-y divide-border-light dark:divide-border-dark">
                                <div className="p-2 flex justify-between items-center hover:bg-background-light dark:hover:bg-background-dark transition">
                                    <span className="text-xs text-text-muted-light dark:text-text-muted-dark">Interessados</span>
                                    <span className="text-xs font-bold text-text-main-light dark:text-text-main-dark">{interested}</span>
                                </div>
                                <div className="p-2 flex justify-between items-center hover:bg-background-light dark:hover:bg-background-dark transition">
                                    <span className="text-xs text-text-muted-light dark:text-text-muted-dark">Reservas</span>
                                    <span className="text-xs font-bold text-text-main-light dark:text-text-main-dark">{reservas}</span>
                                </div>
                                <div className="p-2 flex justify-between items-center hover:bg-background-light dark:hover:bg-background-dark transition">
                                    <span className="text-xs text-text-muted-light dark:text-text-muted-dark">Vendas</span>
                                    <span className="text-xs font-bold text-green-600 dark:text-green-400">{vendas}</span>
                                </div>
                                <div className="p-2 flex justify-between items-center bg-green-500/10">
                                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Receita Potencial</span>
                                    <span className="text-xs font-bold text-green-700 dark:text-green-300">{formatCurrency(receita)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Spacer before sticky CTA */}
                <div className="h-4" />
            </div>

            {/* ── Sticky CTA ── */}
            <div className="p-5 sticky bottom-0 bg-[var(--bg-surface)] border-t border-[var(--border-default)]">
                <button className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-red-500/40 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 group">
                    <span className="material-icons-outlined group-hover:animate-pulse">payments</span>
                    GERAR LINK DE PAGAMENTO
                </button>
                <p className="text-center text-[10px] text-text-muted-light dark:text-text-muted-dark mt-2">
                    Seguro via Centauro Pay
                </p>
            </div>
        </div>
    );
}
