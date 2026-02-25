import { AgentRuntime, AgentRuntimeInput, AgentRuntimeOutput } from "./types";
import { orchestrate } from "../orchestrator";
import { ConversationContext } from "../types";
import { ConversationStateType } from "../state-manager";

export class LegacyAgentRuntime implements AgentRuntime {
    async generateReply(input: AgentRuntimeInput): Promise<AgentRuntimeOutput> {
        // Build a mock/partial ConversationContext based on what orchestrator expects.
        // In reality, the webhook will build the full context and we might need to adjust
        // the interface later, but this serves as the adapter.

        // For the legacy runtime, the webhook still does the heavy lifting of context building.
        // We will adapt the signature in the webhook integration phase.
        throw new Error("LegacyAgentRuntime should be implemented in the webhook integration phase to accept full ConversationContext");
    }
}
