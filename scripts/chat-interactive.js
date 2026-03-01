const http = require('http');
const readline = require('readline');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

// ==============================================================================
// 📄 DOCUMENTAÇÃO DE .ENV LOADING:
// 1. O Next.js (via `dev-sandbox-chat.js`) carrega EXCLUSIVAMENTE `.env.sandbox`.
// 2. Este script (`chat-interactive.js`) tenta carregar `.env.sandbox` PRIMEIRO, 
//    e usa `.env` como FALLBACK para chaves que faltam.
// 
// Isso garante que segredos (como WHATSAPP_APP_SECRET) e configurações 
// batam perfeitamente entre os dois processos durante o desenvolvimento.
// DATABASE_URL carregado aqui é irrelevante, pois CHAT_ONLY ignora o db.
// ==============================================================================
const envPaths = [
    path.resolve(__dirname, '../.env.sandbox'),
    path.resolve(__dirname, '../.env')
];
const env = {};

envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach(line => {
            const t = line.trim();
            if (!t || t.startsWith('#')) return;
            const idx = t.indexOf('=');
            if (idx === -1) return;
            const key = t.slice(0, idx).trim();
            const val = t.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
            // Only set if not already set (maintain sandbox priority)
            if (!env[key]) env[key] = val;
        });
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32mCliente>\x1b[0m '
});

let CUSTOMER_PHONE = env.SIM_CUSTOMER_PHONE || generateFreshPhone();
const WEBHOOK_URL = 'http://localhost:8081/api/webhook';
const APP_SECRET = env.WHATSAPP_APP_SECRET || '';
const API_BASE = 'http://localhost:8081';

let lastSeenOutboundSignature = null;
const CADU_REPLY_TIMEOUT_MS = parseInt(env.CADU_REPLY_TIMEOUT_MS || '45000', 10);
const CADU_REPLY_POLL_MS = parseInt(env.CADU_REPLY_POLL_MS || '1000', 10);

function httpGetJson(urlString) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method: 'GET',
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`GET ${url.pathname} failed: ${res.statusCode}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Invalid JSON from ${url.pathname}: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function getReplyProbe() {
    return httpGetJson(
        `${API_BASE}/api/test/last-reply?phone=${encodeURIComponent(CUSTOMER_PHONE)}`
    );
}

async function getLatestCaduReply() {
    const payload = await getReplyProbe();
    if (!payload?.found || !payload.reply) return null;
    const reply = payload.reply;
    const signature = `${reply.conversationId}:${reply.id}:${reply.timestamp}`;
    return {
        conversationId: reply.conversationId,
        signature,
        content: reply.content,
        timestamp: reply.timestamp,
    };
}

function generateFreshPhone() {
    const suffix = Math.floor(Math.random() * 90000000 + 10000000).toString();
    return `5585${suffix}`;
}

async function waitForCaduReply(timeoutMs = CADU_REPLY_TIMEOUT_MS) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const probe = await getReplyProbe();
            const isHumanPending = Boolean(
                probe?.conversation && (
                    probe.conversation.status === 'PENDING_HUMAN' ||
                    probe.conversation.status === 'HUMAN' ||
                    probe.conversation.botStatus === 'HUMAN' ||
                    probe.conversation.botStatus === 'PENDING_HUMAN'
                )
            );

            if (probe?.found && probe.reply) {
                const reply = {
                    conversationId: probe.reply.conversationId,
                    signature: `${probe.reply.conversationId}:${probe.reply.id}:${probe.reply.timestamp}`,
                    content: probe.reply.content,
                    timestamp: probe.reply.timestamp,
                };
                if (reply.signature !== lastSeenOutboundSignature) {
                    lastSeenOutboundSignature = reply.signature;
                    return reply;
                }
            }

            if (
                isHumanPending
            ) {
                return {
                    blocked: true,
                    reason: 'human_pending',
                    conversationId: probe.conversation.id,
                };
            }
            if (!probe?.found || !probe.reply) {
                await new Promise(r => setTimeout(r, CADU_REPLY_POLL_MS));
                continue;
            }
        } catch {
            // API may still be compiling; keep polling
        }
        await new Promise(r => setTimeout(r, CADU_REPLY_POLL_MS));
    }
    return null;
}

function sendMessage(text) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            object: "whatsapp_business_account",
            entry: [
                {
                    id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
                    changes: [
                        {
                            value: {
                                messaging_product: "whatsapp",
                                metadata: {
                                    display_phone_number: "15555555555",
                                    phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || "mock_sandbox_phone_number_id"
                                },
                                contacts: [{ profile: { name: "Manual Tester" }, wa_id: CUSTOMER_PHONE }],
                                messages: [
                                    {
                                        from: CUSTOMER_PHONE,
                                        id: "wamid.MANUAL" + Date.now(),
                                        timestamp: Math.floor(Date.now() / 1000).toString(),
                                        text: { body: text },
                                        type: "text"
                                    }
                                ]
                            },
                            field: "messages"
                        }
                    ]
                }
            ]
        });

        const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
        };

        if (APP_SECRET) {
            const signature = crypto
                .createHmac("sha256", APP_SECRET)
                .update(payload)
                .digest("hex");
            headers["x-hub-signature-256"] = `sha256=${signature}`;
        }

        const options = {
            hostname: 'localhost',
            port: 8081,
            path: '/api/webhook',
            method: 'POST',
            headers: headers
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('\x1b[90m[DEBUG] Mensagem entregue ao webhook. Aguardando processamento do Cadu...\x1b[0m');
                    try {
                        const parsed = data ? JSON.parse(data) : {};
                        resolve({
                            ok: true,
                            immediateReply: parsed?.replyText || parsed?.response || null,
                            raw: parsed
                        });
                    } catch {
                        resolve({ ok: true, immediateReply: null, raw: null });
                    }
                    return;
                }

                console.error(`\x1b[31m??? Erro ao enviar para o webhook (Status ${res.statusCode}):\x1b[0m`, data);
                resolve({
                    ok: false,
                    immediateReply: null,
                    raw: data
                });
            });
        });

        req.on('error', (e) => {
            console.error(`\x1b[31mErro de conexao:\x1b[0m ${e.message}`);
            resolve({
                ok: false,
                immediateReply: null,
                raw: null
            });
        });

        req.write(payload);
        req.end();
    });
}

console.log('\x1b[36m╔══════════════════════════════════════════════════════════╗\x1b[0m');
console.log('\x1b[36m║         🤖 CADU - SIMULADOR DE CHAT MANUAL 🤖            ║\x1b[0m');
console.log('\x1b[36m╚══════════════════════════════════════════════════════════╝\x1b[0m');
console.log('Digite sua mensagem e pressione Enter. Digite "sair" para encerrar.');
console.log('Comandos: "sair", "/novo" (gera novo telefone/zera contexto), "/clear" (alias de /novo), "/phone" (mostra telefone atual)');
console.log(`Telefone atual do simulador: ${CUSTOMER_PHONE}${env.SIM_CUSTOMER_PHONE ? ' (fixo por env)' : ' (novo por sessao)'}`);
console.log('------------------------------------------------------------');
rl.prompt();

// ==============================================================================
// 📄 SESSION LOGGING PARA CALIBRAÇÃO (SPRINT 3.4)
// ==============================================================================
function getSessionLogPath() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dir = path.resolve(__dirname, '../../ralph/input/chat_sessions', `${yyyy}-${mm}-${dd}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `session_${CUSTOMER_PHONE}.jsonl`);
}

function logTurn(role, text) {
    if (!text) return;
    const logPath = getSessionLogPath();
    const entry = {
        sessionId: CUSTOMER_PHONE,
        phone: CUSTOMER_PHONE,
        ts: new Date().toISOString(),
        role,
        text
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

function isCalibrationNote(text) {
    const trimmed = (text || '').trim();
    if (trimmed.length < 3) return false;
    const startsWithNoteOpen =
        trimmed.startsWith('(') ||
        trimmed.startsWith('（') ||
        trimmed.startsWith('[');
    const endsWithNoteClose =
        trimmed.endsWith(')') ||
        trimmed.endsWith('）') ||
        trimmed.endsWith(']');
    return startsWithNoteOpen && endsWithNoteClose;
}

rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
        rl.prompt();
        return;
    }
    if (text.toLowerCase() === 'sair') {
        rl.close();
        return;
    }
    if (text.toLowerCase() === '/novo' || text.toLowerCase() === '/clear') {
        CUSTOMER_PHONE = generateFreshPhone();
        lastSeenOutboundSignature = null;
        console.log(`\x1b[36m[SIM]\x1b[0m Novo telefone de teste: ${CUSTOMER_PHONE}`);
        rl.prompt();
        return;
    }
    if (text.toLowerCase() === '/phone') {
        console.log(`\x1b[36m[SIM]\x1b[0m Telefone atual: ${CUSTOMER_PHONE}`);
        rl.prompt();
        return;
    }

    if (isCalibrationNote(text)) {
        console.log('\x1b[90m[NOTE] Mensagem de calibração local. Nada foi enviado ao webhook.\x1b[0m');
        logTurn('note', text);
        rl.prompt();
        return;
    }

    logTurn('user', text);
    try {
        const previous = await getLatestCaduReply().catch(() => null);
        lastSeenOutboundSignature = previous?.signature || lastSeenOutboundSignature;
    } catch { }

    const sendResult = await sendMessage(text);

    if (sendResult?.immediateReply) {
        console.log(`\x1b[36mCadu>\x1b[0m ${sendResult.immediateReply}`);
        logTurn('assistant', sendResult.immediateReply);
        rl.prompt();
        return;
    }

    const caduReply = await waitForCaduReply();
    if (caduReply?.blocked && caduReply.reason === 'human_pending') {
        console.log(`\x1b[33m[WARN]\x1b[0m Conversa em humano pendente para ${CUSTOMER_PHONE}. Use "/novo" para iniciar contexto limpo.`);
        logTurn('assistant', '[ESCALATION TRIGGERED]');
    } else if (caduReply) {
        console.log(`\x1b[36mCadu>\x1b[0m ${caduReply.content}`);
        logTurn('assistant', caduReply.content);
    } else {
        console.log(`\x1b[33m[WARN] Sem resposta do Cadu em ${Math.round(CADU_REPLY_TIMEOUT_MS / 1000)}s (telefone ${CUSTOMER_PHONE}). Veja o terminal do sandbox/log.\x1b[0m`);
    }
    rl.prompt();
});

rl.on('close', () => {
    console.log('\n\x1b[33mEncerrando simulação. Até logo!\x1b[0m');
    process.exit(0);
});
