# Debug: Passo-a-Passo Prático

> Você disse: "número de teste já está respondendo minhas mensagens mas apenas no local, não diretamente no meu wpp"

Isto significa:
- ✅ Webhook recebe sua mensagem
- ✅ Sistema gera resposta e envia para Meta API
- ✅ Meta API responde com 200 OK + messageID
- ✅ Resposta é salva no banco (aparece no dashboard local)
- ❌ **Mas a resposta não chega no seu WhatsApp real**

Vamos descobrir por quê.

---

## 🔍 Teste 1: Observar o que a Meta está fazendo

### Passo 1: Abrir 2 terminais

**Terminal A:** Rodar app e observar logs
```bash
cd ~/wpp-conversion-agent
npm run dev
```

Você deve ver algo como:
```
> next dev

▲ Next.js 16.1.6
- Local:        http://localhost:3001

Ready in 1.234s
```

**Terminal B:** Outro terminal (mantém rodando)
```bash
# Fica observando os logs em tempo real
# (você continuará vendo os logs do Terminal A)
```

### Passo 2: Enviar mensagem de teste

Você pode fazer isso de **3 formas**:

#### Opção A: Do seu celular (natural)
1. Abra WhatsApp
2. Comece conversa com o número de teste
3. Envie qualquer mensagem (ex: "Olá teste")

#### Opção B: Via curl (mais controlado)
```bash
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste"
```

Resposta esperada:
```json
{
  "status": "success",
  "to": "5585985963329",
  "text": "Olá teste",
  "httpStatus": 200,
  "messageId": "wamid...."
}
```

#### Opção C: Via PostMan/Insomnia
- GET: `http://localhost:3000/api/test-send?to=5585985963329&text=Teste`

### Passo 3: Observar o console

**Você deve ver em sequência:**

```
[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP]   - Para: 5585985963329
[WHATSAPP]   - Texto: "Olá teste"
[WHATSAPP]   - URL: https://graph.facebook.com/v18.0/983563674841785/messages
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso
[WHATSAPP]   - Message ID: wamid.HBEUGoZFDdjO...
```

Se até aqui tudo é 200 OK, **a API aceitou a mensagem**. Problema está depois.

### Passo 4: Aguardar 5-10 segundos

A Meta envia um **webhook de status** informando se a mensagem foi entregue.

**Você deve ver algo como:**

```
[WEBHOOK] 📥 POST recebido
[WEBHOOK] 📦 Payload JSON: {"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messaging_product":"whatsapp","statuses":[{"id":"wamid.HBEUGoZFDdjO...","status":"sent","timestamp":"..."}]}}]}]}
[WEBHOOK] 📶 Status Update: [{"id":"wamid.HBEUGoZFDdjO...","status":"sent","timestamp":"..."}]
```

---

## 📊 Interpretar os Logs de Status

### Cenário A: ✅ Sucesso

```
[WEBHOOK] 📶 Status Update: [...,"status":"delivered"...]
```

**Significado:** Sua resposta chegou no celular! ✅

**Se não vê no celular:**
- Verificar se chegou outra mensagem (procurar na conversa)
- Pode estar em "Mensagens do Grupo" se número é grupo
- Reiniciar WhatsApp

### Cenário B: ⏳ Esperando

```
[WEBHOOK] 📶 Status Update: [...,"status":"sent"...]
```

**Significado:** Meta enviou para a rede, celular não confirmou entrega ainda.

**Ação:** Aguardar 10-30 segundos. Deve virar "delivered".

### Cenário C: ❌ Falha

```
[WEBHOOK] 📶 Status Update: [...,"status":"failed",...,"errors":[{"code":131026,"title":"RESOURCE_NOT_AVAILABLE"}]...]
```

**Significado:** A Meta não conseguiu entregar.

**Código de erro:** 131026 = "Recurso não disponível"

---

## 🔧 Teste 2: Identificar o Código de Erro Exato

Se você viu "failed" no teste anterior, **anote o código de erro** (ex: 131026).

### Os erros mais comuns:

| Código | Erro | Causa | Solução |
|--------|------|-------|---------|
| **131026** | RESOURCE_NOT_AVAILABLE | Número desativado | Re-adicionar número na Meta |
| **131028** | USER_UNSUBSCRIBED | Janela 24h fechou | Usar templates ou usuário envia primeiro |
| **131003** | UNDELIVERABLE | Número inválido | Verificar formato (55 + 8/9) |
| **131051** | RATE_LIMIT | Muitas mensagens | Adicionar delay entre envios |

Se é **131026**:
1. Seu número foi desativado na Meta
2. Ir para: https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/configuration
3. Procurar **"Recipient Test Numbers"** ou **"To Numbers"**
4. Se número está lá, **remove** e **re-adiciona**
5. Meta pedirá SMS → Digita código
6. Status fica "Active"
7. Tenta enviar de novo

Se é **131028**:
1. A janela 24h está fechada
2. Teste com **template** em vez de texto livre
3. Execute: `curl "http://localhost:3000/api/test-template?to=5585985963329"`
4. Template sempre funciona fora da janela

---

## 🎯 Teste 3: Testar com Template (Descarta Problema Janela)

Templates **nunca falham por janela 24h**. Se template funciona mas texto não:
- Problema é 100% a janela 24h
- Solução: Enviar template ou aguardar usuário responder

### Executar:

```bash
curl "http://localhost:3000/api/test-template?to=5585985963329"
```

Resposta:
```json
{
  "status": "success",
  "template": "hello_world",
  "messageId": "wamid...."
}
```

**Observar console por status:**

```
[TEST-TEMPLATE] 📤 Enviando template hello_world...
[TEST-TEMPLATE] HTTP 200 OK
[TEST-TEMPLATE] ✅ Template enviado com sucesso

[... aguardar 5-10s ...]

[WEBHOOK] 📶 Status Update: [...,"status":"delivered"...]
```

### Se template funcionou:
- ✅ Seu token está correto
- ✅ Número está correto
- ✅ Problema é a **janela 24h** (para texto livre)

### Se template também falhou:
- ❌ Problema é mais grave (número desativado, token inválido, etc)
- Anote o código de erro e procure na tabela acima

---

## 🚨 Teste 4: Verificar Número na Meta Dashboard

### Passos:

1. Acesse: https://developers.facebook.com/apps/{SEU_APP_ID}/whatsapp-business/configuration

2. Procure por **"Recipient Test Numbers"** ou **"To Numbers"** ou **"Test Numbers"**

3. Seu número `5585985963329` está lá?
   - [ ] Sim, com status **Active/Verified**
   - [ ] Sim, mas com status **Inactive/Expired**
   - [ ] Não está lá

4. Se status é "Inactive/Expired":
   - Clique em **remover** (delete)
   - Clique em **adicionar novo número**
   - Coloque seu número
   - Meta envia SMS → Você recebe código
   - Digita código na interface
   - Status fica **Active**

5. Se número não está lá:
   - Clique em **adicionar número**
   - Coloque seu número: `5585985963329`
   - Meta envia SMS
   - Digita código
   - Aguardar "Active"

---

## 📋 Checklist de Debug

Execute em ordem:

- [ ] **Passo 1:** Enviar teste e observar logs até "200 OK"
- [ ] **Passo 2:** Aguardar 5-10s e procurar por logs de status webhook
- [ ] **Passo 3:** Se viu "failed", anotar código de erro (ex: 131026)
- [ ] **Passo 4:** Consultar tabela de erros e aplicar solução
- [ ] **Passo 5:** Re-adicionar número na Meta se era 131026
- [ ] **Passo 6:** Se texto não funciona, testar template (Teste 3)
- [ ] **Passo 7:** Verificar número no dashboard Meta (Teste 4)
- [ ] **Passo 8:** Se template funciona, problema é janela 24h (normal)

---

## 💡 Dicas Importantes

### Dica 1: Janela 24h é Normal

Depois que a conversa é iniciada:
- Você pode **responder** com texto livre por 24h
- Depois de 24h, você só pode enviar **templates**
- Quando você recebe uma mensagem, a janela **abre de novo**

**Fluxo correto:**
1. Você envia mensagem do celular
2. Seu sistema responde (text livre) ✅
3. Você responde de novo (text livre) ✅
4. ... 24h depois ...
5. Você envia outra mensagem (text livre) ✅ ← Janela abre
6. Seu sistema responde (text livre) ✅

### Dica 2: Logs são Amigos

Se você não entender algo, procure nos logs:
- `[WHATSAPP]` = Informações de envio para Meta
- `[WEBHOOK]` = Informações do webhook (recebimento)
- `[ENGINE]` = Informações da análise (intenção)

### Dica 3: Testando

Sempre teste com seu próprio número que você pode receber:
- ✅ Seu celular pessoal
- ❌ Número de terceiro (pode estar bloqueado)

---

## ❓ Se Ainda Não Funcionar

Envie-me **exatamente estes 3 logs** (copie do console):

1. **Log de envio (HTTP 200)**
   ```
   [WHATSAPP] 📤 Enviando mensagem...
   [WHATSAPP] HTTP 200 OK
   [WHATSAPP] ✅ Mensagem enviada com sucesso
   [WHATSAPP]   - Message ID: wamid.ABC123XYZ
   ```

2. **Log de status webhook (se houver)**
   ```
   [WEBHOOK] 📶 Status Update: [{"id":"wamid.ABC123XYZ","status":"failed","errors":[{"code":131026,...}]}]
   ```

3. **Seu número de teste**
   ```
   5585985963329
   ```

Com esses 3 dados, posso ajudar rapidamente!

---

## 🎯 Próximo Passo

Comece pelo **Teste 1** agora. Execute os passos, observe o console, e **me conte qual status webhook você vê** (sent, delivered, failed, ou nada).

Depois podemos ir para os outros testes conforme necessário.
