# Guia de Escrita de Cenários Didáticos (Harness v2.0)

Este guia ensina como escrever cenários que realmente "ensinam" o Cadu a ser um vendedor e atendente de elite, em vez de apenas estressar loops infinitos.

## 1. Estrutura de um Cenário de Alta Fidelidade

Cada cenário deve seguir o arco: **Abertura → Triagem → Resolução → Fechamento**.

### Campos Críticos

- `goal`: O que o cliente quer resolver. Ajuda o LLM do cliente a manter o foco.
- `success_criteria`: O que o agente **deve** fazer para o cliente ficar satisfeito. Define a condição de parada.
- `profile.behavior`: Instruções de como o cliente deve agir (ex: "resiste a passar o CPF 1x").
- `must_ask` / `must_include`: Garantem conformidade com as políticas da Centauro.

---

## 2. Template Padrão (JSON)

```json
{
  "id": "sac_atraso_empatico",
  "name": "SAC - Atraso com Empatia",
  "intent": "SAC",
  "description": "Pedido atrasado, cliente frustrado mas cooperativo se houver empatia.",
  "initial_message": "Meu pedido #12345 está atrasado há 3 dias. Quero saber onde está.",
  "difficulty": "normal",
  "goal": "Saber a localização do pedido e receber um prazo de solução.",
  "success_criteria": "Agente deve acolher a frustração, explicar que vai verificar e passar um protocolo.",
  "must_ask": ["pedido", "cpf"],
  "must_include": ["protocolo", "prazo"],
  "must_not": ["desculpe a demora"],
  "max_turns": 8,
  "profile": {
    "persona": "cliente_regular",
    "name": "João",
    "tone": "frustrado",
    "behavior": "Se o agente for seco, ele aumenta o tom. Se for empático, ele colabora.",
    "frustration": 3,
    "knowledge_level": "medio"
  }
}
```

---

## 3. Dicas para Criação de Desafios (Adversarial)

Para cenários "Adversariais", use a lógica de **Resistência Ativa**:

- **Consistência de Dados**: Instrua o cliente a não ter um dado (ex: "não tenho o número do pedido") para forçar o agente a pedir o CPF (Plano B).
- **Escalação**: Defina casos onde a solução **não** pode ser automatizada, forçando o agente a transferir corretamente para um humano.
- **Ameaças**: Use ameaças de "Reclame Aqui" ou "Procon" para testar a resiliência emocional e o uso de técnicas de desescalada (de-escalation).

---

## 4. Melhores Práticas

1. **Evite Cenários Impossíveis**: O objetivo é ensinar, não quebrar o código.
2. **Varie os Perfis**: Crie desde clientes "tech-savvy" até clientes que mal sabem usar o WhatsApp.
3. **Use Sub-intenções**: Diferencie atraso de logística, defeito de fábrica e arrependimento de compra.
