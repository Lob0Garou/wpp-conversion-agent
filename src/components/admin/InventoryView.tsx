"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Package, XCircle, AlertTriangle, CheckCircle, X, Sparkles, CheckCheck } from "lucide-react";
import type { InventoryItem, InventoryFilter, ConversationSlots } from "./types/console.types";
import type { InferredSlots } from "./parseTimeline";
import RetroStockChecker from "./RetroStockChecker";

// ─── Mock Inventory Data ───────────────────────────────────────────

const mockInventory: InventoryItem[] = [
  { id: '1', name: 'Nike Air Max 90', brand: 'Nike', category: 'tenis', size: '42', stock: 3, price: 599, sku: 'NK-AM90-42' },
  { id: '2', name: 'Adidas Ultraboost', brand: 'Adidas', category: 'tenis', size: '42', stock: 0, price: 699, sku: 'AD-UB-42' },
  { id: '3', name: 'Nike Revolution 6', brand: 'Nike', category: 'tenis', size: '38', stock: 5, price: 299, sku: 'NK-REV6-38' },
  { id: '4', name: 'Adidas Grand Court', brand: 'Adidas', category: 'tenis', size: '40', stock: 2, price: 249, sku: 'AD-GC-40' },
  { id: '5', name: 'Puma RS-X', brand: 'Puma', category: 'tenis', size: '42', stock: 1, price: 449, sku: 'PM-RSX-42' },
  { id: '6', name: 'Nike Dri-FIT Shirt', brand: 'Nike', category: 'roupa', size: 'M', stock: 10, price: 149, sku: 'NK-DF-M' },
  { id: '7', name: 'Adidas Track Pants', brand: 'Adidas', category: 'roupa', size: 'G', stock: 7, price: 199, sku: 'AD-TP-G' },
  { id: '8', name: 'Mizuno Wave Rider', brand: 'Mizuno', category: 'tenis', size: '42', stock: 4, price: 549, sku: 'MZ-WR-42' },
  { id: '9', name: 'Asics Gel-Kayano', brand: 'Asics', category: 'tenis', size: '41', stock: 2, price: 649, sku: 'AS-GK-41' },
  { id: '10', name: 'New Balance 574', brand: 'New Balance', category: 'tenis', size: '43', stock: 6, price: 399, sku: 'NB-574-43' },
];

// ─── Stock Status ──────────────────────────────────────────────────
//  >5  → ✓ green  |  1–5 → ⚠ amber  |  0 → ✗ red + grayscale card

type StockConfig = {
  icon: React.ElementType;
  symbol: string;
  label: string;
  color: string;
  cardFilter: string;
  badgeBg: string;
  badgeBorder: string;
};

function getStockStatus(stock: number): StockConfig {
  if (stock === 0) return {
    icon: XCircle,
    symbol: "✗",
    label: "Sem Estoque",
    color: "var(--color-danger)",
    cardFilter: "grayscale(0.85) opacity(0.50)",
    badgeBg: "rgba(239,68,68,0.10)",
    badgeBorder: "rgba(239,68,68,0.20)",
  };
  if (stock <= 5) return {
    icon: AlertTriangle,
    symbol: "⚠",
    label: `Estoque Baixo · ${stock} un.`,
    color: "var(--color-warning)",
    cardFilter: "none",
    badgeBg: "rgba(245,158,11,0.10)",
    badgeBorder: "rgba(245,158,11,0.20)",
  };
  return {
    icon: CheckCircle,
    symbol: "✓",
    label: `Em Estoque · ${stock} un.`,
    color: "var(--color-ai-sales)",
    cardFilter: "none",
    badgeBg: "var(--color-ai-sales-bg)",
    badgeBorder: "var(--color-ai-sales-border)",
  };
}

function formatPrice(price: number | undefined): string {
  if (!price) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

// ─── Debounce Hook ─────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── SKU Copy Badge ────────────────────────────────────────────────

function SkuBadge({ sku }: { sku?: string }) {
  const [copied, setCopied] = useState(false);
  const label = sku ?? "N/A";

  const handleCopy = () => {
    if (!sku) return;
    navigator.clipboard.writeText(sku).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title={sku ? "Copiar SKU" : undefined}
      className="font-mono text-[10px] px-1.5 py-px rounded transition-all"
      style={{
        background: copied ? "var(--color-ai-sales-bg)" : "var(--bg-overlay)",
        color: copied ? "var(--color-ai-sales)" : "var(--text-disabled)",
        cursor: sku ? "pointer" : "default",
        border: copied ? "1px solid var(--color-ai-sales-border)" : "1px solid transparent",
      }}
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────

interface InventoryViewProps {
  slots?: ConversationSlots | InferredSlots;
  onProductSelect?: (product: InventoryItem) => void;
}

export default function InventoryView({ slots, onProductSelect }: InventoryViewProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InventoryFilter>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [retroProduct, setRetroProduct] = useState<InventoryItem | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!slots) return;
    const init: InventoryFilter = {};
    if (slots.marca) init.marca = slots.marca;
    if (slots.categoria) init.categoria = slots.categoria;
    if (slots.size) init.size = slots.size;
    setFilters(init);
  }, [slots]);

  const filteredProducts = useMemo(() => {
    let result = [...mockInventory];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      );
    }
    if (filters.marca) result = result.filter(p => p.brand.toLowerCase() === filters.marca!.toLowerCase());
    if (filters.categoria) result = result.filter(p => p.category.toLowerCase() === filters.categoria!.toLowerCase());
    if (filters.size) result = result.filter(p => p.size.toLowerCase() === filters.size!.toLowerCase());
    // Out-of-stock last
    return result.sort((a, b) => (a.stock === 0 ? 1 : 0) - (b.stock === 0 ? 1 : 0));
  }, [debouncedSearch, filters]);

  const removeFilter = (key: keyof InventoryFilter) =>
    setFilters(prev => { const next = { ...prev }; delete next[key]; return next; });

  const handleConfirmAvailability = async (product: InventoryItem) => {
    setConfirmingId(product.id);
    // Show retro animation
    setRetroProduct(product);
    await new Promise(r => setTimeout(r, 800));
    setConfirmingId(null);
  };

  const handleSuggestSimilar = async (product: InventoryItem) => {
    setSuggestingId(product.id);
    await new Promise(r => setTimeout(r, 600));
    setSuggestingId(null);
    setFilters({ marca: product.brand });
    setSearch("");
  };

  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-base)" }}>

      {/* Retro Stock Checker overlay */}
      {retroProduct && (
        <RetroStockChecker
          productName={retroProduct.name}
          brand={retroProduct.brand}
          size={retroProduct.size}
          sku={retroProduct.sku}
          stock={retroProduct.stock}
          autoCloseMsAfterResult={3500}
          onClose={() => {
            setRetroProduct(null);
            onProductSelect?.(retroProduct);
          }}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "var(--border-default)" }}>
        <div className="flex items-center gap-2 mb-0.5">
          <Package size={15} style={{ color: "var(--text-muted)" }} />
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Inventário</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Consulte disponibilidade em tempo real</p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-default)" }}>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Buscar produto, marca ou SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg pl-9 pr-4 py-2 text-sm outline-none transition-all"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--color-ai-sales-border)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border-default)")}
          />
        </div>
      </div>

      {/* Filter chips */}
      {activeFilterCount > 0 && (
        <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-wrap"
          style={{ borderColor: "var(--border-default)", background: "var(--bg-surface)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-disabled)" }}>
            Filtros:
          </span>
          {filters.marca && (
            <button onClick={() => removeFilter("marca")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ color: "var(--color-human)", background: "var(--color-human-bg)", border: "1px solid var(--color-human-border)" }}>
              Marca: {filters.marca} <X size={10} />
            </button>
          )}
          {filters.categoria && (
            <button onClick={() => removeFilter("categoria")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ color: "var(--color-ai-sac)", background: "var(--color-ai-sac-bg)", border: "1px solid var(--color-ai-sac-border)" }}>
              Cat: {filters.categoria} <X size={10} />
            </button>
          )}
          {filters.size && (
            <button onClick={() => removeFilter("size")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ color: "var(--color-ai-sales)", background: "var(--color-ai-sales-bg)", border: "1px solid var(--color-ai-sales-border)" }}>
              Tam: {filters.size} <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* Product list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center"
            style={{ color: "var(--text-muted)" }}>
            <Package size={36} className="mb-3 opacity-25" />
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Nenhum produto encontrado
            </p>
            <p className="text-xs">Ajuste os filtros ou busca</p>
          </div>
        ) : (
          <div>
            {filteredProducts.map(product => {
              const ss = getStockStatus(product.stock);
              const StockIcon = ss.icon;
              const isConfirming = confirmingId === product.id;
              const isSuggesting = suggestingId === product.id;
              const isOOS = product.stock === 0;

              return (
                <div key={product.id}
                  className="px-4 py-3.5 border-b transition-colors"
                  style={{
                    filter: ss.cardFilter,
                    borderColor: "rgba(42,46,56,0.4)",
                  }}
                  onMouseEnter={e => {
                    if (!isOOS) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
                  }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>

                  {/* Product info row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                          {product.brand}
                        </span>
                        <span style={{ color: "var(--border-strong)" }}>·</span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Tam: {product.size}</span>
                        <span style={{ color: "var(--border-strong)" }}>·</span>
                        <SkuBadge sku={product.sku} />
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold" style={{ color: "var(--color-ai-sales)" }}>
                        {formatPrice(product.price)}
                      </p>
                    </div>
                  </div>

                  {/* Stock badge */}
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                      style={{ color: ss.color, background: ss.badgeBg, border: `1px solid ${ss.badgeBorder}` }}>
                      <StockIcon size={11} />
                      {ss.symbol} {ss.label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirmAvailability(product)}
                      disabled={isOOS || isConfirming}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: isOOS ? "var(--bg-overlay)" : "var(--color-ai-sales)",
                        border: `1px solid ${isOOS ? "var(--border-default)" : "var(--color-ai-sales)"}`,
                      }}
                    >
                      {isConfirming ? (
                        <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Verificando...</>
                      ) : (
                        <><CheckCheck size={13} /> Confirmar Disponibilidade</>
                      )}
                    </button>
                    <button
                      onClick={() => handleSuggestSimilar(product)}
                      disabled={isSuggesting}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                      style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)"; }}
                    >
                      {isSuggesting
                        ? <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border-strong)", borderTopColor: "var(--text-secondary)" }} />
                        : <><Sparkles size={12} /> Similares</>
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t" style={{ borderColor: "var(--border-default)", background: "var(--bg-surface)" }}>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {filteredProducts.length} de {mockInventory.length} produtos
          {activeFilterCount > 0 && ` · ${activeFilterCount} filtro${activeFilterCount > 1 ? "s" : ""} ativo${activeFilterCount > 1 ? "s" : ""}`}
        </p>
      </div>
    </div>
  );
}
