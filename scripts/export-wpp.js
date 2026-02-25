const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const pino = require('pino');

// ==========================================
// CONFIGURAÇÕES V2.5 - AGGRESSIVE MODE
// ==========================================
const NUM_CHATS = 1500;
const MSGS_PER_CHAT = 1500;
const KEYWORDS = [
    'troca', 'devolução', 'pedido', 'entrega', 'pix', 'problema', 'atraso',
    'não recebi', 'reclama', 'suporte', 'cancelar', 'reembolso', 'vale-troca',
    'não chegou', 'errado', 'defeito', 'insatisfeito', 'demora', 'compra',
    'ajuda', 'tamanho', 'disponível', 'estoque'
];

// PERSISTÊNCIA GLOBAL
const chatMap = new Map();
let saveTimeout = null;
let processedCount = 0;
let isConnected = false;
let historyReceived = false;

function convertToCSV(chats) {
    const header = ['Chat Name', 'Is Relevant', 'From Me', 'Time', 'Type', 'Message Body'];
    const rows = [];
    chats.forEach(chat => {
        chat.messages.forEach(m => {
            // Handle timestamp that might be an object { low, high, unsigned }
            let ts = m.timestamp;
            if (typeof ts === 'object' && ts !== null && 'low' in ts) {
                ts = ts.low;
            }
            const time = new Date(ts * 1000).toLocaleString('pt-BR');
            rows.push([
                (chat.name || '').replace(/"/g, '""'),
                chat.isRelevant ? 'YES' : 'NO',
                m.fromMe ? 'LOJA' : 'CLIENTE',
                time,
                m.type,
                (m.body || '').replace(/"/g, '""').replace(/\n/g, ' ')
            ]);
        });
    });
    return [
        header.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
}

const saveFiles = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        console.log(`\n💾 [SNAPSHOT] Salvando ${chatMap.size} chats e ${processedCount} mensagens acumuladas...`);
        const exportData = [];
        let totalRelevantes = 0;

        for (const [id, data] of chatMap.entries()) {
            const sortedMsgs = data.messages.sort((a, b) => {
                let tsA = a.timestamp, tsB = b.timestamp;
                if (typeof tsA === 'object') tsA = tsA.low || 0;
                if (typeof tsB === 'object') tsB = tsB.low || 0;
                return tsA - tsB;
            }).slice(-MSGS_PER_CHAT);

            const isRelevant = sortedMsgs.some(m => KEYWORDS.some(kw => (m.body || '').toLowerCase().includes(kw)));
            if (isRelevant) totalRelevantes++;
            exportData.push({ chatId: id, name: data.name, isRelevant, totalMsgs: sortedMsgs.length, messages: sortedMsgs });
        }

        exportData.sort((a, b) => {
            const lastA = a.messages[a.messages.length - 1]?.timestamp || 0;
            const lastB = b.messages[b.messages.length - 1]?.timestamp || 0;
            const tsA = typeof lastA === 'object' ? lastA.low || 0 : lastA;
            const tsB = typeof lastB === 'object' ? lastB.low || 0 : lastB;
            return tsB - tsA;
        });

        const finalData = exportData.slice(0, NUM_CHATS);
        fs.writeFileSync('wpp-export.json', JSON.stringify(finalData, null, 2));
        fs.writeFileSync('wpp-export.csv', convertToCSV(finalData));
        console.log(`✅ ARQUIVOS ATUALIZADOS ÀS ${new Date().toLocaleTimeString()}! (${totalRelevantes} relevantes)`);
    }, 5000);
};

const processMessage = (m) => {
    if (!m.message) return;
    const chatId = m.key.remoteJid;
    if (!chatId || !chatId.endsWith('@s.whatsapp.net')) return;

    const body = m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        m.message?.videoMessage?.caption || "";

    if (!body && !m.message?.imageMessage && !m.message?.videoMessage) return;

    if (!chatMap.has(chatId)) chatMap.set(chatId, { name: chatId.split('@')[0], messages: [] });
    const chat = chatMap.get(chatId);
    if (chat.messages.some(existing => existing.id === m.key.id)) return;

    let ts = m.messageTimestamp;
    if (typeof ts === 'object' && ts !== null && 'low' in ts) {
        ts = ts.low;
    }

    chat.messages.push({
        id: m.key.id,
        fromMe: m.key.fromMe || false,
        timestamp: ts,
        body,
        type: Object.keys(m.message || {})[0] || 'unknown'
    });
    processedCount++;
};

async function startExport() {
    const sessionDir = 'session_export_wpp';
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`\n🚀 EXPORTADOR V2.5 - AGGRESSIVE MODE (v${version.join('.')})`);
    console.log('💡 Iniciando sincronização total. Aguarde o heartbeat para ver o progresso.');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }), // Silent para evitar spam
        browser: ["Centauro Stats", "Chrome", "1.0.0"],
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        connectTimeoutMs: 300000,
        defaultQueryTimeoutMs: 300000,
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: false,
        printQRInTerminal: false
    });

    const heartbeat = setInterval(() => {
        const time = new Date().toLocaleTimeString();
        if (isConnected) {
            console.log(`📡 [${time}] SCRIPT ATIVO | Mapeados: ${chatMap.size} chats | ${processedCount} mensagens acumuladas.`);
        } else {
            console.log(`📡 [${time}] SINCRONIZANDO (Isso pode demorar em contas grandes)...`);
        }
    }, 15000);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📲 QR CODE REQUERIDO (Aponte o celular):');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            isConnected = true;
            console.log('\n✅ CONECTADO! O histórico está sendo baixado em pacotes...');

            // TENTAR BUSCAR CHATS ATIVAMENTE APÓS CONEXÃO
            setTimeout(async () => {
                if (chatMap.size === 0 && !historyReceived) {
                    console.log('🔄 [FORCE] Tentando buscar conversas ativamente...');
                    try {
                        // O Baileys armazena chats no objeto sock.chats
                        if (sock.chats && Object.keys(sock.chats).length > 0) {
                            console.log(`📊 [FORCE] Encontrados ${Object.keys(sock.chats).length} chats no cache local!`);
                            for (const [jid, chat] of Object.entries(sock.chats)) {
                                if (jid.endsWith('@s.whatsapp.net')) {
                                    if (!chatMap.has(jid)) {
                                        chatMap.set(jid, { name: chat.name || jid.split('@')[0], messages: [] });
                                    }
                                }
                            }
                            saveFiles();
                        }
                    } catch (e) {
                        console.log('⚠️ [FORCE] Não foi possível buscar chats ativamente:', e.message);
                    }
                }
            }, 10000);
        }

        if (connection === 'close') {
            isConnected = false;
            clearInterval(heartbeat);
            const error = lastDisconnect?.error;
            const statusCode = (error instanceof Boom) ? error.output?.statusCode : 0;

            console.log(`❌ Conexão fechada (${statusCode}). Erro: ${error?.message}`);

            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconectando em 5 segundos...');
                setTimeout(startExport, 5000);
            } else {
                // Salvar o que temos antes de sair
                console.log('💾 Sessão encerrada. Salvando dados coletados...');
                saveFiles();
            }
        }
    });

    // EVENTO PRINCIPAL: HISTÓRICO
    sock.ev.on('messaging-history.set', ({ messages, chats, isLatest }) => {
        historyReceived = true;
        console.log(`📥 [BATCH] Recebido pacote com ${messages?.length || 0} mensagens e ${chats?.length || 0} chats. isLatest: ${isLatest}`);

        if (messages && messages.length > 0) {
            messages.forEach(processMessage);
        }
        saveFiles();
    });

    // EVENTO: CHATS UPSERT (novo evento para chats)
    sock.ev.on('chats.upsert', (chats) => {
        console.log(`📥 [CHATS] Recebidos ${chats.length} novos chats`);
        chats.forEach(chat => {
            if (chat.id.endsWith('@s.whatsapp.net')) {
                if (!chatMap.has(chat.id)) {
                    chatMap.set(chat.id, { name: chat.name || chat.id.split('@')[0], messages: [] });
                }
            }
        });
        saveFiles();
    });

    // EVENTO: MESSAGES UPSERT
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        console.log(`📨 [UPSERT] ${messages.length} mensagens | tipo: ${type}`);
        if (type === 'notify' || type === 'append') {
            messages.forEach(processMessage);
            saveFiles();
        }
    });

    // EVENTO: MESSAGES UPDATE (edições de mensagens)
    sock.ev.on('messages.update', (updates) => {
        console.log(`✏️ [UPDATE] ${updates.length} atualizações de mensagens`);
    });

    // EVENTO DE DEBUG - capturar qualquer evento
    const originalEmit = sock.ev.emit;
    sock.ev.emit = function (event, ...args) {
        const knownEvents = ['connection.update', 'creds.update', 'messaging-history.set', 'messages.upsert', 'chats.upsert', 'messages.update'];
        if (!knownEvents.includes(event)) {
            console.log(`🔍 [DEBUG] Evento: ${event}`, JSON.stringify(args).substring(0, 200));
        }
        return originalEmit.apply(this, [event, ...args]);
    };
}

console.log('==============================================');
console.log('EXPORTADOR V2.5 - AGGRESSIVE MODE');
console.log('INSTRUÇÃO: Use CMD ou Git Bash se o PowerShell der erro.');
console.log('Aguarde os logs de [BATCH] para ver o progresso.');
console.log('==============================================');

startExport().catch(err => console.error("❌ ERRO FATAL:", err));