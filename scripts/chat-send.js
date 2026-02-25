const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPaths = [
    path.resolve(__dirname, '../.env.sandbox'),
    path.resolve(__dirname, '../.env')
];
const env = {};

envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach(line => {
            const t = line.trim();
            if (!t || t.startsWith('#')) return;
            const idx = t.indexOf('=');
            if (idx === -1) return;
            const key = t.slice(0, idx).trim();
            const val = t.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
            if (!env[key]) env[key] = val;
        });
    }
});

const CUSTOMER_PHONE = '5585999999999';
const APP_SECRET = env.WHATSAPP_APP_SECRET || '';

function sendMessage(text) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            object: "whatsapp_business_account",
            entry: [
                {
                    id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
                    changes: [
                        {
                            value: {
                                messaging_product: "whatsapp",
                                metadata: {
                                    display_phone_number: "15555555555",
                                    phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || "mock_sandbox_phone_number_id"
                                },
                                contacts: [{ profile: { name: "Manual Tester" }, wa_id: CUSTOMER_PHONE }],
                                messages: [
                                    {
                                        from: CUSTOMER_PHONE,
                                        id: "wamid.MANUAL" + Date.now(),
                                        timestamp: Math.floor(Date.now() / 1000).toString(),
                                        text: { body: text },
                                        type: "text"
                                    }
                                ]
                            },
                            field: "messages"
                        }
                    ]
                }
            ]
        });

        const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
        };

        if (APP_SECRET) {
            const signature = crypto
                .createHmac("sha256", APP_SECRET)
                .update(payload)
                .digest("hex");
            headers["x-hub-signature-256"] = `sha256=${signature}`;
        }

        const options = {
            hostname: 'localhost',
            port: 8081,
            path: '/api/webhook',
            method: 'POST',
            headers: headers
        };

        const req = http.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log('\x1b[90m[DEBUG] Mensagem entregue ao webhook. Aguardando processamento do Cadu...\x1b[0m');
                resolve();
            } else {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.error(`\x1b[31m❌ Erro ao enviar para o webhook (Status ${res.statusCode}):\x1b[0m`, data);
                    resolve();
                });
            }
        });

        req.on('error', (e) => {
            console.error(`\x1b[31m❌ Erro de conexão:\x1b[0m ${e.message}`);
            resolve();
        });

        req.write(payload);
        req.end();
    });
}

const args = process.argv.slice(2);
if (args.length > 0) {
    const text = args.join(' ');
    console.log(`\x1b[36m→ Enviando:\x1b[0m ${text}`);
    sendMessage(text).then(() => process.exit(0));
} else {
    console.log('Usage: node chat-send.js "sua mensagem aqui"');
    process.exit(1);
}
