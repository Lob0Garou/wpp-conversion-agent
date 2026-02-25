# UI Architecture: Sales Console

## Overview

The Admin Sales Console is designed as a high-performance, single-screen interface for managing WhatsApp sales conversations. It follows a **3-Column "Mail Client" Layout** optimized for speed and context.

## Component Hierarchy

### 1. Left Column: Queue & Navigation

**File:** `src/components/admin/ConversationQueue.tsx`

- **Purpose:** Triage and selection.
- **Key Features:**
  - **Sticky Stats Header:** Real-time counters for "Active" vs "Waiting".
  - **Priority Segmentation:** Urgency-based sorting. Conversations needing human attention (`PENDING_HUMAN`) are visually separated and pinned to the top of the "SAC" tab.
  - **Visual Cards (`ConversationCard.tsx`):**
    - **Semantic Borders:** Green (Sales), Amber (Support), Rose (Urgent).
    - **Freshness Pulse:** Animated dot for messages < 2 minutes old.

### 2. Center Column: Hybrid Timeline

**File:** `src/components/admin/ChatTimeline.tsx`

- **Purpose:** The conversation history, enriched with system "thoughts".
- **Concept:** A "Hybrid Timeline" that merges human/customer messages with invisible system actions.
- **Key Components:**
  - **`AgentBubble.tsx`:** Differentiates between:
    - `ai_sales` (Green): The Sales Bot (Cadu).
    - `ai_support` (Indigo): The Support Bot/SAC.
    - `manual` (Violet): A human operator.
  - **`SystemLogCard.tsx`:** A terminal-style log entry that visualizes backend actions (e.g., Stock Checks, Handoffs) without cluttering the chat flow.
  - **`parseTimeline.ts`:**
    - **Logic:** This utility parses the raw message stream. It looks for specific metadata or patterns to inject "virtual" log items into the timeline array before rendering so the UI can render a linear sequence of events.

### 3. Right Column: Context & Tactics

**File:** `src/components/admin/CustomerContext.tsx`

- **Purpose:** Radar for sales intent and actionable context.
- **Key Components:**
  - **`AgentStatusPanel.tsx`:** Top-level indicator of the active agent state (Sales vs Stock vs SAC).
  - **`LiveCart.tsx`:**
    - **Premium Slots:** Visual badges for extracted entities (Brand, Size, Category).
    - **Frustration Gradient:** Visual representation of customer stress.
    - **Buying Signal:** Heuristic-based badge (Fire/Search/Shield) indicating lead warmth.
  - **`QuickActions.tsx`:** One-click tactical buttons (Assume Control, Generate Pix, Close).

## Critical Implementation Detail: "Degraded Mode"

> [!WARNING]
> **API Limitation & Frontier Logic**
> Currently, the backend API does **not** persist precise slot/intent/frustration state in a dedicated table for every message. To avoid blocking the UI redesign on backend migrations, the frontend operates in **"Degraded Mode"**.

### How it works

1. **Inference on Read:** The `CustomerContext` and `LiveCart` components do not read from a `CustomerProfile` table. Instead, they scan the loaded message history (`Recoil`/`props`) in real-time using `inferSlotsFromMessages` (in `parseTimeline.ts`).
2. **Regex Extraction:** Slots like "Nike", "42", "Tênis" are extracted via Regex from the *text content* of previous messages on the client-side.
3. **Volatility:** This means context can be "lost" if the message history is truncated or not fully loaded.

### Future Roadmap (Backend Requirements)

To exit "Degraded Mode" and reach full stability, the following props must eventually be sourced from the Database:

- `customer.frustration_score` (Float)
- `conversation.intent` (Enum)
- `conversation.extracted_slots` (JSONB)
- `stock_logs` (should be a real relation, not parsed from text)
