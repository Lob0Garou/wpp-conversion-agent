const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const NUM_CHATS = 1500;
const MSGS_PER_CHAT = 1500;
const KEYWORDS = [
    'troca', 'devolução', 'pedido', 'entrega', 'pix', 'problema', 'atraso',
    'não recebi', 'reclama', 'suporte', 'cancelar', 'reembolso', 'vale-troca',
    'não chegou', 'errado', 'defeito', 'insatisfeito', 'demora', 'compra',
    'ajuda', 'tamanho', 'disponível', 'estoque'
];

const chatMap = new Map();
let saveTimeout = null;
let processedCount = 0;
let isConnected = false;
let connectionStartTime = null;

const OUTPUT_JSON = 'wpp-export.json';
const OUTPUT_CSV = 'wpp-export.csv';
const SESSION_DIR = 'session_export_wpp';

function convertToCSV(chats) {
    const header = ['Chat Name', 'Is Relevant', 'From Me', 'Time', 'Type', 'Message Body'];
    const rows = [];
    chats.forEach(chat => {
        chat.messages.forEach(m => {
            let ts = m.timestamp;
            if (typeof ts === 'object' && ts !== null && 'low' in ts) ts = ts.low;
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
    return [header.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
}

const saveFiles = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (chatMap.size === 0) {
            console.log('⚠️ [SKIP] Nenhum dado para salvar ainda...');
            return;
        }
        console.log(`\n💾 [SNAPSHOT] Salvando ${chatMap.size} chats e ${processedCount} mensagens...`);
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

        if (fs.existsSync(OUTPUT_JSON)) {
            const existing = fs.readFileSync(OUTPUT_JSON, 'utf8');
            if (existing && existing !== '[]' && existing.length > 10) {
                fs.writeFileSync(`wpp-export-backup-${Date.now()}.json`, existing);
            }
        }

        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalData, null, 2));
        fs.writeFileSync(OUTPUT_CSV, convertToCSV(finalData));
        console.log(`✅ ARQUIVOS ATUALIZADOS! (${totalRelevantes} relevantes)`);
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
    if (typeof ts === 'object' && ts !== null && 'low' in ts) ts = ts.low;

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
    console.log('\n==============================================');
    console.log('🚀 EXPORTADOR V3 - ULTRA ROBUSTO');
    console.log('==============================================\n');

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const pino = require('pino');
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`📱 Versão do WhatsApp: v${version.join('.')}`);
    console.log('⏳ Conectando ao WhatsApp...\n');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Centauro Export", "Chrome", "3.0"],
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false,
        printQRInTerminal: false
    });

    connectionStartTime = Date.now();

    const heartbeat = setInterval(() => {
        const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000);
        const time = new Date().toLocaleTimeString();
        if (isConnected) {
            console.log(`📡 [${time}] ${elapsed}s | Chats: ${chatMap.size} | Mensagens: ${processedCount}`);
        } else {
            console.log(`📡 [${time}] Aguardando conexão... (${elapsed}s)`);
        }
    }, 20000);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n╔══════════════════════════════════════════╗');
            console.log('║  📲 ESCANEIE O QR CODE COM O CELULAR     ║');
            console.log('╚══════════════════════════════════════════╝\n');
            qrcode.generate(qr, { small: true });
            console.log('\n💡 Abra o WhatsApp no celular > Dispositivos conectados > Escanear\n');
        }

        if (connection === 'open') {
            isConnected = true;
            console.log('\n✅ CONECTADO COM SUCESSO!');
            console.log('📥 Aguarde o download do histórico...\n');
        }

        if (connection === 'close') {
            isConnected = false;
            const error = lastDisconnect?.error;
            const statusCode = (error instanceof Boom) ? error.output?.statusCode : 0;

            console.log(`\n❌ Conexão encerrada (${statusCode}): ${error?.message || 'Desconhecido'}`);

            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                clearInterval(heartbeat);
                console.log('🔒 Sessão expirada. Salvando dados coletados...');
                saveFiles();
                console.log('\n🔄 Execute novamente para gerar novo QR Code.\n');
                process.exit(0);
            } else if (statusCode === DisconnectReason.connectionClosed || statusCode === 440) {
                console.log('⚠️ Conflito detectado. Você tem o WhatsApp Web aberto?');
                console.log('🔄 Reconectando em 10 segundos...');
                clearInterval(heartbeat);
                setTimeout(startExport, 10000);
            } else {
                console.log('🔄 Reconectando em 5 segundos...');
                clearInterval(heartbeat);
                setTimeout(startExport, 5000);
            }
        }
    });

    sock.ev.on('messaging-history.set', ({ messages, chats, isLatest }) => {
        console.log(`\n📥 [BATCH] ${messages?.length || 0} mensagens | ${chats?.length || 0} chats | isLatest: ${isLatest}`);
        if (messages && messages.length > 0) messages.forEach(processMessage);
        saveFiles();
    });

    sock.ev.on('chats.upsert', (chats) => {
        console.log(`📥 [CHATS] ${chats.length} novos chats detectados`);
        chats.forEach(chat => {
            if (chat.id.endsWith('@s.whatsapp.net')) {
                if (!chatMap.has(chat.id)) {
                    chatMap.set(chat.id, { name: chat.name || chat.id.split('@')[0], messages: [] });
                }
            }
        });
        saveFiles();
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type === 'notify' || type === 'append') {
            messages.forEach(processMessage);
            saveFiles();
        }
    });

    process.on('SIGINT', () => {
        console.log('\n\n⏹️ Interrompido pelo usuário. Salvando dados...');
        saveFiles();
        setTimeout(() => process.exit(0), 2000);
    });
}

const args = process.argv.slice(2);
if (args.includes('--reset') || args.includes('-r')) {
    if (fs.existsSync(SESSION_DIR)) {
        console.log('🗑️ Removendo sessão antiga...');
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    startExport().catch(err => console.error("❌ ERRO:", err));
} else {
    startExport().catch(err => console.error("❌ ERRO FATAL:", err));
}

console.log('\n💡 DICA: Use --reset para forçar novo QR Code');
console.log('   Exemplo: node scripts/export-wpp-v3.js --reset\n');