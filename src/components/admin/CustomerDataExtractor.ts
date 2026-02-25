// ─── CustomerDataExtractor.ts ─────────────────────────────────────
// Utility functions to extract customer data from messages

import type { ExtractedCustomerData } from './types/console.types';

// ─── Message Input Type ────────────────────────────────────────────

/**
 * Input message format for extraction functions.
 * Compatible with both RawMessage and Message types.
 */
export interface ExtractionMessage {
  content: string;
  direction: 'inbound' | 'outbound';
}

// ─── Regex Patterns ───────────────────────────────────────────────

/**
 * CPF pattern: matches 11 digits with or without dots/dash
 * Examples: 123.456.789-00, 12345678900, 123.456.78900
 */
const CPF_RE = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;

/**
 * Email pattern: standard email format validation
 * Examples: user@domain.com, user.name@subdomain.domain.org
 */
const EMAIL_RE = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;

/**
 * Order ID pattern: matches pedido/order/# followed by alphanumeric ID
 * Examples: pedido 12345, order: ABC123, #XYZ789
 */
const ORDER_ID_RE = /\b(pedido|order|#)\s*:?\s*([A-Z0-9-]+)\b/gi;

/**
 * Name extraction patterns for Brazilian Portuguese
 * Matches: "Meu nome é X", "Sou o X", "Aqui é o X", etc.
 */
const NAME_INTRO_RE = /(?:meu nome é|sou o|sou a|aqui é o|aqui é a|me chamo|chamo-me|o nome é|a nome é|nome:\s*)([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇa-záéíóúâêîôûãõç]+){0,3})/gi;

// ─── Helper Functions ─────────────────────────────────────────────

/**
 * Normalizes a CPF to standard format XXX.XXX.XXX-XX
 */
function normalizeCPF(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Calculates confidence score based on pattern match quality
 */
function calculateConfidence(
  value: string | null,
  pattern: 'cpf' | 'email' | 'order' | 'name',
  positionBonus: number = 0
): number {
  if (!value) return 0;

  let baseConfidence = 0;

  switch (pattern) {
    case 'cpf':
      // Valid CPF format (11 digits)
      const cpfDigits = value.replace(/\D/g, '');
      baseConfidence = cpfDigits.length === 11 ? 1.0 : 0.5;
      break;

    case 'email':
      // Standard email format validation
      baseConfidence = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) ? 0.95 : 0.6;
      break;

    case 'order':
      // Order ID should be alphanumeric
      baseConfidence = /^[A-Z0-9-]+$/i.test(value) && value.length >= 4 ? 0.85 : 0.5;
      break;

    case 'name':
      // Names should have at least 2 words, properly capitalized
      const words = value.trim().split(/\s+/);
      if (words.length >= 2) baseConfidence = 0.85;
      else if (words.length === 1 && value.length >= 3) baseConfidence = 0.6;
      else baseConfidence = 0.3;
      break;
  }

  return Math.min(1.0, baseConfidence + positionBonus);
}

// ─── Main Extraction Function ─────────────────────────────────────

/**
 * Extracts customer data from an array of messages.
 *
 * @param messages - Array of message objects with content and direction fields
 * @returns ExtractedCustomerData with name, cpf, email, and orderId
 *
 * @example
 * const messages = [
 *   { content: "Olá, meu nome é João Silva", direction: "inbound" },
 *   { content: "CPF: 123.456.789-00", direction: "inbound" },
 * ];
 * const data = extractCustomerData(messages);
 * // Returns: { name: { value: "João Silva", confidence: 0.9, source: "message_0" }, ... }
 */
export function extractCustomerData(messages: ExtractionMessage[]): ExtractedCustomerData {
  // Initialize result with null values
  const result: ExtractedCustomerData = {
    name: { value: null, confidence: 0, source: undefined },
    cpf: { value: null, confidence: 0, source: undefined },
    email: { value: null, confidence: 0, source: undefined },
    orderId: { value: null, confidence: 0, source: undefined },
  };

  // Handle empty messages array
  if (!messages || messages.length === 0) {
    return result;
  }

  // Get inbound messages only for extraction
  const inboundMessages = messages.filter(m => m.direction === 'inbound');

  // ── Extract Name (only from first 3 inbound messages) ─────────────
  const firstThreeInbound = inboundMessages.slice(0, 3);

  for (let i = 0; i < firstThreeInbound.length; i++) {
    const msg = firstThreeInbound[i];
    NAME_INTRO_RE.lastIndex = 0; // Reset regex

    const match = NAME_INTRO_RE.exec(msg.content);
    if (match && match[1]) {
      const name = match[1].trim();
      // Position bonus: earlier messages get higher confidence
      const positionBonus = (3 - i) * 0.02; // 0.06, 0.04, 0.02 for positions 0, 1, 2
      const confidence = calculateConfidence(name, 'name', positionBonus);

      if (confidence > result.name.confidence) {
        result.name = {
          value: name,
          confidence,
          source: `message_${i}`,
        };
      }
    }
  }

  // ── Extract CPF (all inbound messages) ────────────────────────────
  for (let i = 0; i < inboundMessages.length; i++) {
    const msg = inboundMessages[i];
    CPF_RE.lastIndex = 0; // Reset regex

    const match = CPF_RE.exec(msg.content);
    if (match && match[1]) {
      const cpf = normalizeCPF(match[1]);
      const confidence = calculateConfidence(cpf, 'cpf');

      if (confidence > result.cpf.confidence) {
        result.cpf = {
          value: cpf,
          confidence,
          source: `message_${i}`,
        };
      }
    }
  }

  // ── Extract Email (all inbound messages) ──────────────────────────
  for (let i = 0; i < inboundMessages.length; i++) {
    const msg = inboundMessages[i];
    EMAIL_RE.lastIndex = 0; // Reset regex

    const match = EMAIL_RE.exec(msg.content);
    if (match && match[1]) {
      const email = match[1].toLowerCase();
      const confidence = calculateConfidence(email, 'email');

      if (confidence > result.email.confidence) {
        result.email = {
          value: email,
          confidence,
          source: `message_${i}`,
        };
      }
    }
  }

  // ── Extract Order ID (all inbound messages) ───────────────────────
  for (let i = 0; i < inboundMessages.length; i++) {
    const msg = inboundMessages[i];
    ORDER_ID_RE.lastIndex = 0; // Reset regex

    const match = ORDER_ID_RE.exec(msg.content);
    if (match && match[2]) {
      const orderId = match[2].toUpperCase();
      const confidence = calculateConfidence(orderId, 'order');

      if (confidence > result.orderId.confidence) {
        result.orderId = {
          value: orderId,
          confidence,
          source: `message_${i}`,
        };
      }
    }
  }

  return result;
}

// ─── Missing Fields Helper ────────────────────────────────────────

export interface MissingField {
  key: 'name' | 'cpf' | 'email' | 'orderId';
  label: string;
  required: boolean;
}

export function getMissingFields(data: ExtractedCustomerData, minConfidence = 0.5): MissingField[] {
  const fieldConfigs: { key: 'name' | 'cpf' | 'email' | 'orderId'; label: string; required: boolean }[] = [
    { key: 'name', label: 'Nome Completo', required: true },
    { key: 'cpf', label: 'CPF', required: true },
    { key: 'email', label: 'E-mail', required: false },
    { key: 'orderId', label: 'Número do Pedido', required: false },
  ];

  return fieldConfigs.filter(({ key }) => {
    const field = data[key];
    return !field.value || field.confidence < minConfidence;
  });
}

// ─── Confidence Icon Helper ───────────────────────────────────────

export function getConfidenceIndicator(confidence: number): {
  icon: 'high' | 'medium' | 'low';
  color: string;
  label: string;
} {
  if (confidence >= 0.8) {
    return { icon: 'high', color: 'text-emerald-400', label: 'Alta confiança' };
  }
  if (confidence >= 0.5) {
    return { icon: 'medium', color: 'text-amber-400', label: 'Média confiança' };
  }
  return { icon: 'low', color: 'text-rose-400', label: 'Baixa confiança' };
}
