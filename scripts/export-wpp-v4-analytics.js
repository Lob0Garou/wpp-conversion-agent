/**
 * EXPORTADOR V4 - ANALYTICS TEMPORAL
 * 
 * Foco em:
 * - Coletar TODOS os chats do WhatsApp
 * - Organizar cronologicamente
 * - Gerar métricas de novos contatos por dia
 * - Identificar picos de atividade
 */

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// CONFIGURAÇÕES
const CONFIG = {
    maxChats: 5000,           // Máximo de chats
    maxMsgsPerChat: 2000,     // Máximo de mensagens por chat
    sessionDir: 'session_export_wpp_v4',
    outputFile: 'wpp-analytics.json',
    csvFile: 'wpp-analytics.csv',
    saveInterval: 10000       // Salvar a cada 10 segundos
};

// ESTADO GLOBAL
const chatMap = new Map();
let processedCount = 0;
let isConnected = false;
let connectionStartTime = null;
let saveTimeout = null;

/**
 * Converte timestamp para data ISO (YYYY-MM-DD)
 */
function timestampToDate(ts) {
    if (typeof ts === 'object' && ts !== null && 'low' in ts) ts = ts.low;
    if (!ts || ts < 0) return null;
    try {
        const date = new Date(ts * 1000);
        return date.toISOString().split('T')[0];
    } catch {
        return null;
    }
}

/**
 * Converte timestamp para datetime legível
 */
function timestampToDateTime(ts) {
    if (typeof ts === 'object' && ts !== null && 'low' in ts) ts = ts.low;
    if (!ts || ts < 0) return null;
    try {
        return new Date(ts * 1000).toLocaleString('pt-BR');
    } catch {
        return null;
    }
}

/**
 * Gera estatísticas por dia
 */
function generateDailyStats(chats) {
    const dailyStats = new Map();

    chats.forEach(chat => {
        // Encontrar todas as datas em que este contato (número) interagiu
        const activeDates = new Set();
        chat.messages.forEach(msg => {
            const date = timestampToDate(msg.timestamp);
            if (date) activeDates.add(date);
        });

        // Para cada dia de atividade, este número conta como 1 contato único
        activeDates.forEach(date => {
            if (!dailyStats.has(date)) {
                dailyStats.set(date, {
                    date,
                    uniqueContacts: 0,
                    newContacts: 0,
                    totalMessages: 0,
                    chats: [] // Lista de nomes/números que iniciaram conversa no dia
                });
            }
            dailyStats.get(date).uniqueContacts++;
        });

        // Primeira mensagem do chat = data de "novo contato" (lead novo)
        if (chat.messages.length > 0) {
            const firstMsg = chat.messages[0];
            const date = timestampToDate(firstMsg.timestamp);
            if (date) {
                const stats = dailyStats.get(date);
                stats.newContacts++;
                stats.chats.push(chat.name);
            }
        }

        // Contar mensagens por dia
        chat.messages.forEach(msg => {
            const date = timestampToDate(msg.timestamp);
            if (date) {
                dailyStats.get(date).totalMessages++;
            }
        });
    });

    // Converter para array e ordenar por data
    return Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Detecta picos de atividade
 */
function detectPeaks(dailyStats) {
    if (dailyStats.length === 0) return [];

    const avgNewContacts = dailyStats.reduce((sum, d) => sum + d.newContacts, 0) / dailyStats.length;
    const avgMessages = dailyStats.reduce((sum, d) => sum + d.totalMessages, 0) / dailyStats.length;

    return dailyStats
        .filter(d => d.newContacts > avgNewContacts * 1.5 || d.totalMessages > avgMessages * 1.5)
        .map(d => ({
            date: d.date,
            type: d.newContacts > avgNewContacts * 1.5 ? 'novos_contatos' : 'mensagens',
            value: d.newContacts > avgNewContacts * 1.5 ? d.newContacts : d.totalMessages
        }));
}

/**
 * Converte para CSV com organização temporal
 */
function convertToCSV(chats) {
    const header = [
        'Data', 'Hora', 'Chat ID', 'Chat Name',
        'Remetente', 'Tipo', 'Mensagem'
    ];

    const rows = [];

    // Coletar todas as mensagens com referência ao chat
    const allMessages = [];
    chats.forEach(chat => {
        chat.messages.forEach(msg => {
            allMessages.push({
                ...msg,
                chatId: chat.chatId,
                chatName: chat.name
            });
        });
    });

    // Ordenar por timestamp
    allMessages.sort((a, b) => {
        const tsA = typeof a.timestamp === 'object' ? a.timestamp.low || 0 : a.timestamp;
        const tsB = typeof b.timestamp === 'object' ? b.timestamp.low || 0 : b.timestamp;
        return tsA - tsB;
    });

    // Gerar linhas
    allMessages.forEach(msg => {
        const date = timestampToDate(msg.timestamp) || '';
        const time = msg.datetime ? msg.datetime.split(' ')[1] : '';

        rows.push([
            date,
            time,
            msg.chatId.split('@')[0],
            (msg.chatName || '').replace(/"/g, '""'),
            msg.fromMe ? 'LOJA' : 'CLIENTE',
            msg.type,
            (msg.body || '').replace(/"/g, '""').replace(/\n/g, ' ')
        ]);
    });

    return [header.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
}

/**
 * Processa uma mensagem
 */
function processMessage(m) {
    if (!m.message) return;

    const chatId = m.key.remoteJid;
    if (!chatId || !chatId.endsWith('@s.whatsapp.net')) return;

    const body = m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        m.message?.videoMessage?.caption || '';

    if (!body && !m.message?.imageMessage && !m.message?.videoMessage) return;

    if (!chatMap.has(chatId)) {
        chatMap.set(chatId, {
            chatId,
            name: m.pushName || chatId.split('@')[0],
            messages: []
        });
    }

    const chat = chatMap.get(chatId);

    // Evitar duplicatas
    if (chat.messages.some(existing => existing.id === m.key.id)) return;

    let ts = m.messageTimestamp;
    if (typeof ts === 'object' && ts !== null && 'low' in ts) ts = ts.low;

    chat.messages.push({
        id: m.key.id,
        fromMe: m.key.fromMe || false,
        timestamp: ts,
        datetime: timestampToDateTime(ts),
        date: timestampToDate(ts),
        body,
        type: Object.keys(m.message || {})[0] || 'unknown'
    });

    processedCount++;
}

/**
 * Salva arquivos com análise completa
 */
const saveFiles = () => {
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        if (chatMap.size === 0) {
            console.log('⚠️ [SKIP] Nenhum dado para salvar ainda...');
            return;
        }

        console.log(`\n💾 [SNAPSHOT] Processando ${chatMap.size} chats e ${processedCount} mensagens...`);

        // Preparar dados
        const exportData = [];

        for (const [id, data] of chatMap.entries()) {
            // Ordenar mensagens por timestamp
            const sortedMsgs = data.messages.sort((a, b) => {
                const tsA = typeof a.timestamp === 'object' ? a.timestamp.low || 0 : a.timestamp;
                const tsB = typeof b.timestamp === 'object' ? b.timestamp.low || 0 : b.timestamp;
                return tsA - tsB;
            }).slice(-CONFIG.maxMsgsPerChat);

            exportData.push({
                chatId: id,
                name: data.name,
                firstContact: sortedMsgs[0]?.date || null,
                lastContact: sortedMsgs[sortedMsgs.length - 1]?.date || null,
                totalMsgs: sortedMsgs.length,
                messages: sortedMsgs
            });
        }

        // Ordenar chats por data do último contato (mais recentes primeiro)
        exportData.sort((a, b) => {
            if (!a.lastContact) return 1;
            if (!b.lastContact) return -1;
            return b.lastContact.localeCompare(a.lastContact);
        });

        // Limitar número de chats
        const finalData = exportData.slice(0, CONFIG.maxChats);

        // Gerar estatísticas
        const dailyStats = generateDailyStats(finalData);
        const peaks = detectPeaks(dailyStats);

        // Calcular métricas gerais
        const metrics = {
            exportDate: new Date().toISOString(),
            totalChats: finalData.length,
            totalMessages: finalData.reduce((sum, c) => sum + c.messages.length, 0),
            dateRange: {
                start: dailyStats[0]?.date || null,
                end: dailyStats[dailyStats.length - 1]?.date || null
            },
            avgNewContactsPerDay: dailyStats.length > 0
                ? (dailyStats.reduce((sum, d) => sum + d.newContacts, 0) / dailyStats.length).toFixed(2)
                : 0,
            avgMessagesPerDay: dailyStats.length > 0
                ? (dailyStats.reduce((sum, d) => sum + d.totalMessages, 0) / dailyStats.length).toFixed(2)
                : 0,
            peakDays: peaks.slice(0, 10)
        };

        // Criar objeto final
        const output = {
            metrics,
            dailyStats,
            chats: finalData
        };

        // Backup
        if (fs.existsSync(CONFIG.outputFile)) {
            const existing = fs.readFileSync(CONFIG.outputFile, 'utf8');
            if (existing && existing !== '{}' && existing.length > 10) {
                fs.writeFileSync(`wpp-analytics-backup-${Date.now()}.json`, existing);
            }
        }

        // Salvar JSON
        fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2));

        // Salvar CSV
        fs.writeFileSync(CONFIG.csvFile, convertToCSV(finalData));

        console.log(`\n✅ ARQUIVOS ATUALIZADOS!`);
        console.log(`   📊 Chats: ${metrics.totalChats}`);
        console.log(`   💬 Mensagens: ${metrics.totalMessages}`);
        console.log(`   📅 Período: ${metrics.dateRange.start} a ${metrics.dateRange.end}`);
        console.log(`   📈 Média novos contatos/dia: ${metrics.avgNewContactsPerDay}`);
        console.log(`   📈 Média mensagens/dia: ${metrics.avgMessagesPerDay}`);

        if (peaks.length > 0) {
            console.log(`   🔥 Picos detectados: ${peaks.length}`);
        }

    }, CONFIG.saveInterval);
};

/**
 * Inicia a exportação
 */
async function startExport() {
    console.log('\n==============================================');
    console.log('📊 EXPORTADOR V4 - ANALYTICS TEMPORAL');
    console.log('==============================================\n');

    if (!fs.existsSync(CONFIG.sessionDir)) {
        fs.mkdirSync(CONFIG.sessionDir, { recursive: true });
    }

    const pino = require('pino');
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`📱 Versão do WhatsApp: v${version.join('.')}`);
    console.log('⏳ Conectando ao WhatsApp...\n');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Centauro Analytics", "Chrome", "4.0"],
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 120000,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false,
        printQRInTerminal: false
    });

    connectionStartTime = Date.now();

    // Heartbeat
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
            console.log('📥 Aguarde o download completo do histórico...');
            console.log('⏳ Isso pode levar vários minutos para contas com muito histórico...\n');
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

    // Eventos de mensagens
    sock.ev.on('messaging-history.set', ({ messages, chats, isLatest }) => {
        if (messages && messages.length > 0) {
            console.log(`\n📥 [BATCH] ${messages.length} mensagens | ${chats?.length || 0} chats | isLatest: ${isLatest}`);
            messages.forEach(processMessage);
            saveFiles();
        }
    });

    sock.ev.on('chats.upsert', (chats) => {
        console.log(`📥 [CHATS] ${chats.length} novos chats detectados`);
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type === 'notify' || type === 'append') {
            messages.forEach(processMessage);
            saveFiles();
        }
    });

    // Handler para SIGINT
    process.on('SIGINT', () => {
        console.log('\n\n⏹️ Interrompido pelo usuário. Salvando dados...');
        saveFiles();
        setTimeout(() => process.exit(0), 3000);
    });
}

// Iniciar
const args = process.argv.slice(2);
if (args.includes('--reset') || args.includes('-r')) {
    if (fs.existsSync(CONFIG.sessionDir)) {
        console.log('🗑️ Removendo sessão antiga...');
        fs.rmSync(CONFIG.sessionDir, { recursive: true, force: true });
    }
    startExport().catch(err => console.error("❌ ERRO:", err));
} else {
    startExport().catch(err => console.error("❌ ERRO FATAL:", err));
}

console.log('\n💡 DICA: Use --reset para forçar novo QR Code');
console.log('   Exemplo: node scripts/export-wpp-v4-analytics.js --reset\n');