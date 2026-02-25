/**
 * Data Structurer - Converte wpp-export.json para formato padronizado JSONL
 * Schema:
 * {
 *   conversation_id,
 *   turn_index,
 *   role: "client" | "agent",
 *   text,
 *   timestamp,
 *   meta: { intent?, storeId?, outcome? }
 * }
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../wpp-export.json');
const OUTPUT_FILE = path.join(__dirname, '../data/conversations_real.jsonl');
const SAMPLE_FILE = path.join(__dirname, '../data/sample_conversations.md');

// CPF regex para anonimização
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
// Telefone regex
const PHONE_REGEX = /\b[1-9]{2}9?\d{8}\b/g;
// Palavras de nome próprio comuns para substituição
const NAMES = ['João', 'Maria', 'José', 'Ana', 'Pedro', 'Carlos', 'Fernanda', 'Lucas', 'Juliana', 'Marcos'];

function anonymize(text) {
  if (!text) return text;

  let result = text;

  // Remove CPFs
  result = result.replace(CPF_REGEX, '***.***.***-**');

  // Remove telefones (mantém só os últimos 4 dígitos se relevante)
  result = result.replace(PHONE_REGEX, (match) => {
    return '*'.repeat(match.length - 4) + match.slice(-4);
  });

  return result;
}

function getRole(fromMe) {
  return fromMe ? 'agent' : 'client';
}

function formatTimestamp(ts) {
  return new Date(ts * 1000).toISOString();
}

async function main() {
  console.log('📂 Lendo wpp-export.json...');

  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

  console.log(`📊 Total de conversas: ${rawData.length}`);

  const writeStream = fs.createWriteStream(OUTPUT_FILE);
  let totalTurns = 0;
  let samples = [];

  // Processar cada conversa
  for (const chat of rawData) {
    const { chatId, name, messages } = chat;

    // Filtrar apenas conversas relevantes (com mensagens de cliente)
    const clientMessages = messages.filter(m => !m.fromMe && m.body && m.body.trim().length > 0);

    if (clientMessages.length < 2) continue; // Ignorar conversas muito curtas

    let turnIndex = 0;

    for (const msg of messages) {
      if (!msg.body || msg.body.trim().length === 0) continue;

      const record = {
        conversation_id: chatId,
        turn_index: turnIndex,
        role: getRole(msg.fromMe),
        text: anonymize(msg.body),
        timestamp: formatTimestamp(msg.timestamp),
        meta: {
          message_type: msg.type,
          chat_name: name
        }
      };

      writeStream.write(JSON.stringify(record) + '\n');
      totalTurns++;

      // Coletar samples (primeiras 10 conversas completas)
      if (samples.length < 10 && turnIndex < 20) {
        samples.push({
          chatId,
          turnIndex,
          role: record.role,
          text: record.text
        });
      }

      turnIndex++;
    }
  }

  writeStream.end();

  console.log(`✅ Gerado: ${OUTPUT_FILE}`);
  console.log(`📝 Total de turns: ${totalTurns}`);

  // Gerar sample markdown
  let mdContent = '# Amostra de Conversas Reais\n\n> Extraído de wpp-export.json, anonimizado\n\n---\n\n';

  let currentChat = null;
  let chatCounter = 0;

  for (const sample of samples) {
    if (sample.chatId !== currentChat) {
      currentChat = sample.chatId;
      chatCounter++;
      if (chatCounter > 10) break;
      mdContent += `\n## Conversa ${chatCounter}\n\n`;
    }

    const prefix = sample.role === 'client' ? '🧑' : '🤖';
    mdContent += `${prefix} **${sample.role}**: ${sample.text}\n\n`;
  }

  fs.writeFileSync(SAMPLE_FILE, mdContent);
  console.log(`✅ Amostra gerada: ${SAMPLE_FILE}`);
}

main().catch(console.error);
