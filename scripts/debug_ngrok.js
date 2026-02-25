const fs = require('fs');
const path = require('path');

try {
    const content = fs.readFileSync('ngrok_requests.json', 'utf8');
    const data = JSON.parse(content);

    console.log(`Found ${data.requests.length} requests.`);

    data.requests.forEach((req, index) => {
        const method = req.request.method;
        const uri = req.request.uri;

        if (method === 'POST' && uri.includes('/api/webhook')) {
            console.log(`\n--- Request #${index} (${method} ${uri}) ---`);

            // Try to decode body
            let body = req.request.raw;
            if (body) {
                // Ngrok API returns base64 encoded raw request usually
                try {
                    const decoded = Buffer.from(body, 'base64').toString('utf8');
                    // The raw body includes headers. We need to find the JSON part.
                    // Usually separated by \r\n\r\n
                    const parts = decoded.split('\r\n\r\n');
                    const jsonPart = parts[parts.length - 1]; // Last part is body

                    console.log("Decoded Body:", jsonPart);

                    try {
                        const json = JSON.parse(jsonPart);
                        if (json.entry) {
                            json.entry.forEach(entry => {
                                entry.changes.forEach(change => {
                                    if (change.value.statuses) {
                                        console.log("🔥 STATUS FOUND:", JSON.stringify(change.value.statuses, null, 2));
                                    } else if (change.value.messages) {
                                        console.log("📩 MESSAGE FOUND:", JSON.stringify(change.value.messages, null, 2));
                                    }
                                });
                            });
                        }
                    } catch (e) {
                        console.log("Body is not JSON or failed to parse inner JSON.");
                    }

                } catch (e) {
                    console.log("Failed to decode base64:", e.message);
                }
            } else {
                console.log("No body found.");
            }
        }
    });

} catch (e) {
    console.error("Error:", e.message);
}
