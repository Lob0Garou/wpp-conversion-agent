"use client";

import {
  useState, useEffect, useCallback, useRef, useMemo
} from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { RefreshCw, History, ChevronRight, X, AlertTriangle } from "lucide-react";
import GridContainer from "@/components/admin/GridContainer";
import ChatModal from "@/components/admin/ChatModal";
import type { ConversationCardData } from "@/components/admin/ConversationCard";
import type { RawMessage, InferredSlots } from "@/components/admin/parseTimeline";
import { inferSlotsFromMessages } from "@/components/admin/parseTimeline";
import { useAdminTab } from "@/contexts/AdminTabContext";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ConversationListItem {
  id: string;
  status: string;
  conversationType?: string;
  customerPhone: string;
  customerName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageDirection?: string;
  frustrationLevel?: number;
  slots?: InferredSlots;
}

interface MessagesResponse {
  conversationId: string;
  status: string;
  messages: RawMessage[];
  frustrationLevel?: number;
  slots?: InferredSlots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getIntent(status?: string, frustrationLevel?: number, slots?: InferredSlots): "SALES" | "SAC" {
  if (status === "PENDING_HUMAN" && (frustrationLevel ?? 0) >= 2) return "SAC";
  if (slots?.intent === "support") return "SAC";
  return "SALES";
}

async function fetchConversations(): Promise<ConversationListItem[]> {
  const res = await fetch("/api/conversations", { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar conversas");
  return res.json();
}

async function fetchMessages(id: string): Promise<MessagesResponse> {
  const res = await fetch(`/api/conversations/${id}/messages`, { cache: "no-store" });
  if (!res.ok) throw new Error("Falha ao carregar mensagens");
  return res.json();
}

function mapToCard(item: ConversationListItem, messages?: RawMessage[]): ConversationCardData {
  let intent: string | undefined;
  let frustrationLevel = item.frustrationLevel;
  let slots = item.slots;

  if (messages) {
    const lastOut = [...messages].reverse().find(m => m.direction === "outbound");
    intent = lastOut?.metadata?.intent ?? undefined;
    if (!intent) {
      const lastIn = [...messages].reverse().find(m => m.direction === "inbound");
      intent = lastIn?.metadata?.intent ?? undefined;
    }
    if (!slots) slots = inferSlotsFromMessages(messages);
    if (frustrationLevel === undefined) {
      const inbound = messages.filter(m => m.direction === "inbound");
      let count = 0;
      for (const m of inbound) {
        if (/[A-Z]{4,}/.test(m.content) || /[!?]{3,}/.test(m.content)) count++;
      }
      frustrationLevel = Math.min(count, 3);
    }
  }

  return {
    id: item.id,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    conversationType: item.conversationType,
    lastMessage: item.lastMessage,
    lastMessageAt: item.lastMessageAt,
    status: item.status,
    intent,
    lastMessageDirection: item.lastMessageDirection,
    frustrationLevel,
    slots,
  };
}

/** Priority sort: escalated > high frustration > newest */
function sortByPriority(items: ConversationListItem[]): ConversationListItem[] {
  return [...items].sort((a, b) => {
    const scoreA = (a.status === "PENDING_HUMAN" || a.status === "escalated" ? 2 : 0)
      + ((a.frustrationLevel ?? 0) >= 2 ? 1 : 0);
    const scoreB = (b.status === "PENDING_HUMAN" || b.status === "escalated" ? 2 : 0)
      + ((b.frustrationLevel ?? 0) >= 2 ? 1 : 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HistoryRail (inline column in VendasTab)
// ─────────────────────────────────────────────────────────────────────────────
interface HistoryRailProps {
  onClose: () => void;
  queuedChats: ConversationCardData[];
  onPromote: (card: ConversationCardData) => void;
}

function HistoryRail({ onClose, queuedChats, onPromote }: HistoryRailProps) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="h-full basis-1/5 min-w-[260px] max-w-[420px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-base)]/90 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)] shrink-0">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          Fila de Espera
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--color-brand)] text-white text-[9px] font-black leading-none">
            {queuedChats.length}
          </span>
        </h2>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin" }}>
        {queuedChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--border-default)]">
            <History className="w-6 h-6" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Fila vazia</span>
          </div>
        ) : (
          <LayoutGroup id="history-sidebar-list">
            <div className="p-2 space-y-1">
              {queuedChats.map((card) => {
                const isPending = card.status === "PENDING_HUMAN" || card.status === "escalated";
                const accentBorder = isPending || card.intent === "SAC"
                  ? "border-l-[var(--color-brand)]"
                  : "border-l-[var(--color-success)]";
                const label = card.slots?.categoria
                  || card.slots?.marca
                  || card.customerName
                  || `...${card.customerPhone.slice(-4)}`;

                return (
                  <motion.div
                    key={card.id}
                    layoutId={card.id}
                    layout
                    onClick={() => onPromote(card)}
                    whileHover={{ x: 4 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={`flex items-center justify-between p-3 rounded-xl border-l-2 ${accentBorder} bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors group`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[var(--bg-overlay)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] shrink-0">
                        {(card.customerName ?? "WA").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[var(--text-primary)] truncate">{label}</p>
                        <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[220px]">
                          {card.lastMessage || "..."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isPending && (
                        <span className="text-[9px] font-black text-[var(--color-brand)] border border-[var(--color-brand)]/30 px-1 rounded uppercase">
                          ESC
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--border-default)] group-hover:text-[var(--text-muted)] transition-colors" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </LayoutGroup>
        )}
      </div>

      <div className="px-4 py-2 border-t border-[var(--border-default)] shrink-0 text-[10px] text-[var(--text-muted)]/60 uppercase tracking-widest font-bold">
        Clique para promover ao grid
      </div>
    </motion.aside>
  );
}
const GRID_SIZE = 9;
const GENERAL_IDLE_CLOSE_MS = 3 * 60 * 1000;

interface SlaToast {
  id: string;
  name: string;
}

export default function VendasTab() {
  const { setActiveTab } = useAdminTab();

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messagesData, setMessagesData] = useState<MessagesResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"todos" | "vendas" | "duvidas" | "sac">("todos");
  const [slaToasts, setSlaToasts] = useState<SlaToast[]>([]);

  // The 9-slot active grid
  const [activeSlots, setActiveSlots] = useState<(ConversationCardData | null)[]>(
    () => Array(GRID_SIZE).fill(null)
  );
  const urgentIds = useRef<Set<string>>(new Set());
  const autoClosedIds = useRef<Set<string>>(new Set());
  const [idleSweepTick, setIdleSweepTick] = useState(0);

  const convTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setIdleSweepTick(v => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchConversations();
      setConversations(data);
    } catch (err) {
      console.error("[VendasTab] Falha ao carregar conversas:", err);
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    convTimerRef.current = setInterval(loadConversations, 5000);
    return () => { if (convTimerRef.current) clearInterval(convTimerRef.current); };
  }, [loadConversations]);

  // ── Load messages for selected conversation ─────────────────────────────────
  const loadMessages = useCallback(async (id: string) => {
    try {
      const data = await fetchMessages(id);
      setMessagesData(data);
    } catch (err) {
      console.error("[VendasTab] Falha ao carregar mensagens:", err);
    }
  }, []);

  useEffect(() => {
    if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    if (!selectedId) return;
    loadMessages(selectedId);
    msgTimerRef.current = setInterval(() => loadMessages(selectedId), 5000);
    return () => { if (msgTimerRef.current) clearInterval(msgTimerRef.current); };
  }, [selectedId, loadMessages]);

  // ── Populate grid slots when conversations update ───────────────────────────
  useEffect(() => {
    const sorted = sortByPriority(conversations);
    const allCards = sorted.map(c => mapToCard(c));

    setActiveSlots(prev => {
      const next: (ConversationCardData | null)[] = Array(GRID_SIZE).fill(null);

      // 1. Lock urgent cards in their current slots (with updated data)
      prev.forEach((slot, idx) => {
        if (slot && urgentIds.current.has(slot.id)) {
          next[idx] = allCards.find(c => c.id === slot.id) ?? slot;
        }
      });

      // 2. Keep selected card in its current slot
      if (selectedId && !next.some(s => s?.id === selectedId)) {
        const prevIdx = prev.findIndex(s => s?.id === selectedId);
        if (prevIdx >= 0) {
          next[prevIdx] = allCards.find(c => c.id === selectedId) ?? prev[prevIdx];
        }
      }

      // 3. Fill remaining empty slots with priority-ordered cards
      const placedIds = new Set(next.filter(Boolean).map(s => s!.id));
      const toPlace = allCards.filter(c => !placedIds.has(c.id));
      let pi = 0;
      for (let i = 0; i < GRID_SIZE; i++) {
        if (!next[i] && pi < toPlace.length) {
          next[i] = toPlace[pi++];
        }
      }

      return next;
    });
  }, [conversations, selectedId]);

  // ── Queued chats (overflow beyond the 9 grid slots) ────────────────────────
  const queuedChats = useMemo<ConversationCardData[]>(() => {
    const activeIds = new Set(activeSlots.filter(Boolean).map(s => s!.id));
    return sortByPriority(conversations)
      .filter(c => !activeIds.has(c.id))
      .map(c => mapToCard(c));
  }, [conversations, activeSlots]);

  // ── Promote a chat from sidebar into the grid ────────────────────────────────
  const promoteChat = useCallback((card: ConversationCardData) => {
    setActiveSlots(prev => {
      const next = [...prev];

      // Try first empty slot
      let idx = next.findIndex(s => s === null);

      // Otherwise replace the non-urgent slot with the oldest last message
      if (idx === -1) {
        let oldestTime = Infinity;
        let oldestIdx = -1;
        next.forEach((slot, i) => {
          if (!slot || urgentIds.current.has(slot.id)) return;
          const t = slot.lastMessageAt ? new Date(slot.lastMessageAt).getTime() : 0;
          if (t < oldestTime) { oldestTime = t; oldestIdx = i; }
        });
        idx = oldestIdx;
      }

      if (idx >= 0) next[idx] = card;
      return next;
    });
    setShowHistory(false);
  }, []);

  // ── Resolve a card (from card button OR modal button) ────────────────────
  const handleResolve = useCallback((id: string) => {
    // Otimistic UI update: remove imediatamente da tela
    urgentIds.current.delete(id);
    setActiveSlots(prev => prev.map(s => (s?.id === id ? null : s)));
    setConversations(prev => prev.filter(c => c.id !== id));
    setSelectedId(prev => (prev === id ? null : prev));

    // Background API call
    fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" })
    }).catch(e => {
      console.error("[VendasTab] Erro ao resolver:", e);
    });
  }, []);

  const hasSalesSignals = useCallback((card: ConversationCardData) => {
    const slots = card.slots;
    return Boolean(slots?.product || slots?.marca || slots?.categoria || slots?.size || slots?.color || slots?.cor);
  }, []);

  const hasSacSignals = useCallback((card: ConversationCardData) => {
    const slots = card.slots;
    return Boolean(slots?.motivoTroca || slots?.orderId || slots?.statusPedido || slots?.email);
  }, []);

  const shouldAutoConcludeGeneral = useCallback((card: ConversationCardData, nowMs: number) => {
    if (card.status === "closed") return false;
    if (card.status === "PENDING_HUMAN" || card.status === "escalated") return false;
    if (card.lastMessageDirection !== "outbound") return false;
    if (hasSalesSignals(card) || hasSacSignals(card)) return false;
    if ((card.conversationType || "").toLowerCase() === "sac") return false;
    const ts = card.lastMessageAt ? new Date(card.lastMessageAt).getTime() : 0;
    if (!ts) return false;
    return nowMs - ts >= GENERAL_IDLE_CLOSE_MS;
  }, [hasSacSignals, hasSalesSignals]);

  useEffect(() => {
    const now = Date.now();
    for (const card of activeSlots) {
      if (!card) continue;
      if (selectedId === card.id) continue;
      if (autoClosedIds.current.has(card.id)) continue;
      if (!shouldAutoConcludeGeneral(card, now)) continue;
      autoClosedIds.current.add(card.id);
      handleResolve(card.id);
    }
  }, [activeSlots, idleSweepTick, selectedId, shouldAutoConcludeGeneral, handleResolve]);

  // ── Mark a card as urgent (NEW expiry only — ChatCard.urgentFiredRef already filters mounts) ──
  const handleUrgent = useCallback((id: string) => {
    urgentIds.current.add(id);

    // Find the card name for the toast
    setActiveSlots(prev => {
      const card = prev.find(s => s?.id === id);
      const name = card?.slots?.categoria || card?.slots?.marca || card?.customerName || `…${id.slice(-4)}`;
      // Show toast notification
      setSlaToasts(ts => [...ts, { id, name }]);
      // Auto-dismiss this toast after 8 s
      setTimeout(() => {
        setSlaToasts(ts => ts.filter(t => t.id !== id));
      }, 8000);
      // Remove card from grid (frees slot for next in queue)
      return prev.map(s => (s?.id === id ? null : s));
    });
  }, []);

  // ── Listen for footer toggle event ─────────────────────────────────────────
  useEffect(() => {
    const handler = () => setShowHistory(v => !v);
    window.addEventListener("toggle-history", handler);
    return () => window.removeEventListener("toggle-history", handler);
  }, []);

  // ── Selected conversation data ──────────────────────────────────────────────
  const selectedConv = conversations.find(c => c.id === selectedId);
  const currentStatus = messagesData?.status ?? selectedConv?.status ?? "open";
  const currentFrustration = messagesData?.frustrationLevel ?? selectedConv?.frustrationLevel;
  const currentSlots = messagesData?.slots ?? selectedConv?.slots;
  const currentIntent = getIntent(currentStatus, currentFrustration, currentSlots);

  // ── Filter active slots by pill selection ─────────────────────────────────
  const filteredSlots = useMemo<(ConversationCardData | null)[]>(() => {
    if (activeFilter === "todos") return activeSlots;
    return activeSlots.map(card => {
      if (!card) return null;
      const isPending = card.status === "PENDING_HUMAN" || card.status === "escalated";
      const intent = card.intent ?? "";
      const isSACIntent = card.slots?.intent === "support" || intent === "HANDOFF";
      const isInfo = ["INFO", "CLARIFICATION", "INFO_ADDRESS", "INFO_HOURS", "INFO_PICKUP_POLICY", "INFO_SAC_POLICY"].includes(intent);
      if (activeFilter === "sac" && (isPending || isSACIntent)) return card;
      if (activeFilter === "duvidas" && isInfo) return card;
      if (activeFilter === "vendas" && !isPending && !isSACIntent && !isInfo) return card;
      return null;
    });
  }, [activeSlots, activeFilter]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const leadsCount = conversations.filter(
    c => c.status === "PENDING_HUMAN" || c.status === "escalated"
  ).length;
  const ativasCount = conversations.filter(c => c.status !== "closed").length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-deep)]">

      {/* ── Metrics Row ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-0 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Leads Quentes */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-5 py-4 hover:bg-[var(--bg-surface)]/60 transition-colors">
            <div className="space-y-1">
              <p className="text-[var(--text-xs)] font-bold tracking-widest text-[var(--text-muted)] uppercase">Leads Quentes</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-[var(--text-primary)]">{leadsCount}</span>
                <span className="text-sm font-medium text-[var(--color-success)]">ativo</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
            </div>
          </div>
          {/* Taxa de Conversão */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-5 py-4 hover:bg-[var(--bg-surface)]/60 transition-colors">
            <div className="space-y-1">
              <p className="text-[var(--text-xs)] font-bold tracking-widest text-[var(--text-muted)] uppercase">Taxa de Conversão</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-[var(--text-primary)]">64%</span>
                <span className="text-sm font-medium text-emerald-400">+2.4%</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-overlay)]/50 border border-[var(--border-subtle)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
          </div>
          {/* Conversas Ativas */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-5 py-4 hover:bg-[var(--bg-surface)]/60 transition-colors">
            <div className="space-y-1">
              <p className="text-[var(--text-xs)] font-bold tracking-widest text-[var(--text-muted)] uppercase">Conversas Ativas</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-[var(--text-primary)] font-mono">{ativasCount}</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-overlay)]/50 border border-[var(--border-subtle)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z" />
                <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Workspace Container ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden mx-6 mb-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/20">

        {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3 shrink-0">
          {/* Left: counter pills */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)] border border-[var(--color-brand)]/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <div className="text-xl font-mono font-semibold leading-none text-[var(--text-primary)]">{leadsCount}</div>
                <div className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Leads</div>
              </div>
            </div>
            <div className="h-8 w-px bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
                </svg>
              </div>
              <div>
                <div className="text-xl font-mono font-semibold leading-none text-[var(--text-primary)]">{ativasCount}</div>
                <div className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">Conversas</div>
              </div>
            </div>
          </div>

          {/* Right: filter tabs + actions */}
          <div className="flex items-center gap-2">
            {/* Filter pill group */}
            <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-deep)] p-1 border border-[var(--border-subtle)]">
              {([
                { id: "todos", label: "Todos" },
                { id: "vendas", label: "Vendas" },
                { id: "duvidas", label: "Dúvidas" },
                { id: "sac", label: "SAC" },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-4 py-1.5 text-[var(--text-xs)] font-bold rounded-md transition-colors border ${activeFilter === f.id
                    ? "bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm border-[var(--border-default)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/50 border-transparent"
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Queue + Refresh */}
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[var(--text-xs)] font-bold transition-all ${showHistory
                ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--text-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
            >
              <History className="w-3.5 h-3.5" />
              Fila
              <span className={`px-1.5 py-0.5 rounded-full text-[var(--text-xs)] font-black leading-none ${queuedChats.length > 0
                ? "bg-[var(--color-brand)] text-white"
                : "bg-[var(--bg-overlay)] text-[var(--text-muted)]"
                }`}>
                {queuedChats.length}
              </span>
            </button>
            <button
              onClick={() => { loadConversations(); if (selectedId) loadMessages(selectedId); }}
              disabled={convLoading}
              className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] opacity-70 hover:opacity-100 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--text-muted)] ${convLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── Grid area ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative flex min-w-0">
          <AnimatePresence initial={false}>
            {showHistory && (
              <HistoryRail
                onClose={() => setShowHistory(false)}
                queuedChats={queuedChats}
                onPromote={promoteChat}
              />
            )}
          </AnimatePresence>

          <div className="relative flex-1 overflow-hidden min-w-0">
            <GridContainer
              slots={filteredSlots}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setMessagesData(null);
              }}
              onCardBecomeUrgent={handleUrgent}
              onCardResolve={handleResolve}
              isCompact={showHistory}
            />

            {/* Chat Modal */}
            {selectedId && (
              <ChatModal
                conversationId={selectedId}
                customerName={selectedConv?.customerName ?? null}
                customerPhone={selectedConv?.customerPhone ?? ""}
                status={currentStatus}
                messages={messagesData?.messages ?? []}
                intent={currentIntent}
                frustrationLevel={currentFrustration}
                slots={currentSlots}
                ticketNumber={null}
                onReplySent={() => { loadConversations(); loadMessages(selectedId); }}
                onClose={() => setSelectedId(null)}
                onResolve={() => handleResolve(selectedId!)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── SLA Expiry Toasts (bottom-right) ──────────────────────────────── */}
      <div className="fixed bottom-14 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {slaToasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.88 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="pointer-events-auto w-[300px] bg-[var(--bg-surface)] border border-[var(--color-brand)]/40 rounded-2xl shadow-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-brand)]/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-[var(--color-brand)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wide text-[var(--color-brand)]">SLA Expirado</p>
                  <p className="text-[12px] font-bold text-[var(--text-primary)] truncate mt-0.5">{toast.name}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Sem resolução em 30 min → Perdidos</p>
                </div>
                <button
                  onClick={() => setSlaToasts(ts => ts.filter(t => t.id !== toast.id))}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0 ml-auto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => { setSlaToasts([]); setActiveTab("perdidos"); }}
                className="w-full py-2 rounded-xl bg-[var(--color-brand)] hover:brightness-110 text-white text-[11px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Ver em Perdidos →
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

