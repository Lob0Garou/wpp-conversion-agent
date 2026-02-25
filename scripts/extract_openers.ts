/**
 * Extract Openers Script
 *
 * Extrai openers (mensagens iniciais) de conversas reais do dataset.
 * Gera arquivo data/real_openers.json com openers classificados por intent.
 *
 * Uso: npx tsx scripts/extract_openers.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ConversationLine {
    conversation_id: string;
    turn_index: number;
    role: 'agent' | 'client';
    text: string;
    timestamp: string;
    meta: {
        message_type: string;
        chat_name: string;
    };
}

interface Opener {
    text: string;
    conversation_id: string;
    intent: string;
    turn_index: number;
}

/**
 * Keywords para classificar intent
 */
const INTENT_KEYWORDS: Record<string, string[]> = {
    SALES: [
        'tem', 'vende', 'quanto', 'preço', 'valor', 'tamanho', 'número',
        'tenis', 'chuteira', 'bola', 'luva', 'roupa', 'camisa', 'short',
        'tem?', 'vocês tem', 'vcs tem', 'qual o preço', 'quanto custa',
        'tenis?', 'nike', 'adidas', 'puma', 'new balance', 'asics',
        'pra usar', 'pra correr', 'pra jogar', 'pra academia',
    ],
    SAC_TROCA: [
        'trocar', 'troca', 'devolver', 'devolução', 'trocado', 'trocada',
        'ficou pequeno', 'ficou grande', 'não gostei', 'não serve',
        'quero trocar', 'queria trocar', 'como faço pra trocar',
        'farei a troca', 'fazer a troca', 'trocar por',
    ],
    SAC_ATRASO: [
        'atraso', 'atrasou', 'não chegou', 'quando chega', 'rastrear',
        'rastreio', 'pedido', 'entrega', 'prazo', 'extraviado', 'perdido',
        'meu pedido', 'encomenda', 'já faz', 'quanto tempo',
    ],
    INFO: [
        'horário', 'funcionamento', 'loja', 'endereço', 'contato',
        'telefone', ' whats', 'whatsapp', 'tem loja', 'fica onde',
        'aberto', 'fechado', 'fecha que horas', 'abre que horas',
    ],
};

/**
 * Classifica o intent de uma mensagem
 */
function classifyIntent(text: string): string {
    const lowerText = text.toLowerCase();

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return intent;
            }
        }
    }

    return 'INFO'; // Default
}

/**
 * Limpa texto do opener
 */
function cleanOpenerText(text: string): string {
    // Remove tickets, protocolos e dados sensíveis
    let cleaned = text
        .replace(/Ticket #\d+/gi, '')
        .replace(/CSCR\d+/gi, '')
        .replace(/\d{11,}/g, '') // Remove CPFs, telefones longos
        .replace(/protocolo/gi, '')
        .replace(/pedido \d+/gi, '')
        .trim();

    // Limita a 50 palavras
    const words = cleaned.split(/\s+/);
    if (words.length > 50) {
        cleaned = words.slice(0, 50).join(' ') + '...';
    }

    return cleaned;
}

/**
 * Processa o arquivo de conversas
 */
function extractOpeners(inputPath: string, outputPath: string): void {
    console.log(`[EXTRACT] Lendo arquivo: ${inputPath}`);

    const content = fs.readFileSync(inputPath, 'utf-8');
    const lines = content.trim().split('\n');

    console.log(`[EXTRACT] Total de linhas: ${lines.length}`);

    // Organiza conversas por ID
    const conversations = new Map<string, ConversationLine[]>();

    for (const line of lines) {
        try {
            const data = JSON.parse(line) as ConversationLine;
            if (!conversations.has(data.conversation_id)) {
                conversations.set(data.conversation_id, []);
            }
            conversations.get(data.conversation_id)!.push(data);
        } catch (e) {
            console.warn('[EXTRACT] Erro ao parsear linha:', e);
        }
    }

    console.log(`[EXTRACT] Total de conversas: ${conversations.size}`);

    // Extrai openers (primeira mensagem do cliente)
    const openers: Opener[] = [];

    for (const [conversationId, turns] of conversations) {
        // Ordena por turn_index
        turns.sort((a, b) => a.turn_index - b.turn_index);

        // Encontra o primeiro turno do cliente
        const firstClientTurn = turns.find(t => t.role === 'client');

        if (firstClientTurn) {
            const cleanedText = cleanOpenerText(firstClientTurn.text);

            // Ignora mensagens muito curtas ou que parecem ser respostas
            if (cleanedText.length > 5 && !cleanedText.startsWith('...')) {
                openers.push({
                    text: cleanedText,
                    conversation_id: conversationId,
                    intent: classifyIntent(cleanedText),
                    turn_index: firstClientTurn.turn_index,
                });
            }
        }
    }

    // Remove duplicatas
    const uniqueOpeners = openers.filter((opener, index, self) =>
        index === self.findIndex(o => o.text === opener.text)
    );

    console.log(`[EXTRACT] Openers extraídos: ${uniqueOpeners.length}`);

    // Agrupa por intent
    const groupedOpeners: Record<string, string[]> = {
        SALES: [],
        SAC_TROCA: [],
        SAC_ATRASO: [],
        INFO: [],
    };

    for (const opener of uniqueOpeners) {
        groupedOpeners[opener.intent].push(opener.text);
    }

    // Log stats
    console.log('\n[EXTRACT] Openers por intent:');
    for (const [intent, openersList] of Object.entries(groupedOpeners)) {
        console.log(`  ${intent}: ${openersList.length}`);
    }

    // Salva resultado
    const output = {
        generated_at: new Date().toISOString(),
        source_file: inputPath,
        total_unique_openers: uniqueOpeners.length,
        openers_by_intent: groupedOpeners,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n[EXTRACT] Salvo em: ${outputPath}`);
}

// Script principal
const INPUT_PATH = path.join(process.cwd(), 'data', 'conversations_real.jsonl');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'real_openers.json');

if (!fs.existsSync(INPUT_PATH)) {
    console.error(`[EXTRACT] Arquivo não encontrado: ${INPUT_PATH}`);
    process.exit(1);
}

extractOpeners(INPUT_PATH, OUTPUT_PATH);
