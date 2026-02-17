# 🧪 Testing Guide — Inbound Pipeline & WSL2 Fixes

**Target**: Verify all 11 fixes work correctly in sequence

---

## Pre-Test Setup

1. **Ensure `.env` has valid credentials**:
   ```bash
   NGROK_AUTHTOKEN=your_token_here
   OPENROUTER_API_KEY=your_key_here
   WHATSAPP_API_TOKEN=your_token_here
   WHATSAPP_PHONE_NUMBER_ID=your_phone_id_here
   ```

2. **Verify ports are free**:
   ```bash
   lsof -i :4040  # Ngrok API port (should be free)
   lsof -i :8080  # Dev server port (should be free)
   ```

3. **Clean up old processes** (if needed):
   ```bash
   pkill -f "ngrok|tunnel"
   npx kill-port 4040 8080
   ```

---

## Test 1: Build Verification ✅

**Command**:
```bash
npx next build
```

**Expected Result**:
```
✓ Compiled successfully
✓ Zero TypeScript errors
✓ No "Permission denied (os error 13)" errors
```

**What it validates**:
- Turbopack disabled correctly (experimental.turbopack: false)
- No type mismatches in modified code
- next.config.ts syntax correct

---

## Test 2: Dev Tunnel Startup 🚀

**Command**:
```bash
npm run dev:tunnel
```

**Expected Output Sequence** (timing <5 seconds):

```
🔪 Limpeza agressiva de processos Ngrok...
   ✓ Porta 4040 limpa
   ✓ Porta 8080 limpa
   ✓ Processos Ngrok/Tunnel terminados
✅ Limpeza completa concluída

🚀 Iniciando servidor de desenvolvimento na porta 8080...

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   ✅ NGROK TUNNEL ATIVO!                                     │
│                                                              │
│   Public URL: https://xyz-123.ngrok.io                      │
│   Local:      http://localhost:8080                         │
│                                                              │
│   👉 Cole a URL acima na Meta para Webhooks.                │
│      Ex: https://xyz-123.ngrok.io/api/webhook              │
│                                                              │
└──────────────────────────────────────────────────────────────┘

⬇️ LOGS DO SERVIDOR E WEBHOOK ABAIXO ⬇️
```

**What it validates**:
- cleanNgrokCompletely() function executes (cleanup messages visible)
- 2s delay works (cleanup visible before server start)
- Next.js dev server starts without "permission denied" errors
- Ngrok tunnel connects successfully
- Public URL displayed in green box

**Common Issues & Fixes**:
| Issue | Cause | Fix |
|-------|-------|-----|
| Hangs during cleanup | Old processes still running | Wait a bit, try again |
| "Ngrok connection failed" | Invalid token | Check NGROK_AUTHTOKEN |
| "Permission denied (os error 13)" | Turbopack still enabled | Verify next.config.ts has experimental.turbopack: false |
| Port already in use | Process from previous run | Run: npx kill-port 4040 8080 |

---

## Test 3: Port Verification Log 📋

**Visible in Console**:
```
[WEBHOOK] 🚀 Module loaded. Dev server runs on port 3001 — ensure ngrok targets the correct port.
```

**What it validates**:
- route.ts module loads correctly
- Startup log message is printed (good reminder for ngrok config)

---

## Test 4: Clean Restart (Zombie Cleanup) 🔄

**Steps**:
1. Let tunnel run for 10 seconds
2. Press `Ctrl+C` to stop
3. Immediately run `npm run dev:tunnel` again
4. Repeat 3 times total

**Expected Behavior**:
- Each start shows cleanup messages
- No "tunnel already exists" errors
- No hanging processes left behind
- Clean restart every time

**What it validates**:
- cleanNgrokCompletely() fully kills old processes
- OS port reclamation works
- Ngrok .kill() cleanup effective

---

## Test 5: Text Message Flow ✅

**Steps**:
1. Keep tunnel running
2. Send message from WhatsApp: `"oi"` or `"olá"`
3. Check console for logs
4. Check webhook.log file for entries

**Expected Console Output**:
```
[WEBHOOK] 📨 Message received — type: text, from: 55XXXXXXXXXXXX, wamid: wamid_xxxxx
[WEBHOOK] 📥 Mensagem recebida de 55XXXXXXXXXXXX: "oi"
[WEBHOOK] ✅ Mensagem salva: "oi" de 55XXXXXXXXXXXX
[WEBHOOK] 📋 Slots atualizados: {...}
[WEBHOOK] 🧠 Chamando IA (estado: greeting, intent: SALES)
[WEBHOOK] 🧠 Decisão: {"intent":"SALES","reply_text":"...","requires_human":false}
[WEBHOOK] ✅ Resposta enviada (estado: greeting)
```

**Expected webhook.log entries**:
```
[2026-02-17T...] WEBHOOK MSG RCVD: {"phoneNumberId":"...","from":"55XXXXXXXXXXXX","waMessageId":"...","text":"oi","timestamp":"..."}
[2026-02-17T...] Store lookup for XXX: FOUND
[2026-02-17T...] Conversation: FOUND
[2026-02-17T...] Message saved: oi
...
```

**What it validates**:
- Full state-driven pipeline executes
- Message saved to DB correctly
- LLM call succeeds
- Response sent back to user

---

## Test 6: Non-Text Message Filtering 🖼️

**Steps**:
1. Send an **image** from WhatsApp
2. Send an **audio** message
3. Send a **sticker**
4. Check console

**Expected Console Output**:
```
[WEBHOOK] 📨 Message received — type: image, from: 55XXXXXXXXXXXX, wamid: wamid_xxxxx
[WEBHOOK] ⏭️ Ignored non-text message type: image
[WEBHOOK] ℹ️ Evento ignorado (não é mensagem de texto)
```

**Expected Behavior**:
- NO LLM call
- NO message saved to DB
- NO reply sent to WhatsApp
- Message logged as ignored (visibility for debugging)

**What it validates**:
- extractMessage() correctly filters non-text
- Message type detection works
- Silent failures eliminated (visible logs)

---

## Test 7: Webhook.log Verification 📝

**Check file**:
```bash
tail -f webhook.log
# or on Windows:
Get-Content webhook.log -Tail 20
```

**Expected**:
- One entry per message received
- Timestamps visible
- Step-by-step processing logged (STEP 1, 2, 3...)
- Error messages clearly marked with [ERROR]

**What it validates**:
- debugLog() helper works
- File logging persists
- fs scoping fixed (no crashes)

---

## Test 8: Meta API Timeout (Optional) ⏱️

**Simulate slow/dead Meta API**:
1. Modify env temporarily: `WHATSAPP_API_TOKEN=invalid_token_123`
2. Send text message from WhatsApp
3. Watch for timeout message

**Expected**:
```
[WHATSAPP] ❌ Request timeout (10s) sending message to: 55XXXXXXXXXXXX
[WHATSAPP] 📤 Resultado envio: success=false, http=0, error=Request timeout (10s)
```

**Timing**: Should timeout after ~10s (not hang indefinitely)

**What it validates**:
- AbortController timeout works
- 10s limit enforced
- Graceful failure handling

**Restore after test**:
```bash
# Put correct token back in .env
WHATSAPP_API_TOKEN=your_real_token
```

---

## Test 9: Frustration Detection (With History) 🎯

**Steps**:
1. Send: `"oi"`
2. Send: `"oi!!!"` (aggressive punctuation)
3. Send: `"OI????"` (caps + punctuation)
4. Send: `"oi"` (same message repeated)

**Expected Behavior**:
- Steps 2-4 trigger frustration detection
- console shows: `[WEBHOOK] 😤 Frustração detectada (nível 1/2/3)`
- At level 3, auto-escalate to support state
- NO redundant DB query for history (using context.conversationHistory)

**What it validates**:
- Frustration detection works
- Context history reused (no double query)
- State transition triggered on frustration

---

## Test 10: DB Query Efficiency (Optional) 🔍

**Monitor with database client** (e.g., pgAdmin, DBeaver):
1. Enable slow query logging on PostgreSQL
2. Send 5 text messages
3. Check query logs

**Expected**:
- ~1 query per message for conversation history (in buildContext)
- NOT 2 queries (fixed redundancy)
- No "getConversationHistory" function calls visible

**What it validates**:
- Redundant query eliminated
- Performance improvement realized

---

## Test 11: Full End-to-End Conversation 💬

**Steps**:
1. Send: `"oi, quero um tênis"` (greeting + intent)
2. Send: `"pra correr"` (usage intent)
3. Send: `"tamanho 42"` (size)
4. Send: `"qual você recomenda?"` (product request)

**Expected State Transitions**:
```
greeting → discovery → discovery → discovery → proposal
```

**Expected Behavior**:
- Slots populated: usage: "running", size: "42"
- State advances automatically
- Bot recommends product
- User can confirm or counter-offer

**What it validates**:
- Full state machine works
- Slot extraction works
- Context builder assembles data correctly
- Guardrails validate AI output
- State transitions trigger

---

## Troubleshooting Checklist ✅

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| `npm run dev:tunnel` hangs | Old ngrok process alive | `pkill -f ngrok` + wait 2s |
| "tunnel already exists" | Cleanup incomplete | Check if ports 4040/8080 free |
| "Permission denied (os error 13)" | Turbopack enabled | Verify `experimental.turbopack: false` in next.config.ts |
| Non-text messages processed | extractMessage() not filtering | Verify webhook.ts has type check |
| No console logs | debugLog() failing | Check webhook.log file |
| LLM call hangs | Meta API slow | Normal (10s timeout) or auth issue |
| DB errors | Prisma schema issue | Run `npx prisma migrate dev` |

---

## Success Criteria ✨

All tests pass when:
- ✅ Build: Zero TypeScript errors
- ✅ Tunnel: Starts in <5s, shows green box
- ✅ Text messages: Full pipeline executes
- ✅ Non-text: Logged but NOT processed
- ✅ Logs: Clear console + webhook.log entries
- ✅ Restart: Clean without zombie processes
- ✅ History: Single query per message (not double)
- ✅ Errors: Graceful with clear messages

---

## Next Steps 🚀

Once all tests pass:
1. **Deploy** to staging environment
2. **Monitor** webhook.log for production issues
3. **Track** message processing latency
4. **Re-enable** Turbopack when Next.js 16.1.7+ available
5. **Document** any edge cases found

---

**Test Date**: ___________
**Tester**: ___________
**Status**: ☐ All Pass  ☐ Some Issues  ☐ Major Blockers
