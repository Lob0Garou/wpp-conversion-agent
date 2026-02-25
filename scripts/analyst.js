/**
 * Conversation Analyst - Analisa padrões reais de conversas
 *
 * Identifica:
 * - Padrões de cliente
 * - Intents reais
 * - Problemas do Cadu
 * - Insights acionáveis
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../data/conversations_real.jsonl');
const OUTPUT_FILE = path.join(__dirname, '../docs/real_patterns.md');

// Keywords para identificar intents
const INTENT_KEYWORDS = {
  SALES: ['tem', 'tem?', 'vocês tem', 'vcs tem', 'quanto', 'preço', 'valor', 'produto', 'modelo', 'tamanho', 'número', 'numeração', 'cor', 'disponível', 'reserve', 'separar', 'comprar', 'quero', 'buscar', 'loja'],
  SAC_ATRASO: ['atraso', 'atrasou', 'quando chega', 'não chegou', 'prazo', 'entrega', 'rastreio', 'pedido'],
  SAC_TROCA: ['trocar', 'troca', 'devolver', 'devolução', 'trocando', 'tamanho não serve'],
  SAC_REEMBOLSO: ['estorno', 'reembolso', 'dinheiro', 'devolver o dinheiro', 'boleto'],
  SAC_RETIRADA: ['retirar', 'buscar', 'retirada', 'passar pegando', 'pegar'],
  INFO: ['horário', 'loja', 'endereço', 'funcionamento', 'contato', 'telefone', 'aberto', 'fecha']
};

// Anti-patterns do Cadu (baseado no que não funciona)
const CADU_PROBLEMS = [
  'olá', 'seja muito bem-vindo', 'como posso ajudá-lo', 'para que eu possa',
  'entendi', 'compreendo', 'poxa', 'que pena', 'sinto muito',
  'qual seria', 'me informe', 'preciso saber', 'gostaria de saber'
];

// Frases de vendas que funcionam
const GOOD_PATTERNS = [
  'temos sim', 'temos não', 'vou verificar', 'blz', 'tá', 'pode vir',
  'me chama', 'deixa separado', 'reservei', 'separado'
];

function countWords(text) {
  return text ? text.toLowerCase().split(/\s+/).filter(w => w.length > 0).length : 0;
}

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

function detectClientProblems(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const problems = [];

  // Frustração
  if (lower.includes('não') && (lower.includes('aguent') || lower.includes('mais') || lower.includes('demora'))) {
    problems.push('frustrated');
  }

  // Mudança de assunto
  if (lower.includes('mas') && lower.includes('e ai') && countWords(text) < 5) {
    problems.push('topic_change');
  }

  // Pressão
  if (lower.includes('urgente') || lower.includes('rapido') || lower.includes('precisa') || lower.includes('agora')) {
    problems.push('pressured');
  }

  // Recusa de dados
  if (lower.includes('não') && lower.includes('vou passar') || lower.includes('não preciso')) {
    problems.push('refusing_data');
  }

  return problems;
}

function analyzeCaduIssues(agentTexts) {
  const issues = {
    repetition: 0,
    empathy_excess: 0,
    early_escalation: 0,
    wrong_questions: 0,
    generic_responses: 0
  };

  for (const text of agentTexts) {
    const lower = text.toLowerCase();

    // Repetição
    if (text.match(/(.)\1{2,}/)) issues.repetition++;

    // Empatia exagerada
    if (lower.includes('poxa') || lower.includes('que pena') || lower.includes('sinto muito')) {
      issues.empathy_excess++;
    }

    // Escalonamento precoce
    if (lower.includes('vou transferir') || lower.includes('encaminhar') || lower.includes('outro atendimento')) {
      issues.early_escalation++;
    }

    // Perguntas erradas (muito longas)
    if (countWords(text) > 30 && text.includes('?')) {
      issues.wrong_questions++;
    }

    // Respostas genéricas
    if (lower.includes('entendi') && countWords(text) > 10) {
      issues.generic_responses++;
    }
  }

  return issues;
}

async function main() {
  console.log('📊 Carregando dados estruturados...');

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
      // skip invalid lines
    }
  }

  console.log(`💬 Total de conversas: ${Object.keys(conversations).length}`);

  // Análise
  let totalClientTurns = 0;
  let totalAgentTurns = 0;
  let intentCounts = {};
  let clientProblemCounts = {};
  let allClientTexts = [];
  let allAgentTexts = [];

  // Coletar conversas relevantes (pelo menos 3 turns e presença de cliente)
  const relevantConversations = [];

  for (const [chatId, turns] of Object.entries(conversations)) {
    const clientTurns = turns.filter(t => t.role === 'client');
    const agentTurns = turns.filter(t => t.role === 'agent');

    if (clientTurns.length < 2) continue;

    totalClientTurns += clientTurns.length;
    totalAgentTurns += agentTurns.length;

    // Detectar intents
    for (const turn of clientTurns) {
      const intent = detectIntent(turn.text);
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;

      // Detectar problemas de cliente
      const problems = detectClientProblems(turn.text);
      for (const p of problems) {
        clientProblemCounts[p] = (clientProblemCounts[p] || 0) + 1;
      }

      allClientTexts.push(turn.text);
    }

    allAgentTexts.push(...agentTurns.map(t => t.text));

    relevantConversations.push({
      chatId,
      turns,
      clientTurns,
      agentTurns
    });
  }

  // Análise de problemas do Cadu
  const caduIssues = analyzeCaduIssues(allAgentTexts);

  // Coletar frases mais comuns de cliente
  const clientWordFreq = {};
  for (const text of allClientTexts) {
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    for (const w of words) {
      clientWordFreq[w] = (clientWordFreq[w] || 0) + 1;
    }
  }

  const topClientWords = Object.entries(clientWordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => `  - "${word}": ${count}x`);

  // Gerar relatório
  let md = `# Padrões Reais de Conversa - Análise de Dados

> Gerado automaticamente a partir de ${Object.keys(conversations).length} conversas reais
> Turns analisados: ${lines.length}

---

## 📈 Métricas Gerais

- **Total de conversas relevantes:** ${relevantConversations.length}
- **Turns de cliente:** ${totalClientTurns}
- **Turns de agente:** ${totalAgentTurns}
- **Média de turnos por conversa:** ${(totalClientTurns / relevantConversations.length).toFixed(1)}

---

## 🎯 Intents Identificadas

| Intent | Ocorrências | % do Total |
|--------|-------------|------------|
`;

  for (const [intent, count] of Object.entries(intentCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / totalClientTurns) * 100).toFixed(1);
    md += `| ${intent} | ${count} | ${pct}% |\n`;
  }

  md += `
---

## 🔤 Top Frases de Cliente

${topClientWords.join('\n')}

---

## ⚠️ Problemas Reais de Clientes

| Problema | Ocorrências |
|----------|-------------|
`;

  for (const [problem, count] of Object.entries(clientProblemCounts).sort((a, b) => b[1] - a[1])) {
    md += `| ${problem} | ${count} |\n`;
  }

  md += `
---

## 🐛 Problemas Identificados do Cadu

| Problema | Ocorrências |
|----------|-------------|
| Repetição de frases | ${caduIssues.repetition} |
| Empatia exagerada | ${caduIssues.empathy_excess} |
| Escalonamento precoce | ${caduIssues.early_escalation} |
| Perguntas longas | ${caduIssues.wrong_questions} |
| Respostas genéricas | ${caduIssues.generic_responses} |

---

## 💡 Recomendações para o Agente

### Para VENDAS:
1. **Respostas curtas** - Mínimo de palavras possível
2. **Confirmar antes de prometer** - "Vou verificar" antes de "temos"
3. **Sempre propor ação** - "Quer que separe?" em vez de "Temos o produto"
4. **Tom direto** - "Blz", "Tá", "Pode vir"

### Para SAC:
1. **Coletar dados uma vez** - Pedir CPF + pedido logo no início
2. **Transparência** - Dizer "não sei" se não souber
3. **Prazos realistas** - "Até 48h" em vez de "em breve"
4. **Encerrar com ação** - "Algo mais?" para confirmar resolução

###Anti-patterns a EVITAR:
1. ❌ "Olá! Seja muito bem-vindo(a)..."
2. ❌ "Poxa, que pena! Entendo sua frustração"
3. ❌ "Para que eu possa ajudá-lo melhor..."
4. ❌ Respostas com mais de 30 palavras
5. ❌ "Vou transferir para outro atendimento" (sem tentar resolver antes)

---

## 🔥 Fluxos Ideais (baseados em dados)

### Venda rápida:
1. Cliente pergunta produto
2. Agent confirma numeração
3. Agent verifica disponibilidade
4. Agent propõe ação (separar/reservar)
5. Cliente confirma vinda

### SAC eficiente:
1. Cliente reporta problema
2. Agent pede mínimo necessário (pedido + CPF)
3. Agent verifica status
4. Agent informa prazo ou ação
5. Agent confirma se precisa de mais algo

---

*Gerado em: ${new Date().toISOString()}*
`;

  fs.writeFileSync(OUTPUT_FILE, md);
  console.log(`✅ Relatório gerado: ${OUTPUT_FILE}`);
}

main().catch(console.error);
