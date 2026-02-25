const { spawn, execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;

/**
 * Cleanup ports 8080 (App)
 */
function cleanPorts() {
    console.log('\x1b[36m%s\x1b[0m', '🔪 Limpando porta 8080...');
    try {
        execSync('fuser -k 8080/tcp', { stdio: 'ignore' });
    } catch (e) { }
    try {
        execSync('npx kill-port 8080', { stdio: 'ignore' });
    } catch (e) { }

    // Kill existing ssh tunnels
    try {
        execSync('pkill -f "ssh -R"', { stdio: 'ignore' });
    } catch (e) { }

    // Blocking wait
    const start = Date.now();
    while (Date.now() - start < 2000) { }
    console.log('\x1b[90m%s\x1b[0m', '   ✓ Porta e processos SSH limpos');
}

function startDevSSH() {
    // 1. Cleanup
    cleanPorts();

    // 2. Start Next.js dev server
    console.log('\x1b[36m%s\x1b[0m', `🚀 Iniciando servidor Next.js na porta ${PORT}...`);
    const devServer = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', PORT.toString()], {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            PORT: PORT.toString(),
            TURBOPACK: '0',
            NEXT_SKIP_BUILD: '0',
            NEXT_PRIVATE_ROOT: process.cwd(),
            TURBOPACK_ROOT: process.cwd(),
        }
    });

    devServer.on('error', (err) => {
        console.error('\x1b[31m%s\x1b[0m', '❌ Falha ao iniciar Next.js:', err);
    });

    // 3. Start SSH Tunnel (localhost.run)
    // ssh -R 80:localhost:8080 nokey@localhost.run
    console.log('\x1b[36m%s\x1b[0m', '🚀 Iniciando túnel SSH (localhost.run)...');
    console.log('\x1b[90m%s\x1b[0m', '⏳ Aguardando URL pública...');

    const sshProcess = spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-R', `80:localhost:${PORT}`, 'nokey@localhost.run'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
    });

    let urlFound = false;

    sshProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Look for URL in output
        // output format usually: "tunneled with tls change, https://<id>.lhr.life" or similar
        const urlMatch = output.match(/(https:\/\/[a-zA-Z0-9-]+\.lhr\.life)/) || output.match(/(https:\/\/[a-zA-Z0-9-]+\.localhost\.run)/);

        if (urlMatch && !urlFound && !urlMatch[0].includes('admin.localhost.run')) {
            urlFound = true;
            const url = urlMatch[0];

            console.clear();
            console.log('\x1b[32m%s\x1b[0m', '┌──────────────────────────────────────────────────────────────┐');
            console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
            console.log('\x1b[32m%s\x1b[0m', '│   ✅ SSH TUNNEL ATIVO! (Alternative)                         │');
            console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
            console.log('\x1b[32m%s\x1b[0m', `│   Public URL: ${url}                 │`);
            console.log('\x1b[32m%s\x1b[0m', `│   Local:      http://localhost:${PORT}                          │`);
            console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
            console.log('\x1b[32m%s\x1b[0m', '│   👉 Cole a URL acima na Meta para Webhooks.                 │');
            console.log('\x1b[32m%s\x1b[0m', '│      Ex: ' + url + '/api/webhook              │');
            console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
            console.log('\x1b[32m%s\x1b[0m', '└──────────────────────────────────────────────────────────────┘');
            console.log('\n');
            console.log('\x1b[90m%s\x1b[0m', '⬇️ LOGS DO SERVIDOR ABAIXO ⬇️');
            console.log('\x1b[90m%s\x1b[0m', '────────────────────────────────────────');
        }
    });

    sshProcess.stderr.on('data', (data) => {
        // SSH sends connection info to stderr sometimes, we might parse it here too if stdout is empty
        const output = data.toString();
        if (!urlFound) {
            const urlMatch = output.match(/(https:\/\/[a-zA-Z0-9-]+\.lhr\.life)/) || output.match(/(https:\/\/[a-zA-Z0-9-]+\.localhost\.run)/);
            if (urlMatch && !urlMatch[0].includes('admin.localhost.run')) {
                urlFound = true;
                const url = urlMatch[0];
                console.clear();
                console.log('\x1b[32m%s\x1b[0m', '┌──────────────────────────────────────────────────────────────┐');
                console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
                console.log('\x1b[32m%s\x1b[0m', '│   ✅ SSH TUNNEL ATIVO! (Alternative)                         │');
                console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
                console.log('\x1b[32m%s\x1b[0m', `│   Public URL: ${url}                 │`);
                console.log('\x1b[32m%s\x1b[0m', `│   Local:      http://localhost:${PORT}                          │`);
                console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
                console.log('\x1b[32m%s\x1b[0m', '│   👉 Cole a URL acima na Meta para Webhooks.                 │');
                console.log('\x1b[32m%s\x1b[0m', '│      Ex: ' + url + '/api/webhook              │');
                console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
                console.log('\x1b[32m%s\x1b[0m', '└──────────────────────────────────────────────────────────────┘');
                console.log('\n');
                console.log('\x1b[90m%s\x1b[0m', '⬇️ LOGS DO SERVIDOR ABAIXO ⬇️');
                console.log('\x1b[90m%s\x1b[0m', '────────────────────────────────────────');
            }
        }
    });

    const cleanupAndExit = () => {
        console.log('\n\x1b[33m%s\x1b[0m', '🛑 Encerrando...');
        try { process.kill(-devServer.pid); } catch (e) { }
        try { sshProcess.kill(); } catch (e) { }
        process.exit(0);
    };

    process.on('SIGINT', cleanupAndExit);
    process.on('SIGTERM', cleanupAndExit);
}

startDevSSH();
