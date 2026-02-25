import Database from 'better-sqlite3';

const db = new Database('./prisma/sandbox.db');
const rows = db.prepare('SELECT id, message_count, length(langgraph_state) as state_size FROM Conversation ORDER BY started_at DESC LIMIT 10').all();

console.log("Recent 10 Conversations Sizes in Sandbox DB:");
for (const row of rows) {
    console.log(`ID: ${row.id} | Msgs: ${row.message_count} | Size: ${row.state_size || 0} bytes`);
}
