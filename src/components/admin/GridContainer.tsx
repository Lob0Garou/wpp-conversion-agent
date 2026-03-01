"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import ConversationCard, { type ConversationCardData } from "./ConversationCard";
import EmptySlotCard from "./EmptySlotCard";

interface GridContainerProps {
  /** Always exactly 9 items; null = empty slot */
  slots: (ConversationCardData | null)[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCardBecomeUrgent?: (id: string) => void;
  onCardResolve?: (id: string) => void;
  isCompact?: boolean;
}

export default function GridContainer({ slots, selectedId, onSelect, onCardResolve, isCompact = false }: GridContainerProps) {
  const gridCols = isCompact
    ? "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3"
    : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <LayoutGroup id="grid">
      {/* Scrollable container so cards never overflow/overlap */}
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border-subtle) transparent" }}>
        <div className={`grid ${gridCols} gap-6 p-6 auto-rows-[260px]`}>
          <AnimatePresence mode="popLayout">
            {slots.map((card, idx) =>
              card ? (
                <motion.div
                  key={card.id}
                  layoutId={card.id}
                  initial={{ opacity: 0, scale: 0.95, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  className="h-full"
                >
                  <ConversationCard
                    key={card.id}
                    data={card}
                    isActive={selectedId === card.id}
                    isDimmed={!!selectedId && selectedId !== card.id}
                    onClick={() => onSelect(card.id)}
                    onResolve={() => onCardResolve?.(card.id)}
                  />
                </motion.div>
              ) : (
                <EmptySlotCard key={`empty-${idx}`} index={idx} />
              )
            )}
          </AnimatePresence>
        </div>
      </div>
    </LayoutGroup>
  );
}
