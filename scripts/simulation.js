/**
 * Simulation Engineer - Cria cenários realistas e golden examples
 *
 * Baseado nos dados reais do Conversation Analyst
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_SCENARIOS = path.join(__dirname, '../tests_harness/scenarios_v2.json');
const OUTPUT_GOLDEN = path.join(__dirname, '../data/golden_examples.json');

// Cenários baseados nos dados reais analisados
const scenariosV2 = {
  scenarios: [
    // ===== VENDAS =====
    {
      id: "venda_tenis_masculino_numero",
      name: "Vendas - Tênis Masculino (Padrão Real)",
      intent: "SALES",
      description: "Cliente pergunta sobre availability de tênis masculino em numeração específica",
      initial_message: "Vocês têm chuteira número 42 pra campo?",
      difficulty: "normal",
      goal: "Saber se tem e poder reservar",
      success_criteria: "Agent confirmar disponibilidade, perguntar cor, propor separar",
      must_ask: ["numero", "cor"],
      must_include: ["temos", "reservar"],
      must_not: ["nao temos", "nao sei"],
      max_turns: 6,
      profile: {
        persona: "cliente_loja",
        name: "Cliente Genérico",
        tone: "direto",
        behavior: "Pergunta direta, quer resposta rápida",
        frustration: 1,
        knowledge_level: "baixo"
      },
      frustration_curve: [1, 1, 1, 2, 2, 3]
    },
    {
      id: "venda_camisa_time",
      name: "Vendas - Camisa de Time (Padrão Real)",
      intent: "SALES",
      description: "Cliente quer camisa de time específico",
      initial_message: "Tem camisa do Flamengo feminina?",
      difficulty: "normal",
      goal: "Saber se tem disponibilidade",
      success_criteria: "Agent informar se tem em loja ou só no site",
      must_include: ["loja", "site"],
      must_not: [],
      max_turns: 5,
      profile: {
        persona: "torcedor",
        name: "Fã de Futebol",
        tone: "curioso",
        behavior: "Pergunta direta sobre produto",
        frustration: 1,
        knowledge_level: "baixo"
      }
    },
    {
      id: "venda_tenis_infantil",
      name: "Vendas - Tênis Infantil (Padrão Real)",
      intent: "SALES",
      description: "Cliente procura tênis infantil",
      initial_message: "Tem tênis número 27 para menino?",
      difficulty: "normal",
      goal: "Encontrar produto disponível",
      success_criteria: "Agent informar disponibilidade e numerações",
      must_include: ["numeração", "temos"],
      max_turns: 5,
      profile: {
        persona: "pai_mae",
        name: "Pai/Mãe",
        tone: "pratico",
        behavior: "Quer saber se tem e pronto",
        frustration: 1,
        knowledge_level: "baixo"
      }
    },

    // ===== SAC ATRASO =====
    {
      id: "sac_atraso_pedido",
      name: "SAC - Atraso de Pedido (Padrão Real)",
      intent: "SAC_ATRASO",
      description: "Cliente pergunta sobre pedido atrasado",
      initial_message: "Meu pedido ainda não chegou, quando vou receber?",
      difficulty: "normal",
      goal: "Saber previsão de entrega",
      success_criteria: "Agent pedir CPF/pedido e informar previsão",
      must_ask: ["cpf", "pedido"],
      must_include: ["prazo", "previsão"],
      max_turns: 6,
      profile: {
        persona: "cliente_esperando",
        name: "Cliente Esperando",
        tone: "ansioso",
        behavior: "Quer saber quando chega",
        frustration: 2,
        knowledge_level: "baixo"
      }
    },

    // ===== SAC TROCA =====
    {
      id: "sac_troca_tamanho",
      name: "SAC - Troca por Tamanho (Padrão Real)",
      intent: "SAC_TROCA",
      description: "Cliente quer trocar porque tamanho não serviu",
      initial_message: "O tênis que comprei ficou pequeno, como faço pra trocar?",
      difficulty: "normal",
      goal: "Ter instruções claras de troca",
      success_criteria: "Agent explicar processo de troca e prazo",
      must_include: ["troca", "loja", "prazo"],
      max_turns: 6,
      profile: {
        persona: "cliente_troca",
        name: "Cliente Troca",
        tone: "pratico",
        behavior: "Quer resolver logo",
        frustration: 2,
        knowledge_level: "baixo"
      }
    },

    // ===== SAC REEMBOLSO =====
    {
      id: "sac_estorno_pedido",
      name: "SAC - Estorno de Pedido (Padrão Real)",
      intent: "SAC_REEMBOLSO",
      description: "Cliente quer saber sobre estorno de pedido cancelado",
      initial_message: "Meu pedido foi cancelado, quando devolve o dinheiro?",
      difficulty: "normal",
      goal: "Saber prazo do estorno",
      success_criteria: "Agent informar prazo de estorno",
      must_include: ["prazo", "estorno", "dias"],
      max_turns: 5,
      profile: {
        persona: "cliente_estorno",
        name: "Cliente Estorno",
        tone: "curioso",
        behavior: "Pergunta sobre reembolso",
        frustration: 1,
        knowledge_level: "baixo"
      }
    },

    // ===== SAC RETIRADA =====
    {
      id: "sac_retirada_loja",
      name: "SAC - Retirada em Loja (Padrão Real)",
      intent: "SAC_RETIRADA",
      description: "Cliente quer retirar pedido na loja",
      initial_message: "Quero buscar meu pedido na loja, como faz?",
      difficulty: "normal",
      goal: "Saber horário e documentos necessários",
      success_criteria: "Agent informar horário e documentos",
      must_include: ["documento", "horário"],
      max_turns: 5,
      profile: {
        persona: "cliente_retirada",
        name: "Cliente Retirada",
        tone: "pratico",
        behavior: "Quer buscar pedido",
        frustration: 1,
        knowledge_level: "baixo"
      }
    },

    // ===== CLIENTES DIFÍCEIS =====
    {
      id: "cliente_pressionado_urgente",
      name: "Cliente Pressionado (Padrão Real)",
      intent: "SALES",
      description: "Cliente com urgência quer resposta rápida",
      initial_message: "Preciso saber agora se vocês têm o tamanho 44, é urgente!",
      difficulty: "difficult",
      goal: "Ter resposta imediata",
      success_criteria: "Agent responder rápido e direta",
      must_include: ["temos", "não temos"],
      must_not: ["vou verificar", "um momento"],
      max_turns: 4,
      profile: {
        persona: "cliente_urgente",
        name: "Cliente Urgente",
        tone: "urgente",
        behavior: "Pressiona por resposta rápida",
        frustration: 3,
        knowledge_level: "baixo"
      },
      frustration_curve: [2, 3, 4, 5]
    },
    {
      id: "cliente_troca_assunto",
      name: "Cliente que Muda de Assunto (Padrão Real)",
      intent: "SALES",
      description: "Cliente inicia com uma pergunta mas muda para outra",
      initial_message: "Tem chuteira? Ah, e vocês tem luva de goleiro?",
      difficulty: "normal",
      goal: "Ter as duas dúvidas respondidas",
      success_criteria: "Agent responder ambas perguntas",
      max_turns: 8,
      profile: {
        persona: "cliente_curioso",
        name: "Cliente Curioso",
        tone: "casual",
        behavior: "Muda de assunto durante conversa",
        frustration: 1,
        knowledge_level: "baixo"
      }
    },

    // ===== CASOS ADVERSAIS =====
    {
      id: "cliente_sem_dados",
      name: "Cliente Recusa Dados (Adversarial)",
      intent: "SAC_ATRASO",
      description: "Cliente com problema mas recusa passar dados",
      initial_message: "Meu pedido não chegou, preciso resolver isso!",
      difficulty: "adversarial",
      goal: "Ser atendido sem passar dados",
      success_criteria: "Agent tentar coletar dados de forma natural",
      must_ask: ["cpf", "pedido"],
      max_turns: 8,
      profile: {
        persona: "cliente_resistente",
        name: "Cliente Resistente",
        tone: "resistente",
        behavior: "Recusa passar dados pessoais",
        frustration: 3,
        knowledge_level: "baixo"
      },
      frustration_curve: [2, 2, 3, 3, 4, 4, 5, 5]
    },
    {
      id: "cliente_sarcastico",
      name: "Cliente Sarcástico (Adversarial)",
      intent: "SAC",
      description: "Cliente sarcástico com problema",
      initial_message: "Ah, claro, meu pedido 'vai chegar' né... já ouvi isso antes",
      difficulty: "adversarial",
      goal: "Ser tratado com respeito e ter solução",
      success_criteria: "Agent manter tom profissional sem se affected pelo sarcasmo",
      must_include: ["pedido", "prazo"],
      max_turns: 8,
      profile: {
        persona: "cliente_sarcastico",
        name: "Cliente Sarcástico",
        tone: "sarcastico",
        behavior: " Faz comentários sarcásticos, testa o agente",
        frustration: 4,
        knowledge_level: "medio"
      },
      frustration_curve: [3, 3, 4, 4, 4, 5]
    }
  ]
};

// Golden Examples baseados em padrões reais
const goldenExamples = {
  golden_examples: [
    {
      id: "golden_1",
      intent: "SALES",
      quality: "high",
      conversation: [
        { role: "client", text: "Tem chuteira n31 campo?" },
        { role: "agent", text: "Temos sim, 3 cores. Qual seria a numeração?" },
        { role: "client", text: "32" },
        { role: "agent", text: "Temos! Quer que eu deixe reservada?" },
        { role: "client", text: "Blz" },
        { role: "agent", text: "Deixei separado. Me mande um oi quando estiver vindo" }
      ],
      score: 95,
      why_works: "Respostas curtas, tom direto, ação clara no final"
    },
    {
      id: "golden_2",
      intent: "SALES",
      quality: "high",
      conversation: [
        { role: "client", text: "Vocês tem qual pro 5 bump disponível na loja?" },
        { role: "agent", text: "Boa tarde. Qual seria a numeração?" },
        { role: "client", text: "42 se a forma for grande" },
        { role: "agent", text: "Temos sim, 3 cores. Gostaria que eu deixasse reservada?" }
      ],
      score: 90,
      why_works: "Saudação breve, pergunta direta, verificação, proposta de ação"
    },
    {
      id: "golden_3",
      intent: "SAC_ATRASO",
      quality: "high",
      conversation: [
        { role: "client", text: "Meu pedido não chegou ainda" },
        { role: "agent", text: "Qual o número do pedido e CPF?" },
        { role: "client", text: "123456789 e ***.***.***-**" },
        { role: "agent", text: "Aguarde, vou verificar" },
        { role: "agent", text: "Previsão é até amanha. Qualquer problema me avise" }
      ],
      score: 85,
      why_works: "Coleta dados快速, verifica, dá prazo"
    },
    {
      id: "golden_4",
      intent: "SALES",
      quality: "low",
      conversation: [
        { role: "client", text: "Tem Nike?" },
        { role: "agent", text: "Olá! Seja muito bem-vindo à Centauro!Temos várias opções de Nike. Para que eu possa ajudá-lo melhor, me informe qual modelo você está procurando" },
        { role: "client", text: "Ah... qualquer um" },
        { role: "agent", text: "Entendo! Nós temosNike Air Max, Nike Air Force, Nike Dunk. Qual você gostaria de ver?" },
        { role: "client", text: "Deixa, qualquer uma" }
      ],
      score: 40,
      why_works: "Resposta robotica, excesso de palavras, não propõe ação"
    },
    {
      id: "golden_5",
      intent: "SAC_TROCA",
      quality: "low",
      conversation: [
        { role: "client", text: "Quero trocar meu tênis" },
        { role: "agent", text: "Poxa, que pena! Entendo sua frustração. Para que eu possa ajudá-lo melhor, preciso de algumas informações. Qual é o número do seu pedido?" },
        { role: "client", text: "Não tenho" },
        { role: "agent", text: "Sem problemas! Qual é o seu CPF?" }
      ],
      score: 50,
      why_works: "Muita empatia, linguagem robotica, perguntas longas"
    }
  ],
  anti_patterns: [
    {
      id: "anti_1",
      problem: "Saudação robotica",
      example: "Olá! Seja muito bem-vindo(a) à Centauro! Meu nome é Cadu, sou assistente virtual...",
      fix: "Oi! Qual sua dúvida?"
    },
    {
      id: "anti_2",
      problem: "Empatia exagerada",
      example: "Poxa, que pena! Sinto muito por isso. Entendo sua frustração...",
      fix: "Qual o problema?"
    },
    {
      id: "anti_3",
      problem: "Explicação excessiva",
      example: "Nosso sistema funciona da seguinte maneira: primeiro você precisa acessar...",
      fix: "Precisa do número do pedido"
    },
    {
      id: "anti_4",
      problem: "Deixar cliente em aberto",
      example: "Vou verificar e te retorno",
      fix: "Me dá 2 minutos"
    },
    {
      id: "anti_5",
      problem: "Sem proposta de ação",
      example: "Temos o produto em estoque",
      fix: "Temos. Quer que separe?"
    }
  ]
};

// Escrever arquivos
fs.writeFileSync(OUTPUT_SCENARIOS, JSON.stringify(scenariosV2, null, 2));
console.log(`✅ Cenários gerados: ${OUTPUT_SCENARIOS}`);
console.log(`   Total: ${scenariosV2.scenarios.length} cenários`);

fs.writeFileSync(OUTPUT_GOLDEN, JSON.stringify(goldenExamples, null, 2));
console.log(`✅ Golden examples gerados: ${OUTPUT_GOLDEN}`);
console.log(`   Total: ${goldenExamples.golden_examples.length} exemplos`);
console.log(`   Anti-patterns: ${goldenExamples.anti_patterns.length}`);
