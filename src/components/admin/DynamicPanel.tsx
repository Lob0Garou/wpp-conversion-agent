"use client";

import type { ConversationSlots } from './types/console.types';
import type { RawMessage, InferredSlots } from './parseTimeline';
import InventoryView from './InventoryView';
import SACTicketForm from './SACTicketForm';

type Props = {
  conversation: {
    id: string;
    customerName: string | null;
    customerPhone: string;
    status: string;
    frustrationLevel?: number;
    slots?: InferredSlots | ConversationSlots;
  } | null;
  messages: RawMessage[];
  timeline: unknown[];
  intent: 'SALES' | 'SAC';
  onTicketCreated?: (ticket: unknown) => void;
  onProductSelect?: (product: unknown) => void;
};

export function DynamicPanel({
  conversation,
  messages,
  intent,
  onTicketCreated,
  onProductSelect
}: Props) {
  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted-light dark:text-text-muted-dark bg-[var(--bg-base)] border-l border-[var(--border-default)]">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
            <svg className="w-6 h-6 text-text-muted-light dark:text-text-muted-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-text-main-light dark:text-text-main-dark">Selecione uma conversa</p>
            <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">para visualizar detalhes</p>
          </div>
        </div>
      </div>
    );
  }

  if (intent === 'SAC') {
    return (
      <SACTicketForm
        conversationId={conversation.id}
        messages={messages}
        onTicketCreated={onTicketCreated}
      />
    );
  }

  return (
    <InventoryView
      slots={conversation.slots}
      onProductSelect={onProductSelect}
    />
  );
}

export default DynamicPanel;
