const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./tests_harness/test_harness.db', sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error(err.message);
        return;
    }

    db.all('SELECT id, message_count, length(langgraph_state) as state_size FROM Conversation ORDER BY started_at DESC LIMIT 10;', [], (err, rows) => {
        if (err) {
            throw err;
        }
        console.log("Size of langgraph_state payload in recent conversations:");
        rows.forEach((row) => {
            console.log(`ID: ${row.id} | Msg Count: ${row.message_count} | Payload Size: ${row.state_size || 0} bytes`);
        });

        db.close();
    });
});
