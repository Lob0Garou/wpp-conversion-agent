# Análise Especialista - Agente Cadu

## Resumo Executivo

Após revisar o histórico de calibração (`EVOLUCAO_AJUSTES_CADU.md`), as master policies, a arquitetura do agente (sistema de intents, states, e limitadores de ação), e rodarmos inferências no runtime real (via `CHAT_ONLY` webhook na sandbox), constatamos que o agente possui um fluxo determinístico bastante robusto e modular, focado na segurança do domínio.
Porém, o modelo apresenta rigidez e dependência pesada de *regex* e *keywords arrays*. A manutenção deste classificador de intenção e extrator de slots começa a apresentar sinais de saturação: consertar um classificador muitas vezes pode quebrar outro (overfitting de regras), causando loops onde o cliente repete a mesma informação.

## 1. Diagnóstico de Padrões

1. **Padrões Recorrentes:**
   - Rigidez exagerada na captura de entidades. O bot frequentemente não compreende informações fornecidas fora da ordem engessada (e.g. CPF com formatação não-padrão, tamanhos no meio de preços, nomes não formatados).
   - Loops de questionamento onde o estado transita falhamente e o template faz com que o bot insista na coleta de um input já ofertado.
   - Conflitos de extração (ex: Categoria x Uso), onde dados são dropados em vez de conciliados.

2. **Classificação de Problemas:**
   - **Críticos**: Quebras de fluxo e bloqueios (e.g., exigir pedido no caso de lojas físicas onde apenas o CPF seria necessário). Em sua maioria, estes foram atacados recentemente na sessão 1 e 3 da evolução de ajustes, mas o risco pauta na sua reincidência se templates forem adicionados indiscriminadamente.
   - **Moderados**: Classificação ambígua de intent (Por exemplo, `INFO_SAC_POLICY` vs `SAC_TROCA` com a palavra "Garantia"), forçando as regras de Action Decider ao erro caso a keyword caia no fast-path errado.
   - **Menores**: Tom de voz engessado em transições e repetições de saudação que causam fricção (e.g. "Boa tarde, [mesma pergunta de antes]").

## 2. O Que Está Funcionando

1. **Fluxos bem calibrados:**
   - **Gerenciamento de Estado**: As delimitações `greeting -> discovery -> proposal -> closing -> post_sale` asseguram um diálogo seguro.
   - **Definição de SAC Mínimo**: A regra em `sacMinimum.ts` que separa `loja_fisica` de compras online previne as antigas barreiras de atendimento.
   - **Templates e Respostas Rápidas**: A injeção de templates (`sacTemplates` e `salesTemplates`) previne alucinações e garante alta aderência às master policies (como isenção de descontos e prazos de garantia).

2. **Decisões acertadas:**
   - A introdução do classificador `INFO_SAC_POLICY` (diferenciando de processos reativos de SAC) obteve grande impacto positivo por evitar aberturas de chamado para dúvidas genéricas.
   - Ativação de automação de escalação por frustração/tamanho da mensagem ("textões" maiores que 150 caracteres).

## 3. O Que Precisa Ajustar

1. **Problemas Estruturais:**
   - A dependência de regex iterativo em `slot-extractor.ts` e varredura top-down em `intent-classifier.ts` dificulta a manutenção do Cadu. Novas palavras-chave interferem em cadeias semânticas distintas.
   - A extração de "nomes" e "tamanhos" continua muito suscetível ao erro (rejeição a abreviações, identificação cruzada de numerais com preços/quantidades).

2. **Edge Cases Não Tratados:**
   - Clientes com discursos multi-intenção ("Vou comprar um tênis X na numeração 42 pra musculação, mas tenho uma dúvida do último pedido!"). O bot vai categorizar arbitrariamente uma das duas e negligenciar a outra até haver clarificação.
   - A frustração medida apenas pela densidade de letras maiúsculas e palavras de irritação genérica perde sinais mais sutis de passivo-agressividade ou insistência sem uso de keywords chaves.

3. **Experiência do Usuário:**
   - Em certos cenários, as saudações ficam secas mesmo com templates aplicados porque a transição de estado ocorre concomitantemente com o primeiro "oi" + um pedido, limitando as possibilidades conversacionais a ações de extração diretas.

## 4. Recomendações Prioritárias

| Prioridade | Problema | Solução Proposta | Esforço | Impacto |
|---|---|---|---|---|
| P0 | Rigidez / Falha Extração de Slots (Regex) | Revisar `slot-extractor.ts`. Implementar um parser LLM simplificado, dedicado apenas a extrair e tipificar as entidades em objetos JSON caso Regex falhe, em vez de exigir match restrito. | Médio | Alto |
| P1 | Ambiguidade de Intentos (Info vs SAC vs Sales) | Submeter mensagens maiores ou sem fast-path match claro para uma layer NLP rápida (`intent-classifier`) antes do `LLM_FALLBACK` final, reduzindo confusão categórica. | Médio | Alto |
| P2 | Interrupção Seca e Fricção de Tom | Abrandar os templates da camada "CLARIFICATION", adicionando validadores contextuais melhores que percebam as metas secundárias da conversa (pedidos híbridos). | Baixo | Médio |
| P3 | Human Loop Falsa Escalação | Aprimorar o `isHumanLocked` para avaliar o peso contextual e evitar repasses demasiados ("Textão" não frustrado, apenas detalhista). | Médio | Médio |

## 5. Métricas de Sucesso

1. **Taxa de classificação correta**: Volume percentual de intents decididos de forma assertiva via regex templates vs volume delegado para o `LLM_FALLBACK`. Uma taxa > 80% indica calibração sistêmica funcional.
2. **Taxa de escalação desnecessária**: % de chamados com o action de `ESCALATE` precoces (< 4 mensagens) antes de classificar intents de suporte ou problemas transacionais.
3. **Satisfação do cliente**: Redução absoluta das flags de frustração do `detectFrustration` a menos de 5% de todas as threads ativas monitoradas na audit log do Prisma.

## Validacao Contra CHAT_ONLY

| Recomendacao | Evidencia no log atual? | Camada | Status (ja corrigido/parcial/pendente) | Acao sugerida |
|---|---|---|---|---|
| Extração de variáveis menos engessada | Sim, falhas ao extrair dados multi-campo geram loops iterativos contínuos até bater o threshold | `slot-extractor` | Parcialmente | Expandir regex ou transferir responsabilidade a um extraidor LLM. |
| Tratamento de Mensagens Multi-Intenção | Sim (Cliente envia problema e pergunta ao mesmo tempo) | `intent-classifier` | Pendente | Mapear intents compostas ou dividir a mensagem no classificador. |
| Classificador de Garantia/Dúvida Genérica | Sim, validação determinística é acionada (`sac_question` / `INFO`) | `template` e `action-decider` | Resolvido/Parcial | Continuar enriquecendo os templates de políticas em `info.ts`. |

## Plano de Execucao em Patches

- **Patch 1 (deterministico)**: Ajustar regex e fluxos lógicos de exceção de nomes, tamanhos e identificação física x site no `slot-extractor.ts`. + Teste de Aceite Interativo via Webhook.
- **Patch 2 (templates)**: Enriquer library de `infoTemplates` e `sacTemplates` p/ abranger edge-cases multi-intenção do Action Decider. + Teste de Aceite Automático.
- **Patch 3 (LLM/guardrail, se necessario)**: Acoplar um mini-llm extrator de slots apenas caso as duas camadas precedentes de Regex e Keywords falhem (em `slot-extractor`), evitando loops desnecessários sem ferir o custo geral. + Teste de Aceite.

## 6. Próximos Passos Imediatos

1. Inserir os relatórios gerados nesta análise nos logs do `EVOLUCAO_AJUSTES_CADU.md` documentando a entrada "Sessão Especialista Pós-V3".
2. Implementar Patch 1 de regex e limpeza do classificador multi-intents.
3. Adicionar testes unitários garantindo que os fluxos de "Loja Física" vs "Site" sejam inquebráveis.
