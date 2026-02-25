export interface AgentRuntimeInput {
    conversationId: string;
    storeId: string;
    message: string;
    // Context passed down from Webhook (e.g if human is locked, etc)
    isHumanLocked?: boolean;
    customerId?: string;
    customerPhone?: string;
}

export interface AgentRuntimeOutput {
    reply: string;
    requiresHuman: boolean;
    // Metadata can include tokens, routing decision, runtime used, etc.
    metadata?: Record<string, unknown>;
}

export interface AgentRuntime {
    generateReply(input: AgentRuntimeInput): Promise<AgentRuntimeOutput>;
}
