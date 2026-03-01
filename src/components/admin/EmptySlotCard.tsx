"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface EmptySlotCardProps {
  index: number;
}

export default function EmptySlotCard({ index }: EmptySlotCardProps) {
  return (
    <motion.div
      key={`empty-${index}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={[
        // Layout
        "flex min-h-[180px] flex-col items-center justify-center",
        // Shape
        "rounded-xl border border-dashed border-[var(--border-subtle)]",
        // Surface
        "bg-[var(--bg-surface)]/20",
        // Interaction
        "cursor-pointer group transition-colors duration-200",
        "hover:border-[var(--border-default)] hover:bg-[var(--bg-surface)]/50",
      ].join(" ")}
    >
      <div className={[
        "flex h-10 w-10 items-center justify-center rounded-full",
        "bg-[var(--bg-overlay)]/50 text-[var(--text-muted)]",
        "transition-colors group-hover:bg-[var(--bg-overlay)] group-hover:text-[var(--text-secondary)]",
      ].join(" ")}>
        <Plus className="w-5 h-5" />
      </div>
      <span className={[
        "mt-3 text-[var(--text-xs)] font-bold tracking-widest uppercase",
        "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors",
      ].join(" ")}>
        Slot Livre
      </span>
    </motion.div>
  );
}
