"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
    Package, Upload, CheckCircle2, AlertCircle, RefreshCw,
    Search, ChevronDown, ChevronRight, Zap, X, AlertTriangle
} from "lucide-react";

// ─── TYPES ───

interface StockSummaryRow {
    groupName: string | null;
    brand: string | null;
    totalProducts: number;
    totalStock: number;
    outOfStock: number;
}

interface ImportRecord {
    id: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    importedAt: string;
    status?: string;
    supersededAt?: string | null;
}

interface ActiveSnapshot {
    id: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    importedAt: string;
}

interface InventoryData {
    summary: StockSummaryRow[];
    activeSnapshot: ActiveSnapshot | null;
    lastImport: ImportRecord | null;
    importHistory: ImportRecord[];
    pendingTickets: number;
    productsBySource: { detailed: number; aggregated: number; total?: number };
}

interface UploadResult {
    success: boolean;
    error?: string;
    sourceType?: "DETAILED" | "AGGREGATED";
    totalRows: number;
    validRows: number;
    invalidRows: number;
    inserted: number;
    updated: number;
    upserted: number;
    errors?: { line: number; reason: string }[];
}

interface CheckTicket {
    id: string;
    ticketNumber: string;
    status: string;
    detail: string;
    conversationId: string | null;
    createdAt: string;
}

interface ProductDetail {
    id: string;
    sku: string | null;
    description: string;
    size: string | null;
    quantity: number;
    price: number | null;
    source: "DETAILED" | "AGGREGATED";
}

// ─── HELPERS ───

function fmtTime(d: string): string {
    try {
        return new Date(d).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });
    } catch { return "—"; }
}

function timeAgo(d: string): string {
    try {
        const diff = Date.now() - new Date(d).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return "agora";
        if (m < 60) return `${m}min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        return `${Math.floor(h / 24)}d`;
    } catch { return ""; }
}

// ─── SUB-COMPONENTS ───

function FilterChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
            style={{
                background: active ? "var(--color-ai-sales-bg)" : "var(--bg-elevated)",
                color: active ? "var(--color-ai-sales)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--color-ai-sales-border)" : "var(--border-default)"}`,
            }}
        >
            {label}
        </button>
    );
}

function SummaryCard({
    label, value, subtext, color, highlight
}: {
    label: string; value: string | number; subtext?: string; color?: string; highlight?: boolean;
}) {
    return (
        <div
            className="p-4 rounded-xl"
            style={{
                background: highlight ? "rgba(234, 179, 8, 0.06)" : "var(--bg-surface)",
                border: `1px solid ${highlight ? "rgba(234,179,8,0.25)" : "var(--border-default)"}`,
                boxShadow: "var(--shadow-sm)",
            }}
        >
            <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>
                {label}
            </span>
            <div className="text-xl font-bold mt-1" style={{ color: color || "var(--text-primary)" }}>{value}</div>
            {subtext && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{subtext}</span>}
        </div>
    );
}

// Ticket de checagem física
function CheckTicketRow({
    ticket,
    onAction,
}: {
    ticket: CheckTicket;
    onAction: (id: string, action: "confirm" | "not_found" | "divergence") => void;
}) {
    const [loading, setLoading] = useState<string | null>(null);

    const handleAction = async (action: "confirm" | "not_found" | "divergence") => {
        setLoading(action);
        await onAction(ticket.id, action);
        setLoading(null);
    };

    return (
        <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{
                background: "var(--bg-surface)",
                border: "1px solid rgba(234,179,8,0.2)",
            }}
        >
            {/* Ticket number + detail */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-semibold" style={{ color: "var(--color-brand)" }}>
                        {ticket.ticketNumber}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{timeAgo(ticket.createdAt)}</span>
                </div>
                <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {ticket.detail || "(sem detalhe)"}
                </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    onClick={() => handleAction("confirm")}
                    disabled={loading !== null}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                    style={{
                        background: loading === "confirm" ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.1)",
                        color: "#22c55e",
                        border: "1px solid rgba(34,197,94,0.25)",
                        opacity: loading && loading !== "confirm" ? 0.4 : 1,
                    }}
                >
                    <CheckCircle2 size={11} />
                    Separado
                </button>
                <button
                    onClick={() => handleAction("not_found")}
                    disabled={loading !== null}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                    style={{
                        background: loading === "not_found" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.1)",
                        color: "var(--color-danger)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        opacity: loading && loading !== "not_found" ? 0.4 : 1,
                    }}
                >
                    <X size={11} />
                    Não achei
                </button>
                <button
                    onClick={() => handleAction("divergence")}
                    disabled={loading !== null}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                    style={{
                        background: loading === "divergence" ? "rgba(234,179,8,0.2)" : "rgba(234,179,8,0.1)",
                        color: "#eab308",
                        border: "1px solid rgba(234,179,8,0.2)",
                        opacity: loading && loading !== "divergence" ? 0.4 : 1,
                    }}
                >
                    <AlertTriangle size={11} />
                    Divergência
                </button>
            </div>
        </div>
    );
}

// Linha expansível de produto com detalhe real
function ProductRow({ group, brand, products, stock }: {
    group: string; brand: string; products: number; stock: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const [details, setDetails] = useState<ProductDetail[] | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const handleExpand = async () => {
        const next = !expanded;
        setExpanded(next);
        if (next && details === null) {
            setLoadingDetails(true);
            try {
                const params = new URLSearchParams();
                if (group !== "—") params.set("groupName", group);
                if (brand !== "—") params.set("brand", brand);
                const res = await fetch(`/api/inventory/products?${params.toString()}`, { cache: "no-store" });
                if (res.ok) setDetails(await res.json());
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    return (
        <div>
            <div
                onClick={handleExpand}
                className="flex items-center gap-2 px-4 py-3 rounded-xl cursor-pointer transition-all"
                style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderLeft: stock === 0 ? "3px solid var(--color-danger)" : "1px solid var(--border-default)",
                    boxShadow: "var(--shadow-sm)",
                }}
            >
                {expanded
                    ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
                    : <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />}
                <span className="text-xs font-medium flex-1" style={{ color: "var(--text-primary)" }}>{group}</span>
                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{brand}</span>
                <span
                    className="text-[11px] px-2 py-0.5 rounded"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                >
                    {products} itens
                </span>
                <span
                    className="text-xs font-semibold"
                    style={{ color: stock === 0 ? "var(--color-danger)" : "var(--color-ai-sales)" }}
                >
                    {stock === 0 ? "ESGOTADO" : stock}
                </span>
            </div>

            {expanded && (
                <div
                    className="ml-6 mt-1 rounded-lg overflow-hidden"
                    style={{ borderLeft: "2px solid var(--border-default)", background: "var(--bg-elevated)" }}
                >
                    {loadingDetails ? (
                        <div className="flex items-center justify-center py-4">
                            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                        </div>
                    ) : details && details.length > 0 ? (
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Descrição</th>
                                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>SKU</th>
                                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Tam.</th>
                                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Fonte</th>
                                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {details.map((p) => (
                                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                                        <td className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>{p.description}</td>
                                        <td className="px-3 py-1.5 font-mono" style={{ color: "var(--text-muted)" }}>{p.sku ?? "—"}</td>
                                        <td className="px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>{p.size ?? "—"}</td>
                                        <td className="px-3 py-1.5">
                                            <span
                                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                style={{
                                                    background: p.source === "DETAILED" ? "rgba(59,130,246,0.1)" : "var(--bg-surface)",
                                                    color: p.source === "DETAILED" ? "#3b82f6" : "var(--text-muted)",
                                                    border: `1px solid ${p.source === "DETAILED" ? "rgba(59,130,246,0.2)" : "var(--border-default)"}`,
                                                }}
                                            >
                                                {p.source}
                                            </span>
                                        </td>
                                        <td
                                            className="px-3 py-1.5 text-right font-semibold"
                                            style={{ color: p.quantity === 0 ? "var(--color-danger)" : "var(--color-ai-sales)" }}
                                        >
                                            {p.quantity === 0 ? "ESGOTADO" : p.quantity}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-[11px] text-center py-3" style={{ color: "var(--text-muted)" }}>
                            Nenhum detalhe encontrado
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── MAIN COMPONENT ───

export default function EstoqueTab() {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [uploadError, setUploadError] = useState("");
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [checkTickets, setCheckTickets] = useState<CheckTicket[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Load inventory summary ──
    const loadInventory = useCallback(async () => {
        setLoadingData(true);
        try {
            const res = await fetch("/api/inventory/upload", { cache: "no-store" });
            if (res.ok) setInventoryData(await res.json() as InventoryData);
        } finally {
            setLoadingData(false);
        }
    }, []);

    // ── Load check tickets ──
    const loadTickets = useCallback(async () => {
        try {
            const res = await fetch("/api/inventory/tickets", { cache: "no-store" });
            if (res.ok) setCheckTickets(await res.json() as CheckTicket[]);
        } catch { /* silencioso */ }
    }, []);

    useEffect(() => {
        loadInventory();
        loadTickets();
        // Auto-refresh tickets a cada 10s
        const interval = setInterval(loadTickets, 10000);
        return () => clearInterval(interval);
    }, [loadInventory, loadTickets]);

    // Auto-dismiss do toast de sucesso após 5s
    useEffect(() => {
        if (!uploadResult) return;
        const t = setTimeout(() => setUploadResult(null), 5000);
        return () => clearTimeout(t);
    }, [uploadResult]);

    // ── Handle ticket action ──
    const handleTicketAction = useCallback(async (
        ticketId: string,
        action: "confirm" | "not_found" | "divergence"
    ) => {
        try {
            await fetch("/api/inventory/tickets", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticketId, action }),
            });
            // Remove da fila imediatamente
            setCheckTickets(prev => prev.filter(t => t.id !== ticketId));
            // Atualiza contador de pendentes
            setInventoryData(prev => prev ? {
                ...prev,
                pendingTickets: Math.max(0, prev.pendingTickets - 1),
            } : prev);
        } catch (err) {
            console.error("Erro ao atualizar ticket:", err);
        }
    }, []);

    // ── Handle file upload ──
    const handleFile = useCallback(async (file: File) => {
        const name = file.name.toLowerCase();
        if (!name.endsWith(".csv") && !name.endsWith(".txt") && !name.endsWith(".xlsx")) {
            setUploadError("Apenas .csv, .txt ou .xlsx aceitos");
            return;
        }
        setUploading(true);
        setUploadError("");
        setUploadResult(null);
        setSelectedFileName(file.name);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("/api/inventory/upload", { method: "POST", body: form });

            // Checar HTTP status antes de parsear
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `Erro HTTP ${res.status}` }));
                setUploadError(err.error || `Falha ao importar (${res.status})`);
                setSelectedFileName(null);
                return;
            }

            const data = await res.json() as UploadResult;

            if (!data.success) {
                setUploadError(data.error || "Importação falhou sem mensagem de erro");
                setSelectedFileName(null);
                return;
            }

            setUploadResult(data);
            setSelectedFileName(null);
            await loadInventory();
        } catch {
            setUploadError("Falha na conexão com o servidor");
            setSelectedFileName(null);
        } finally {
            setUploading(false);
        }
    }, [loadInventory]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFileName(file.name);
            handleFile(file);
        }
        // Reset para permitir mesmo arquivo de novo
        e.target.value = "";
    }, [handleFile]);

    // ── Derived metrics ──
    const totalProdutos = inventoryData?.summary.reduce((acc, r) => acc + r.totalProducts, 0) ?? 0;
    const totalEstoque = inventoryData?.summary.reduce((acc, r) => acc + r.totalStock, 0) ?? 0;
    const totalEsgotados = inventoryData?.summary.reduce((acc, r) => acc + r.outOfStock, 0) ?? 0;
    const pendingTickets = inventoryData?.pendingTickets ?? 0;

    // ── Filter data ──
    const filteredData = inventoryData?.summary.filter(row => {
        const matchesSearch = !searchTerm ||
            (row.groupName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
            (row.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
        const matchesFilter = !activeFilter || row.brand === activeFilter;
        return matchesSearch && matchesFilter;
    }) ?? [];

    const uniqueBrands = [...new Set(inventoryData?.summary.map(r => r.brand).filter(Boolean))] as string[];

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            style={{ background: "var(--bg-base)" }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
        >
            {/* Drag overlay */}
            {dragging && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
                >
                    <div className="text-center">
                        <Upload size={40} style={{ color: "var(--color-brand)" }} className="mx-auto mb-2" />
                        <p className="text-sm font-semibold text-white">Solte o arquivo aqui</p>
                        <p className="text-xs text-white/60">CSV (Detalhado) ou XLSX (Agregado)</p>
                    </div>
                </div>
            )}

            {/* TOP BAR */}
            <div
                className="flex items-center gap-3 px-4 py-3 border-b"
                style={{ borderColor: "var(--border-default)", background: "var(--bg-surface)" }}
            >
                <div className="relative flex-1 max-w-[300px]">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                    <input
                        type="text"
                        placeholder="Buscar produto ou SKU..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs"
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                    <FilterChip label="Todos" active={!activeFilter} onClick={() => setActiveFilter(null)} />
                    {uniqueBrands.slice(0, 5).map(brand => (
                        <FilterChip
                            key={brand}
                            label={brand}
                            active={activeFilter === brand}
                            onClick={() => setActiveFilter(activeFilter === brand ? null : brand)}
                        />
                    ))}
                </div>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all max-w-[180px]"
                    style={{ background: "var(--color-brand)", color: "#fff", opacity: uploading ? 0.7 : 1 }}
                    onMouseEnter={(e) => { if (!uploading) (e.currentTarget as HTMLElement).style.background = "var(--color-brand-hover)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-brand)"; }}
                    title={selectedFileName ?? undefined}
                >
                    {uploading
                        ? <RefreshCw size={12} className="animate-spin shrink-0" />
                        : <Upload size={12} className="shrink-0" />}
                    <span className="truncate">
                        {uploading
                            ? "Importando..."
                            : selectedFileName
                                ? selectedFileName.length > 18 ? selectedFileName.slice(0, 16) + "…" : selectedFileName
                                : "Importar"}
                    </span>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.xlsx"
                    className="hidden"
                    onChange={onFileChange}
                />
            </div>

            {/* Active Snapshot Banner */}
            {inventoryData && !inventoryData.activeSnapshot && (
                <div
                    className="mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-3"
                    style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                    }}
                >
                    <AlertTriangle size={18} style={{ color: "var(--color-danger)" }} />
                    <div className="flex-1">
                        <span className="text-xs font-semibold block" style={{ color: "var(--color-danger)" }}>
                            Nenhum snapshot ativo
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                            O sistema não pode verificar estoque. Importe um arquivo CSV ou XLSX para ativar.
                        </span>
                    </div>
                </div>
            )}

            {inventoryData?.activeSnapshot && (
                <div
                    className="mx-4 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-3"
                    style={{
                        background: "rgba(34, 197, 94, 0.06)",
                        border: "1px solid rgba(34, 197, 94, 0.2)",
                    }}
                >
                    <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                    <div className="flex-1">
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                            Snapshot ativo: <strong style={{ color: "var(--text-primary)" }}>{inventoryData.activeSnapshot.fileName}</strong>
                        </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                        {inventoryData.activeSnapshot.validRows} produtos • {fmtTime(inventoryData.activeSnapshot.importedAt)}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }} title={inventoryData.activeSnapshot.id}>
                        ID: {inventoryData.activeSnapshot.id.slice(0, 8)}...
                    </span>
                </div>
            )}

            {/* 5 Cards de Resumo */}
            <div
                className="grid grid-cols-5 gap-3 px-4 py-3"
                style={{ borderBottom: "1px solid var(--border-default)" }}
            >
                <SummaryCard label="Produtos" value={totalProdutos} subtext="total cadastrado" />
                <SummaryCard label="Estoque" value={totalEstoque} subtext="itens disponíveis" color="var(--color-ai-sales)" />
                <SummaryCard label="Grupos" value={inventoryData?.summary.length ?? 0} subtext="categorias" />
                <SummaryCard
                    label="Esgotados"
                    value={totalEsgotados}
                    subtext="sem estoque"
                    color={totalEsgotados > 0 ? "var(--color-danger)" : "var(--text-muted)"}
                />
                <SummaryCard
                    label="⚡ Pendentes"
                    value={pendingTickets}
                    subtext="checagens físicas"
                    color={pendingTickets > 0 ? "#eab308" : "var(--text-muted)"}
                    highlight={pendingTickets > 0}
                />
            </div>

            {/* Conteúdo principal */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">

                {/* ── Fila de Checagens Pendentes ── */}
                {checkTickets.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Zap size={14} style={{ color: "#eab308" }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#eab308" }}>
                                Checagens Pendentes ({checkTickets.length})
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {checkTickets.map(ticket => (
                                <CheckTicketRow
                                    key={ticket.id}
                                    ticket={ticket}
                                    onAction={handleTicketAction}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Lista de Produtos ── */}
                {loadingData ? (
                    <div className="flex items-center justify-center h-32">
                        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                        <Package size={32} style={{ color: "var(--text-muted)", opacity: 0.25 }} />
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhum produto encontrado</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            Importe um CSV (detalhado) ou XLSX (agregado)
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {filteredData.map((row, i) => (
                            <ProductRow
                                key={i}
                                group={row.groupName ?? "—"}
                                brand={row.brand ?? "—"}
                                products={row.totalProducts}
                                stock={row.totalStock}
                            />
                        ))}
                    </div>
                )}

                {/* ── Fonte dos dados ── */}
                {inventoryData && (inventoryData.productsBySource.detailed > 0 || inventoryData.productsBySource.aggregated > 0) && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                        <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Fontes:</span>
                        {inventoryData.productsBySource.detailed > 0 && (
                            <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.2)" }}>
                                DETAILED: {inventoryData.productsBySource.detailed}
                            </span>
                        )}
                        {inventoryData.productsBySource.aggregated > 0 && (
                            <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
                                AGGREGATED: {inventoryData.productsBySource.aggregated}
                            </span>
                        )}
                    </div>
                )}

                {/* ── Histórico de importações ── */}
                {inventoryData?.importHistory && inventoryData.importHistory.length > 0 && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wide font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                            Histórico de importações
                        </p>
                        <div className="flex flex-col gap-1">
                            {inventoryData.importHistory.map(imp => (
                                <div
                                    key={imp.id}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-[11px]"
                                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
                                >
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                        style={{
                                            background: imp.fileName.endsWith(".xlsx") ? "rgba(168,85,247,0.1)" : "rgba(34,197,94,0.1)",
                                            color: imp.fileName.endsWith(".xlsx") ? "#a855f7" : "#22c55e",
                                            border: `1px solid ${imp.fileName.endsWith(".xlsx") ? "rgba(168,85,247,0.2)" : "rgba(34,197,94,0.2)"}`,
                                        }}
                                    >
                                        {imp.fileName.endsWith(".xlsx") ? "XLSX" : "CSV"}
                                    </span>
                                    <span className="flex-1 truncate font-medium" style={{ color: "var(--text-primary)" }}>{imp.fileName}</span>
                                    <span style={{ color: "var(--text-muted)" }}>{imp.validRows} produtos</span>
                                    <span style={{ color: "var(--text-muted)" }}>{fmtTime(imp.importedAt)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Toast: Upload result */}
            {uploadResult && (
                <div
                    className="fixed bottom-4 right-4 p-3 rounded-xl shadow-lg"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--color-ai-sales-border)", boxShadow: "var(--shadow-md)", zIndex: 50, minWidth: 240 }}
                >
                    <div className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-ai-sales)" }} />
                        <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
                                Importação concluída
                                <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded"
                                    style={{
                                        background: uploadResult.sourceType === "AGGREGATED" ? "var(--bg-elevated)" : "rgba(59,130,246,0.1)",
                                        color: uploadResult.sourceType === "AGGREGATED" ? "var(--text-muted)" : "#3b82f6",
                                    }}>
                                    {uploadResult.sourceType ?? "DETAILED"}
                                </span>
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {(uploadResult.inserted ?? 0) > 0 && (
                                    <span className="text-[11px]" style={{ color: "var(--color-ai-sales)" }}>
                                        +{uploadResult.inserted} inseridos
                                    </span>
                                )}
                                {(uploadResult.updated ?? 0) > 0 && (
                                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                                        ↺ {uploadResult.updated} atualizados
                                    </span>
                                )}
                                {(uploadResult.inserted ?? 0) === 0 && (uploadResult.updated ?? 0) === 0 && (
                                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                        {uploadResult.upserted} processados
                                    </span>
                                )}
                            </div>
                            {uploadResult.invalidRows > 0 && (
                                <span className="text-[10px] block mt-0.5" style={{ color: "var(--text-muted)" }}>
                                    {uploadResult.invalidRows} linhas ignoradas
                                </span>
                            )}
                        </div>
                        <button onClick={() => setUploadResult(null)} style={{ color: "var(--text-muted)" }}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            {uploadError && (
                <div
                    className="fixed bottom-4 right-4 p-3 rounded-xl shadow-lg"
                    style={{ background: "var(--bg-surface)", border: "1px solid rgba(220,38,38,0.3)", boxShadow: "var(--shadow-md)", zIndex: 50 }}
                >
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} style={{ color: "var(--color-danger)" }} />
                        <span className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>{uploadError}</span>
                        <button onClick={() => setUploadError("")} style={{ color: "var(--text-muted)" }}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
