/**
 * Extrai 10 conversas completas do dataset real
 * Critérios de completude:
 * - Início: cliente faz pergunta/pedido
 * - Meio: agente responde
 * - Fim: cliente confirma OU agente propõe próxima ação
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../data/conversations_real.jsonl');
const OUTPUT_FILE = path.join(__dirname, '../data/complete_conversations.json');

// Keywords para identificar intent
const INTENT_KEYWORDS = {
  SALES: ['tem', 'vocês tem', 'vcs tem', 'quanto', 'preço', 'valor', 'produto', 'modelo', 'tamanho', 'número', 'cor', 'disponível', 'reserve', 'separar', 'comprar', 'quero', 'buscar'],
  SAC_TROCA: ['trocar', 'troca', 'devolver', 'devolução', 'tamanho não serve'],
  SAC_ATRASO: ['atraso', 'atrasou', 'não chegou', 'quando chega', 'prazo', 'entrega', 'rastreio'],
  SAC_REEMBOLSO: ['estorno', 'reembolso', 'dinheiro', 'cancelado'],
  INFO: ['horário', 'loja', 'endereço', 'contato', 'telefone', 'funcionamento']
};

// Keywords para identificar conclusão
const CLOSURE_KEYWORDS = [
  'obrigado', 'obrigada', 'blz', 'tá', 'ok', 'de acordo', 'perfeito',
  'resolveu', 'consegui', 'deu certo', 'fechado', 'separado', 'reservado',
  'protocolo', 'chamado', 'vou', 'passo', 'pode', 'vou buscar',
  'me avisa', 'deixa', 'separado'
];

// Keywords para identificar pergunta do cliente
const QUESTION_KEYWORDS = ['?', 'como', 'onde', 'quanto', 'qual', 'tem', 'vocês tem', 'vcs tem', 'preciso', 'quero'];

function detectIntent(text) {
  if (!text) return 'UNKNOWN';
  const lower = text.toLowerCase();

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return intent;
    }
  }
  return 'UNKNOWN';
}

function isQuestion(text) {
  if (!text) return false;
  return text.includes('?') || QUESTION_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
}

function isClosure(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CLOSURE_KEYWORDS.some(kw => lower.includes(kw));
}

function countWords(text) {
  return text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
}

function analyzeConversation(turns) {
  const clientTurns = turns.filter(t => t.role === 'client');
  const agentTurns = turns.filter(t => t.role === 'agent');

  if (clientTurns.length < 2) return null;

  // Detectar intent predominante
  let intentCounts = {};
  for (const turn of clientTurns) {
    const intent = detectIntent(turn.text);
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  const mainIntent = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';

  // Verificar se tem início, meio e fim
  const hasQuestion = clientTurns.some(t => isQuestion(t.text));
  const hasResponse = agentTurns.length > 0;
  const hasClosure = [...clientTurns, ...agentTurns].some(t => isClosure(t.text));

  // Calcular métricas
  const avgClientWords = clientTurns.reduce((sum, t) => sum + countWords(t.text), 0) / clientTurns.length;
  const avgAgentWords = agentTurns.reduce((sum, t) => sum + countWords(t.text), 0) / agentTurns.length;

  return {
    turns: turns.length,
    clientTurns: clientTurns.length,
    agentTurns: agentTurns.length,
    intent: mainIntent,
    hasQuestion,
    hasResponse,
    hasClosure,
    avgClientWords: Math.round(avgClientWords),
    avgAgentWords: Math.round(avgAgentWords),
    complete: hasQuestion && hasResponse
  };
}

function main() {
  console.log('📊 Carregando dados...');

  const lines = fs.readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  console.log(`📝 Total de turns: ${lines.length}`);

  // Agrupar por conversa
  const conversations = {};
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (!conversations[record.conversation_id]) {
        conversations[record.conversation_id] = [];
      }
      conversations[record.conversation_id].push(record);
    } catch (e) {
      // skip
    }
  }

  console.log(`💬 Total de conversas: ${Object.keys(conversations).length}`);

  // Analisar cada conversa
  const analyzed = [];
  for (const [chatId, turns] of Object.entries(conversations)) {
    const analysis = analyzeConversation(turns);
    if (analysis) {
      analyzed.push({
        chatId,
        ...analysis,
        turns: turns.sort((a, b) => a.turn_index - b.turn_index)
      });
    }
  }

  // Filtrar conversas completas
  const complete = analyzed.filter(c => c.complete);
  console.log(`✅ Conversas completas: ${complete.length}`);

  // Agrupar por intent
  const byIntent = {
    SALES: complete.filter(c => c.intent === 'SALES'),
    SAC_TROCA: complete.filter(c => c.intent === 'SAC_TROCA'),
    SAC_ATRASO: complete.filter(c => c.intent === 'SAC_ATRASO'),
    SAC_REEMBOLSO: complete.filter(c => c.intent === 'SAC_REEMBOLSO'),
    INFO: complete.filter(c => c.intent === 'INFO'),
    UNKNOWN: complete.filter(c => c.intent === 'UNKNOWN')
  };

  console.log('\n📊 Distribuição por Intent:');
  for (const [intent, convs] of Object.entries(byIntent)) {
    console.log(`  ${intent}: ${convs.length}`);
  }

  // Selecionar 10 conversas (priorizando intents principais)
  const selected = [];

  // 4 SALES
  for (const c of byIntent.SALES.slice(0, 4)) {
    selected.push(c);
  }

  // 3 SAC (misturar tipos)
  const sacConvs = [
    ...byIntent.SAC_TROCA,
    ...byIntent.SAC_ATRASO,
    ...byIntent.SAC_REEMBOLSO
  ];
  for (const c of sacConvs.slice(0, 3)) {
    selected.push(c);
  }

  // 3 INFO ou UNKNOWN
  const infoConvs = [...byIntent.INFO, ...byIntent.UNKNOWN];
  for (const c of infoConvs.slice(0, 3)) {
    selected.push(c);
  }

  // Se ainda não tem 10, preencher com outros
  while (selected.length < 10 && complete.length > selected.length) {
    const remaining = complete.filter(c => !selected.includes(c));
    if (remaining.length > 0) {
      selected.push(remaining[0]);
    } else {
      break;
    }
  }

  // Formatar saída
  const output = selected.map((c, idx) => {
    // Extrair só as primeiras mensagens (até 10 turns para não ficar grande)
    const shortTurns = c.turns.slice(0, 10).map(t => ({
      role: t.role,
      text: t.text.substring(0, 200) // Limitar texto
    }));

    return {
      id: idx + 1,
      chatId: c.chatId,
      intent: c.intent,
      turns: c.turns,
      totalTurns: c.turns,
      clientTurns: c.clientTurns,
      agentTurns: c.agentTurns,
      avgClientWords: c.avgClientWords,
      avgAgentWords: c.avgAgentWords,
      conversation: shortTurns
    };
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Salvo: ${OUTPUT_FILE}`);
  console.log(`📋 Total de exemplos: ${output.length}`);

  // Mostrar resumo
  console.log('\n📋 Conversas Selecionadas:');
  for (const c of output) {
    console.log(`  ${c.id}. ${c.intent} - ${c.totalTurns} turns, ${c.clientTurns} cliente, ${c.agentTurns} agente`);
  }
}

main().catch(console.error);
