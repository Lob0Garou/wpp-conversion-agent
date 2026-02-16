
const crypto = require("crypto");
const http = require("http");
require("dotenv").config({ path: ".env" });

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
                            phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "123456789"
                        },
                        contacts: [
                            {
                                profile: {
                                    name: "Test User"
                                },
                                wa_id: "5585985963329"
                            }
                        ],
                        messages: [
                            {
                                from: "5585985963329",
                                id: "wamid.TEST" + Date.now(),
                                timestamp: Math.floor(Date.now() / 1000).toString(),
                                text: {
                                    body: "Quero comprar um tenis"
                                },
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

const secret = process.env.WHATSAPP_APP_SECRET;
if (!secret) {
    console.error("Missing WHATSAPP_APP_SECRET in .env");
    process.exit(1);
}

const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

const options = {
    hostname: "localhost",
    port: 3001,
    path: "/api/webhook",
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": `sha256=${signature}`,
        "Content-Length": payload.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on("error", (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(payload);
req.end();
