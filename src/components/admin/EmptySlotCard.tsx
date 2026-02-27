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
      className="rounded-2xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 flex flex-col items-center justify-center gap-2 min-h-[160px] select-none"
    >
      <div className="w-8 h-8 rounded-full border border-[var(--border-subtle)] flex items-center justify-center">
        <Plus className="w-4 h-4 text-[var(--border-subtle)]" />
      </div>
      <span className="text-[var(--text-xs)] font-bold uppercase tracking-widest text-[var(--border-subtle)]">
        Slot Livre
      </span>
    </motion.div>
  );
}
