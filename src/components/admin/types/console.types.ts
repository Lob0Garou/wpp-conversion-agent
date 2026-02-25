// ─── console.types.ts ──────────────────────────────────────────────
// Type definitions for the Sales & Support Console transformation.
// These types define the data structures for inventory management,
// SAC ticket handling, and timeline enhancement features.

// ─── Conversation Types ───────────────────────────────────────────

export interface Conversation {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: ConversationStatus;
  intent: 'SALES' | 'SAC';
  slots?: ConversationSlots;
  metadata?: ConversationMetadata;
  createdAt: string;
  updatedAt: string;
}

export type ConversationStatus =
  | 'open'
  | 'in_progress'
  | 'PENDING_HUMAN'
  | 'escalated'
  | 'closed';

export interface ConversationSlots {
  marca?: string;
  categoria?: string;
  size?: string;
  uso?: string;
  genero?: string;
  product?: string;
  goal?: string;
  orderId?: string;
}

export interface ConversationMetadata {
  sacTicket?: SACTicket;
  [key: string]: unknown;
}

// ─── Message Types ────────────────────────────────────────────────

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  timestamp: string;
  metadata?: MessageMetadata | null;
}

export interface MessageMetadata {
  intent?: 'SALES' | 'SAC' | 'HANDOFF';
  state?: string;
  requires_human?: boolean;
  source?: 'ai' | 'manual_reply' | 'template';
  confidence?: number;
}

// ─── Timeline Types ───────────────────────────────────────────────

export type TimelineItem =
  | { kind: 'customer'; message: Message }
  | { kind: 'agent'; message: Message; isManual: boolean }
  | { kind: 'system_log'; logType: SystemLogType; data: SystemLogData; timestamp: string };

export type SystemLogType = 'stock_check' | 'state_transition' | 'handoff' | 'ticket_created';

export interface SystemLogData {
  type: SystemLogType;
  query?: string;
  result?: 'found' | 'not_found' | 'unknown';
  fromState?: string;
  toState?: string;
  reason?: string;
}

// ─── INVENTORY TYPES ────────────────────────────────────────────────

/**
 * Represents a single item in the inventory catalog.
 */
export type InventoryItem = {
  /** Unique identifier for the inventory item */
  id: string;
  /** Product name */
  name: string;
  /** Brand name (e.g., "nike", "adidas") */
  brand: string;
  /** Product category (e.g., "tenis", "chuteira", "sandalia") */
  category: string;
  /** Size specification (e.g., "42", "M", "G") */
  size: string;
  /** Current stock quantity */
  stock: number;
  /** Optional price in cents or local currency */
  price?: number;
  /** Stock Keeping Unit identifier */
  sku?: string;
  /** Store location identifier */
  storeId?: string;
};

/**
 * Filter parameters for inventory search queries.
 */
export type InventoryFilter = {
  /** Filter by brand name */
  marca?: string;
  /** Filter by category */
  categoria?: string;
  /** Filter by size */
  size?: string;
  /** Filter by usage type (e.g., "corrida", "treino") */
  uso?: string;
  /** Free-text search query */
  search?: string;
};

// ─── SAC TICKET TYPES ───────────────────────────────────────────────

/**
 * Possible status values for a SAC ticket.
 * - 'critical': Requires immediate attention
 * - 'in_progress': Being actively handled
 * - 'resolved': Ticket has been closed
 */
export type SACStatus = 'critical' | 'in_progress' | 'resolved';

/**
 * Represents a customer support ticket in the SAC system.
 */
export type SACTicket = {
  /** Unique identifier for the ticket */
  id: string;
  /** Associated conversation ID from the messaging system */
  conversationId: string;

  // Customer data
  /** Customer's full name */
  customerName: string | null;
  /** Customer's CPF (Brazilian tax ID) */
  customerCpf: string | null;
  /** Customer's email address */
  customerEmail: string | null;
  /** Associated order ID if applicable */
  orderId: string | null;

  // Ticket data
  /** Human-readable ticket number (e.g., "SAC-2024-001") */
  ticketNumber: string;
  /** Description of the issue or request */
  description: string;
  /** Current status of the ticket */
  status: SACStatus;

  // Metadata
  /** ISO 8601 timestamp of ticket creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
};

/**
 * Customer data extracted from conversation messages with confidence scores.
 */
export type ExtractedCustomerData = {
  /** Customer name with confidence score */
  name: { value: string | null; confidence: number; source?: string };
  /** Customer CPF with confidence score */
  cpf: { value: string | null; confidence: number; source?: string };
  /** Customer email with confidence score */
  email: { value: string | null; confidence: number; source?: string };
  /** Order ID with confidence score */
  orderId: { value: string | null; confidence: number; source?: string };
};

// ─── TIMELINE ENHANCEMENT TYPES ─────────────────────────────────────

/**
 * Data structure for ticket_created system log entries.
 */
export type TicketCreatedData = {
  /** Human-readable ticket number */
  ticketNumber: string;
  /** Initial status of the ticket */
  status: SACStatus;
  /** Brief description of the ticket issue */
  description: string;
};

// ─── Legacy Compatibility Types ───────────────────────────────────

export interface ExtractedField<T> {
  value: T;
  confidence: number; // 0.0 to 1.0
  source: string; // Message ID or 'manual'
}

export type DataFieldKey = 'customerName' | 'customerCpf' | 'customerEmail' | 'orderId' | 'phone';

export interface MissingField {
  key: DataFieldKey;
  label: string;
  required: boolean;
}
