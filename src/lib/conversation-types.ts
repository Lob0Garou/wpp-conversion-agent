export type Intent =
    | "SALES"
    | "SUPPORT"
    | "HANDOFF"
    | "OBJECTION"
    | "CLARIFICATION"
    | "INFO"
    | "INFO_HOURS"
    | "INFO_ADDRESS"
    | "INFO_PICKUP_POLICY"
    | "INFO_SAC_POLICY"
    | "SAC_TROCA"
    | "SAC_ATRASO"
    | "SAC_RETIRADA"
    | "SAC_REEMBOLSO"
    | "RESERVATION"
    | "CLOSING_SALE";

export type ConversationStateType =
    | "greeting"
    | "discovery"
    | "proposal"
    | "objection"
    | "closing"
    | "post_sale"
    | "support"
    | "support_sac";

export interface Slots {
    [key: string]: string | undefined;
    usage?: string;
    goal?: string;
    size?: string;
    product?: string;
    orderId?: string;
    cpf?: string;
    motivoTroca?: string;
    dataEntrega?: string;
    statusPedido?: string;
    email?: string;
    customerName?: string;
    infoTopic?: string;
    // Telemetry fields (normalized: lowercase, NFD accent-stripped, spaces→_)
    marca?: string;     // ex: "nike" | "new_balance"
    categoria?: string; // ex: "tenis" | "chuteira" | "sandalia" | "mochila" | "vestuario"
    genero?: string;    // ex: "masculino" | "feminino" | "unissex" | "infantil"
    // SAC context
    canalVenda?: string; // "loja_fisica" | "site_app" - para diferenciar requisitos de dados
}

export interface ConversationState {
    currentState: ConversationStateType;
    slots: Slots;
    messageCount: number;
    stallCount: number;
    lastQuestionType: string | null;
    frustrationLevel: number;
    // Human Loop fields
    botStatus: 'BOT' | 'HUMAN';
    handoffUntil: Date | null;
    alertSent: {
        type: 'SALE' | 'SAC';
        sentAt: Date;
        messageId: string;
        groupId: string;
    } | null;
}
