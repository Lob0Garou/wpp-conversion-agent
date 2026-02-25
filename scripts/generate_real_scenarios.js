/**
 * Gera cenários de teste baseados em conversas reais completas
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../data/complete_conversations.json');
const OUTPUT_FILE = path.join(__dirname, '../tests_harness/scenarios_v5.json');

// 10 cenários baseados nas conversas reais
const scenarios = [
  {
    id: "sales_tenis_feminino",
    name: "Vendas - Tênis Feminino (Real)",
    intent: "SALES",
    description: "Cliente pergunta sobre tênis adidas feminino disponível na loja",
    initial_message: "Gostaria de saber quais tenis adidas feminino tem disponível na loja.",
    difficulty: "normal",
    topic_lock: true,
    goal: "Saber disponibilidade e poder reservar",
    success_criteria: "Agent confirmar produtos, perguntar numeração, propor reserva",
    must_ask: ["numeração", "tamanho"],
    must_include: ["temos", "disponível"],
    must_not: [],
    max_turns: 8,
    profile: {
      persona: "cliente_interessada",
      name: "Cliente",
      tone: "educado",
      behavior: "Pergunta sobre disponibilidade, quer ver opções",
      frustration: 1
    },
    frustration_curve: [1, 1, 2, 2, 3],
    source: "conversa_real_1"
  },
  {
    id: "sales_tenis_infantil",
    name: "Vendas - Tênis Infantil (Real)",
    intent: "SALES",
    description: "Cliente procura tênis infantil na loja",
    initial_message: "Tem tênis número 27 para menino?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Encontrar produto disponível",
    success_criteria: "Agent informar numeração disponível",
    must_ask: ["numeração"],
    must_include: ["temos", "não temos"],
    must_not: [],
    max_turns: 6,
    profile: {
      persona: "pai_mae",
      name: "Pai/Mãe",
      tone: "pratico",
      behavior: "Quer resposta direta",
      frustration: 1
    },
    frustration_curve: [1, 1, 2, 2],
    source: "conversa_real_2"
  },
  {
    id: "sales_chuteira_campo",
    name: "Vendas - Chuteira Campo (Real)",
    intent: "SALES",
    description: "Cliente pergunta sobre chuteira para campo",
    initial_message: "Vocês tem chuteira n31 campo?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Saber se tem e preço",
    success_criteria: "Agent confirmar disponibilidade, perguntar cor",
    must_ask: ["número", "cor"],
    must_include: ["temos", "cor"],
    must_not: [],
    max_turns: 6,
    profile: {
      persona: "atleta",
      name: "Atleta",
      tone: "direto",
      behavior: "Pergunta direta",
      frustration: 1
    },
    frustration_curve: [1, 1, 2, 2],
    source: "conversa_real_3"
  },
  {
    id: "sales_camisa_time",
    name: "Vendas - Camisa de Time (Real)",
    intent: "SALES",
    description: "Cliente quer camisa de time específica",
    initial_message: "Vocês tem camisa do Flamengo feminina?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Saber disponibilidade",
    success_criteria: "Agent informar se tem em loja ou só no site",
    must_include: ["loja", "site"],
    must_not: [],
    max_turns: 5,
    profile: {
      persona: "torcedor",
      name: "Fã",
      tone: "curioso",
      behavior: "Pergunta direta",
      frustration: 1
    },
    frustration_curve: [1, 1, 2],
    source: "conversa_real_4"
  },
  {
    id: "sac_estorno_pedido",
    name: "SAC - Estorno de Pedido (Real)",
    intent: "SAC_REEMBOLSO",
    description: "Cliente quer saber sobre estorno de pedido cancelado",
    initial_message: "Boa tarde, fiz um pedido que foi cancelado. Quando vou receber o dinheiro de volta?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Saber prazo do estorno",
    success_criteria: "Agent informar prazo de estorno",
    must_ask: ["pedido", "cpf"],
    must_include: ["prazo", "dias"],
    must_not: [],
    max_turns: 6,
    profile: {
      persona: "cliente_esperando",
      name: "Cliente",
      tone: "ansioso",
      behavior: "Quer saber quando recebe",
      frustration: 2
    },
    frustration_curve: [2, 2, 3, 3],
    source: "conversa_real_5"
  },
  {
    id: "info_horario_loja",
    name: "INFO - Horário de Funcionamento (Real)",
    intent: "INFO",
    description: "Cliente pergunta horário da loja",
    initial_message: "Qual o horário de funcionamento de vocês?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Saber horário",
    success_criteria: "Agent informar horário",
    must_include: ["horário"],
    must_not: [],
    max_turns: 3,
    profile: {
      persona: "interessado",
      name: "Cliente",
      tone: "curioso",
      behavior: "Pergunta simples",
      frustration: 1
    },
    frustration_curve: [1, 1],
    source: "conversa_real_6"
  },
  {
    id: "info_endereco_loja",
    name: "INFO - Endereço da Loja (Real)",
    intent: "INFO",
    description: "Cliente pergunta endereço da loja",
    initial_message: "Qual o endereço da loja?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Saber endereço",
    success_criteria: "Agent informar endereço",
    must_include: ["endereço"],
    must_not: [],
    max_turns: 3,
    profile: {
      persona: "interessado",
      name: "Cliente",
      tone: "curioso",
      behavior: "Pergunta simples",
      frustration: 1
    },
    frustration_curve: [1, 1],
    source: "conversa_real_7"
  },
  {
    id: "sales_produto_especifico",
    name: "Vendas - Produto Específico (Real)",
    intent: "SALES",
    description: "Cliente pergunta sobre produto específico com imagem",
    initial_message: "Tem essa? [imagem]",
    difficulty: "normal",
    topic_lock: true,
    goal: "Verificar disponibilidade do produto shown",
    success_criteria: "Agent verificar e informar disponibilidade",
    must_include: ["temos", "não temos"],
    must_not: [],
    max_turns: 5,
    profile: {
      persona: "cliente_visual",
      name: "Cliente",
      tone: "pratico",
      behavior: "Mostra produto que quer",
      frustration: 2
    },
    frustration_curve: [1, 2, 2, 3],
    source: "conversa_real_8"
  },
  {
    id: "sales_tenis_corrida",
    name: "Vendas - Tênis Corrida (Real)",
    intent: "SALES",
    description: "Cliente quer recomendações de tênis para corrida",
    initial_message: "Qual tênis vocês recomendam para corrida?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Receber recomendação",
    success_criteria: "Agent recomendar produtos com base no uso",
    must_ask: ["tipo de uso", "numeração"],
    must_include: ["recomendo", "indicado"],
    must_not: [],
    max_turns: 6,
    profile: {
      persona: "corredor",
      name: "Atleta",
      tone: "entusiasta",
      behavior: "Quer recomendação",
      frustration: 1
    },
    frustration_curve: [1, 1, 2, 2],
    source: "conversa_real_9"
  },
  {
    id: "sales_dividas",
    name: "Vendas - Dúvidas Gerais (Real)",
    intent: "SALES",
    description: "Cliente tem dúvidas sobre produtos",
    initial_message: "Quais produtos vocês têm disponíveis?",
    difficulty: "normal",
    topic_lock: true,
    goal: "Conhecer catálogo",
    success_criteria: "Agent apresentar opções",
    must_include: ["temos", "opções"],
    must_not: [],
    max_turns: 5,
    profile: {
      persona: "cliente_curioso",
      name: "Cliente",
      tone: "curioso",
      behavior: "Explora catálogo",
      frustration: 1
    },
    frustration_curve: [1, 1, 2],
    source: "conversa_real_10"
  }
];

const output = { scenarios };

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`✅ Cenários gerados: ${OUTPUT_FILE}`);
console.log(`📋 Total: ${scenarios.length} cenários`);
console.log(`\n📊 Distribuição:`);
const intentCounts = {};
for (const s of scenarios) {
  intentCounts[s.intent] = (intentCounts[s.intent] || 0) + 1;
}
for (const [intent, count] of Object.entries(intentCounts)) {
  console.log(`  ${intent}: ${count}`);
}
