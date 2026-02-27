"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Shield,
  FileText,
  User,
  Mail,
  Hash,
  Package,
  AlertTriangle,
  CheckCheck,
  XCircle,
  Loader2,
} from "lucide-react";
import type { Message, SACStatus, SACTicket, ExtractedCustomerData } from "./types/console.types";
import type { RawMessage } from "./parseTimeline";
import { extractCustomerData, getMissingFields, getConfidenceIndicator, type MissingField } from "./CustomerDataExtractor";

// ─── Confidence Indicator Component ───────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { icon, color, label } = getConfidenceIndicator(confidence);

  const IconComponent =
    icon === "high" ? CheckCircle2 :
      icon === "medium" ? AlertTriangle :
        XCircle;

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <IconComponent size={12} />
      <span className="text-[var(--text-xs)] font-medium">{Math.round(confidence * 100)}%</span>
    </div>
  );
}

// ─── Data Field Input Component ───────────────────────────────────

interface DataFieldInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  confidence?: number;
  required?: boolean;
  icon: React.ElementType;
  placeholder: string;
}

function DataFieldInput({
  label,
  value,
  onChange,
  confidence,
  required,
  icon: Icon,
  placeholder,
}: DataFieldInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <Icon size={11} />
          {label}
          {required && <span className="text-rose-400">*</span>}
        </label>
        {confidence !== undefined && confidence > 0 && (
          <ConfidenceBadge confidence={confidence} />
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-brand-green)]/50 focus:ring-1 focus:ring-[var(--color-brand-green)]/30 transition-all"
      />
    </div>
  );
}

// ─── Status Selector Component ─────────────────────────────────────

interface StatusSelectorProps {
  value: SACStatus;
  onChange: (status: SACStatus) => void;
}

function StatusSelector({ value, onChange }: StatusSelectorProps) {
  const statusConfig: Record<SACStatus, { label: string; colorClass: string; icon: React.ElementType }> = {
    critical: {
      label: "Crítico",
      colorClass: "bg-rose-500/10 border-rose-500/30 text-rose-400",
      icon: AlertCircle,
    },
    in_progress: {
      label: "Em Andamento",
      colorClass: "bg-amber-500/10 border-amber-500/30 text-amber-400",
      icon: Loader2,
    },
    resolved: {
      label: "Resolvido",
      colorClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      icon: CheckCircle2,
    },
  };

  return (
    <div className="space-y-2">
      <label className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-wider">
        Status do Ticket
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(statusConfig) as SACStatus[]).map((status) => {
          const config = statusConfig[status];
          const Icon = config.icon;
          const isSelected = value === status;

          return (
            <button
              key={status}
              type="button"
              onClick={() => onChange(status)}
              className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border text-xs font-medium transition-all ${isSelected
                  ? config.colorClass
                  : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]"
                }`}
            >
              <Icon size={16} className={isSelected ? "" : "opacity-60"} />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Missing Fields Checklist Component ───────────────────────────

interface MissingFieldsChecklistProps {
  missingFields: MissingField[];
}

function MissingFieldsChecklist({ missingFields }: MissingFieldsChecklistProps) {
  if (missingFields.length === 0) return null;

  return (
    <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-amber-500/5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-xs font-bold text-amber-400 mb-2">Dados Pendentes</h4>
          <ul className="space-y-1">
            {missingFields.map(({ key, label, required }) => (
              <li key={key} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className={`w-1.5 h-1.5 rounded-full ${required ? "bg-rose-400" : "bg-amber-400"}`} />
                {label}
                {required && <span className="text-[var(--text-xs)] text-rose-400">(obrigatório)</span>}
              </li>
            ))}
          </ul>
          <p className="text-[var(--text-xs)] text-[var(--text-muted)] mt-2 italic">
            Preencha os campos abaixo para completar o cadastro
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main SACTicketForm Component ──────────────────────────────────

interface SACTicketFormProps {
  conversationId: string;
  messages: RawMessage[];
  onTicketCreated?: (ticket: SACTicket) => void;
}

export default function SACTicketForm({ conversationId, messages, onTicketCreated }: SACTicketFormProps) {
  // Extract customer data from messages
  const extractedData = useMemo(() => extractCustomerData(messages), [messages]);

  // Form state
  const [formData, setFormData] = useState({
    customerName: "",
    customerCpf: "",
    customerEmail: "",
    orderId: "",
    ticketNumber: "",
    description: "",
    status: "in_progress" as SACStatus,
  });

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState(false);

  // Populate form with extracted data
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customerName: extractedData.name.value || prev.customerName,
      customerCpf: extractedData.cpf.value || prev.customerCpf,
      customerEmail: extractedData.email.value || prev.customerEmail,
      orderId: extractedData.orderId.value || prev.orderId,
    }));
  }, [extractedData]);

  // Calculate missing fields
  const currentData = useMemo(
    () => ({
      name: { value: formData.customerName || null, confidence: formData.customerName ? 1 : 0 },
      cpf: { value: formData.customerCpf || null, confidence: formData.customerCpf ? 1 : 0 },
      email: { value: formData.customerEmail || null, confidence: formData.customerEmail ? 1 : 0 },
      orderId: { value: formData.orderId || null, confidence: formData.orderId ? 1 : 0 },
    }),
    [formData]
  );

  const missingFields = useMemo(() => getMissingFields(currentData, 0.5), [currentData]);

  // Generate ticket number
  const generateTicketNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SAC-${timestamp.slice(-4)}-${random}`;
  };

  // Handle form submission
  const handleCreateTicket = async () => {
    setIsCreating(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const ticket: SACTicket = {
      id: `ticket-${Date.now()}`,
      conversationId,
      customerName: formData.customerName || null,
      customerCpf: formData.customerCpf || null,
      customerEmail: formData.customerEmail || null,
      orderId: formData.orderId || null,
      ticketNumber: formData.ticketNumber || generateTicketNumber(),
      description: formData.description,
      status: formData.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCreated(true);
    setIsCreating(false);
    onTicketCreated?.(ticket);
  };

  const updateField = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (created) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg-deep)] border-l border-[var(--border-subtle)]">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <CheckCheck size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-white mb-2">Ticket Criado com Sucesso</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Número do ticket: <span className="font-mono text-[var(--color-brand-green)]">{formData.ticketNumber}</span>
            </p>
            <div className="px-4 py-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-secondary)]">Status: <span className="font-medium text-amber-400">{formData.status === "in_progress" ? "Em Andamento" : formData.status === "critical" ? "Crítico" : "Resolvido"}</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-deep)] border-l border-[var(--border-subtle)]">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold text-white">Ticket SAC</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Cadastre um ticket de atendimento</p>
      </div>

      {/* Missing Fields Checklist */}
      <MissingFieldsChecklist missingFields={missingFields} />

      {/* Form */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-5 py-5 space-y-5">
          {/* Customer Data Section */}
          <div>
            <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <User size={12} />
              Dados do Cliente
            </h3>
            <div className="space-y-4">
              <DataFieldInput
                label="Nome Completo"
                value={formData.customerName}
                onChange={updateField("customerName")}
                confidence={extractedData.name.confidence}
                required
                icon={User}
                placeholder="Nome do cliente"
              />
              <DataFieldInput
                label="CPF"
                value={formData.customerCpf}
                onChange={updateField("customerCpf")}
                confidence={extractedData.cpf.confidence}
                required
                icon={Hash}
                placeholder="000.000.000-00"
              />
              <DataFieldInput
                label="E-mail"
                value={formData.customerEmail}
                onChange={updateField("customerEmail")}
                confidence={extractedData.email.confidence}
                icon={Mail}
                placeholder="email@exemplo.com"
              />
              <DataFieldInput
                label="Pedido"
                value={formData.orderId}
                onChange={updateField("orderId")}
                confidence={extractedData.orderId.confidence}
                icon={Package}
                placeholder="Número do pedido (opcional)"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* Ticket Data Section */}
          <div>
            <h3 className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText size={12} />
              Dados do Ticket
            </h3>
            <div className="space-y-4">
              {/* Ticket Number */}
              <div className="space-y-1.5">
                <label className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <Hash size={11} />
                  Número do Ticket
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.ticketNumber}
                    onChange={(e) => updateField("ticketNumber")(e.target.value)}
                    placeholder="SAC-XXXX-XXXX"
                    className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-brand-green)]/50 focus:ring-1 focus:ring-[var(--color-brand-green)]/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => updateField("ticketNumber")(generateTicketNumber())}
                    className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] hover:text-white transition-all"
                  >
                    Gerar
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[var(--text-xs)] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={11} />
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField("description")(e.target.value)}
                  placeholder="Descreva o problema ou solicitação do cliente..."
                  rows={4}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-brand-green)]/50 focus:ring-1 focus:ring-[var(--color-brand-green)]/30 transition-all resize-none"
                />
              </div>

              {/* Status Selector */}
              <StatusSelector value={formData.status} onChange={(status) => setFormData((prev) => ({ ...prev, status }))} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer with Create Button */}
      <div className="px-5 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-deep)]">
        <button
          onClick={handleCreateTicket}
          disabled={isCreating || !formData.customerName || !formData.customerCpf || !formData.description}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-brand-green-dark)] border border-[var(--color-brand-green-dark)] rounded-xl text-sm font-bold text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
        >
          {isCreating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Criando Ticket...</span>
            </>
          ) : (
            <>
              <CheckCheck size={16} />
              <span>Criar Ticket</span>
            </>
          )}
        </button>
        {(!formData.customerName || !formData.customerCpf || !formData.description) && (
          <p className="text-[var(--text-xs)] text-rose-400 text-center mt-2">
            Preencha os campos obrigatórios (*)
          </p>
        )}
      </div>
    </div>
  );
}