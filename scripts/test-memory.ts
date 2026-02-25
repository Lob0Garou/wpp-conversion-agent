import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { summarizeConversation } from "../src/lib/agent/summarizer";
import { messagesStateReducer } from "@langchain/langgraph";

async function main() {
    console.log("Testing Summarizer Compaction Logic directly...");

    // Create 10 dummy messages (1 system, 9 alternating)
    let messages: any[] = [
        new SystemMessage("You are Cadu.")
    ];

    for (let i = 1; i <= 9; i++) {
        if (i % 2 !== 0) {
            messages.push(new HumanMessage({ content: `User message ${i}`, id: `msg_${i}` }));
        } else {
            messages.push(new AIMessage({ content: `AI reply ${i}`, id: `msg_${i}` }));
        }
    }

    console.log(`Initial message count: ${messages.length}`);

    // Call summarizeConversation directly
    const state = {
        messages: messages,
        summary: "",
        storeId: "test-store"
    };

    const result = await summarizeConversation(state);

    console.log("\nSummarizer returned:");
    console.log(`New Summary: "${result.summary}"`);
    console.log(`RemoveMessages emitted: ${result.messages?.length || 0}`);

    if (result.messages) {
        // Simulate messagesStateReducer applying the RemoveMessages
        const nextMessages = messagesStateReducer(messages, result.messages);
        console.log(`\nMessages remaining after reducer: ${nextMessages.length}`);

        // Assert we only kept the system message + last 6
        const expectedCount = 1 + 6; // 1 system + 6 kept
        console.log(`Expected remaining: ${expectedCount}`);

        if (nextMessages.length === expectedCount) {
            console.log("SUCCESS: Compaction logic worked correctly.");
        } else {
            console.log("ERROR: Compaction math is wrong.");
        }
    }
}

main().catch(console.error);
