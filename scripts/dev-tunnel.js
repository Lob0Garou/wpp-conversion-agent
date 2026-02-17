const ngrok = require('ngrok');
const { spawn, execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;

async function getRunningTunnels() {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 4040,
            path: '/api/tunnels',
            method: 'GET',
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const tunnels = JSON.parse(data).tunnels;
                    resolve(tunnels);
                } catch (e) {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.end();
    });
}

function killPort(port) {
    try {
        // Try cross-platform kill via npx kill-port
        // Using execSync to block until done
        console.log(`🧹 Limpando porta ${port}...`);
        execSync(`npx kill-port ${port}`, { stdio: 'ignore' });
    } catch (e) {
        // Ignore error if port not in use or npx fails
    }
}

/**
 * Aggressive Ngrok cleanup: kills all ngrok processes and reclaims ports 4040 & 8080
 * Ensures a clean slate before starting new tunnel
 */
function cleanNgrokCompletely() {
    console.log('\x1b[36m%s\x1b[0m', '🔪 Limpeza agressiva de processos Ngrok...');

    // 1. Kill port 4040 (ngrok API endpoint)
    try {
        execSync('npx kill-port 4040', { stdio: 'ignore' });
        console.log('\x1b[90m%s\x1b[0m', '   ✓ Porta 4040 limpa');
    } catch (e) { }

    // 2. Kill port 8080 (our Next.js dev server)
    try {
        execSync('npx kill-port 8080', { stdio: 'ignore' });
        console.log('\x1b[90m%s\x1b[0m', '   ✓ Porta 8080 limpa');
    } catch (e) { }

    // 3. Kill ngrok processes by name (Linux/WSL2)
    try {
        execSync('pkill -f "ngrok|tunnel"', { stdio: 'ignore' });
        console.log('\x1b[90m%s\x1b[0m', '   ✓ Processos Ngrok/Tunnel terminados');
    } catch (e) { }

    // 4. Small delay to let OS reclaim ports (critical for WSL2 timing)
    const start = Date.now();
    while (Date.now() - start < 2000) { } // 2s blocking wait

    console.log('\x1b[32m%s\x1b[0m', '✅ Limpeza completa concluída\n');
}

async function startDevTunnel() {
    const authToken = process.env.NGROK_AUTHTOKEN;

    if (!authToken) {
        console.error('\x1b[31m%s\x1b[0m', '❌ ERRO: NGROK_AUTHTOKEN não encontrado no arquivo .env');
        console.log('\x1b[33m%s\x1b[0m', '➜ Adicione NGROK_AUTHTOKEN=seu_token no arquivo .env para continuar.');
        process.exit(1);
    }

    // CRITICAL: Aggressive cleanup before starting anything
    cleanNgrokCompletely();

    // Start the Next.js dev server immediately
    console.log('\x1b[36m%s\x1b[0m', `🚀 Iniciando servidor de desenvolvimento na porta ${PORT}...`);

    // NOTE: Switched to 'npx next dev' without 'exec' to see if it handles signals better
    // Removed --no-turbopack as it is not a valid option
    const devServer = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', PORT.toString()], {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd(),  // ← EXPLICIT: force cwd context
        env: {
            ...process.env,
            PORT: PORT.toString(),
            TURBOPACK: '0',
            NEXT_SKIP_BUILD: '0',
            // Bypass Next.js workspace detection (WSL2 issue fix)
            NEXT_PRIVATE_ROOT: process.cwd(),
            // Tell Turbopack to use only current dir
            TURBOPACK_ROOT: process.cwd(),
        }
    });

    devServer.on('error', (err) => {
        console.error('\x1b[31m%s\x1b[0m', '❌ Falha ao iniciar o servidor de desenvolvimento:', err);
        process.exit(1);
    });

    try {
        // After aggressive cleanup, attempt new tunnel connection
        // If this fails, it's a real error (auth, network, etc.), not a zombie process
        let url;
        try {
            url = await ngrok.connect({
                addr: PORT,
                authtoken: authToken,
            });
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', '❌ Ngrok connection failed even after cleanup');
            console.error('\x1b[31m%s\x1b[0m', `   Erro: ${error.message}`);
            console.log('\x1b[33m%s\x1b[0m', '\n💡 Verifique:');
            console.log('\x1b[33m%s\x1b[0m', '   1. NGROK_AUTHTOKEN válido no .env');
            console.log('\x1b[33m%s\x1b[0m', '   2. Conexão de internet');
            console.log('\x1b[33m%s\x1b[0m', '   3. Portas 4040 e 8080 livres (use: lsof -i :4040)');
            process.exit(1);
        }

        // Clear console and print header
        console.clear();

        // Nice formatted box
        console.log('\x1b[32m%s\x1b[0m', '┌──────────────────────────────────────────────────────────────┐');
        console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
        console.log('\x1b[32m%s\x1b[0m', '│   ✅ NGROK TUNNEL ATIVO!                                     │');
        console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
        console.log('\x1b[32m%s\x1b[0m', `│   Public URL: ${url}                 │`);
        console.log('\x1b[32m%s\x1b[0m', `│   Local:      http://localhost:${PORT}                          │`);
        console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
        console.log('\x1b[32m%s\x1b[0m', '│   👉 Cole a URL acima na Meta para Webhooks.                 │');
        console.log('\x1b[32m%s\x1b[0m', '│      Ex: ' + url + '/api/webhook              │');
        console.log('\x1b[32m%s\x1b[0m', '│                                                              │');
        console.log('\x1b[32m%s\x1b[0m', '└──────────────────────────────────────────────────────────────┘');
        console.log('\n');
        console.log('\x1b[90m%s\x1b[0m', '⬇️ LOGS DO SERVIDOR E WEBHOOK ABAIXO ⬇️');
        console.log('\x1b[90m%s\x1b[0m', '────────────────────────────────────────');

        // Handle clean exit
        process.on('SIGINT', async () => {
            console.log('\n\x1b[33m%s\x1b[0m', '🛑 Encerrando túnel e servidor...');
            await ngrok.kill(); // Kill the one we manage
            devServer.kill();
            process.exit(0);
        });

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '❌ Erro ao iniciar o túnel:', error);
        // process.exit(1); 
    }
}

startDevTunnel();
