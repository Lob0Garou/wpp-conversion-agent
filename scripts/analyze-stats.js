const fs = require('fs');
const path = require('path');

const jsonPath = path.join(process.cwd(), 'wpp-export.json');
if (!fs.existsSync(jsonPath)) {
    console.error('Arquivo wpp-export.json não encontrado.');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const dailyStats = {};

// Pegar as últimas mensagens de cada chat
data.forEach(chat => {
    chat.messages.forEach(msg => {
        if (msg.fromMe) return; // Só contar contatos de entrada (clientes)

        const timestamp = msg.timestamp.low * 1000;
        const date = new Date(timestamp);
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!dailyStats[dateKey]) {
            dailyStats[dateKey] = new Set();
        }
        dailyStats[dateKey].add(chat.chatId);
    });
});

const sortedDates = Object.keys(dailyStats).sort();
const last30Days = sortedDates.slice(-30);

console.log('DATE,CONTACTS');
last30Days.forEach(date => {
    console.log(`${date},${dailyStats[date].size}`);
});
