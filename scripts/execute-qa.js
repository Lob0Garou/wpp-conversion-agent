const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', err => { console.log("UNCAUGHT EXCEPTION", err); process.exit(1); });
process.on('unhandledRejection', err => { console.log("UNHANDLED REJECTION", err); process.exit(1); });

// Load env explicitly
const envFile = fs.readFileSync(path.resolve(__dirname, '../.env.sandbox'), 'utf8');
const APP_SECRET = (envFile.split('\n').find(l => l.startsWith('WHATSAPP_APP_SECRET='))?.split('=')[1] || '').replace(/['"\r]/g, '').trim();
const PHONE_ID = (envFile.split('\n').find(l => l.startsWith('WHATSAPP_PHONE_NUMBER_ID='))?.split('=')[1] || '').replace(/['"\r]/g, '').trim() || 'mock_sandbox_phone_number_id';

const scenarios = [
    { name: "INFO horário", msgs: ["Quando a loja abre?"] },
    { name: "INFO endereço", msgs: ["Qual o endereco da loja?"] },
    { name: "INFO retirada", msgs: ["Consigo comprar no site e retirar agora?"] },
    { name: "Vendas catálogo", msgs: ["tem tenis nike?"] },
    { name: "Vendas estoque", msgs: ["tem tenis nike tamanho 40?"] },
    { name: "SAC atraso", msgs: ["Meu pedido esta atrasado", "Joao Silva", "pedido 123456", "nao chegou ainda"] },
    { name: "Troca contexto", msgs: ["tem meiao infantil?", "onde esta meu pedido?"] },
    { name: "Meta-feedback", msgs: ["nossa que seco"] },
    { name: "Conversa longa", msgs: ["oi", "quero ver tenis", "mas e se eu quiser azul?", "beleza", "e meia?", "tem?", "ok", "obrigado"] }
];

async function sendMsg(text, phone) {
    const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [{
                value: {
                    messaging_product: "whatsapp",
                    metadata: { display_phone_number: "15555555555", phone_number_id: PHONE_ID },
                    contacts: [{ profile: { name: "Manual Tester" }, wa_id: phone }],
                    messages: [{
                        from: phone,
                        id: "wamid.MANUAL" + Date.now() + Math.floor(Math.random() * 1000),
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        text: { body: text },
                        type: "text"
                    }]
                },
                field: "messages"
            }]
        }]
    });

    const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
    };

    if (APP_SECRET) {
        const signature = crypto.createHmac("sha256", APP_SECRET).update(payload).digest("hex");
        headers["x-hub-signature-256"] = `sha256=${signature}`;
    }

    try {
        const res = await fetch('http://127.0.0.1:8081/api/webhook', {
            method: 'POST',
            body: payload,
            headers
        });
        if (!res.ok) {
            console.log(`[HTTP ERROR] Status: ${res.status} ${await res.text()}`);
        }
        return res.status;
    } catch (e) {
        console.log(`[FETCH ERROR] ${e.message}`);
        return null;
    }
}

async function getReply(phone) {
    try {
        const res = await fetch(`http://127.0.0.1:8081/api/test/last-reply?phone=${phone}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    for (const sc of scenarios) {
        console.log(`\n\n=== RUNNING SCENARIO: ${sc.name} ===`);
        const phone = "5585" + Math.floor(10000000 + Math.random() * 90000000); // fresh phone
        let lastSig = null;

        for (const msg of sc.msgs) {
            console.log(`[USER]: ${msg}`);
            await sendMsg(msg, phone);

            // Poll for response up to 45 seconds
            let replied = false;
            for (let i = 0; i < 45 && !replied; i++) {
                await sleep(1000);
                const probe = await getReply(phone);
                if (probe && probe.found && probe.reply) {
                    const sig = probe.reply.id;
                    if (sig !== lastSig) {
                        console.log(`[CADU]: ${probe.reply.content}`);
                        lastSig = sig;
                        replied = true;
                    }
                }
            }
            if (!replied) console.log(`[TIMEOUT] No reply received for: ${msg}`);
        }
    }
}

run().catch(err => { console.log("PROMISE CATCH", err); process.exit(1); });
