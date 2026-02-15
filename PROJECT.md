# Sistema de Conversão via WhatsApp para Lojas Físicas

> "O sistema não tenta adivinhar. Ele resolve."

## Princípios (Imutáveis)

- Simplicidade > Complexidade
- Controle > Criatividade
- Conversão > Conversa
- Segurança > Automação
- Velocidade > Perfeição

## Objetivos do Agente

O agente deve apenas:

1. Responder dúvidas
2. Verificar disponibilidade
3. Direcionar para compra ou resolução

Se não conseguir → **Escalar para humano**

## Arquitetura

| Camada | Responsabilidade |
|--------|------------------|
| WhatsApp Cloud API | Receber/enviar mensagens |
| Backend (Next.js) | Processar mensagens |
| Engine de Decisão | Classificar, decidir, aplicar regras |
| IA (futuro) | Apenas gerar texto final |
| Banco de Dados | Persistência |
| Painel de Gestão | (futuro) Interface para o time |

> **Regra crítica:** A IA NÃO decide lógica. A IA apenas transforma dados em texto.

## Engine de Decisão

### Intenções

- `sales` — venda
- `stock` — estoque/disponibilidade
- `sac` — atendimento/problema
- `human` — transferir para humano

### Classificação de Risco

- `low` — resposta automática
- `medium` — resposta com cautela
- `high` — escalar para humano

## Safe Mode (Anti-Alucinação)

**Proibido:**

- Inventar estoque, preço ou prazo
- Prometer disponibilidade

**Se não souber:**

- Pedir mais detalhes
- Informar que vai verificar

**Situações críticas (troca, garantia, reclamação):**

- Escalar para humano

## Regras de Resposta

- Máximo 2 frases
- Máximo 1 pergunta
- Sempre objetivo
- Sempre direcionar próximo passo

## Multi-Loja

Todas as entidades devem conter `store_id`.

### Muda por loja

- Tom de voz, campanhas, item da semana, regras de handoff, estoque

### NÃO muda

- Engine, regras base, arquitetura

## Princípios de Implementação

1. **Isolamento Absoluto** — Nenhuma query sem filtro de `store_id`
2. **Stateless Engine** — Código decide fluxo; IA só escreve mensagem final
3. **Logging de Auditoria** — Cada decisão da Engine é logada
