const { spawn, execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;
const NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels';

/**
 * Aggressive Ngrok cleanup: kills all ngrok processes and reclaims ports 4040 & 8080
 * Ensures a clean slate before starting new tunnel
 */
function cleanNgrokCompletely() {
    console.log('\x1b[36m%s\x1b[0m', '🔪 Limpeza agressiva de processos Ngrok via Sistema Operacional...');

    try {
        // Force kill port 8080 using system commands (more reliable on WSL than npx kill-port)
        execSync('fuser -k 8080/tcp', { stdio: 'ignore' });
        console.log('\x1b[90m%s\x1b[0m', '   ✓ Porta 8080 liberada (fuser)');
    } catch (e) {
        // fuser returns non-zero if no process was found, which is fine
    }

    try {
        execSync('fuser -k 4040/tcp', { stdio: 'ignore' });
        console.log('\x1b[90m%s\x1b[0m', '   ✓ Porta 4040 liberada (fuser)');
    } catch (e) { }

    // Fallback to npx kill-port just in case fuser isn't there
    try { execSync('npx kill-port 8080', { stdio: 'ignore' }); } catch (e) { }
    try { execSync('npx kill-port 4040', { stdio: 'ignore' }); } catch (e) { }

    // Kill ngrok binary
    try {
        execSync('killall -9 ngrok', { stdio: 'ignore' });
        console.log('\x1b[90m%s\x1b[0m', '   ✓ Processos Ngrok terminados');
    } catch (e) { }

    // Wait loop to ensure port 8080 is actually free
    const start = Date.now();
    while (Date.now() - start < 3000) {
        // Blocking wait to let OS reclaim sockets
    }

    console.log('\x1b[32m%s\x1b[0m', '✅ Portas liberadas e prontas.\n');
}

/**
 * Polls the Ngrok local API to retrieve the public URL
 */
async function getNgrokUrl() {
    return new Promise((resolve, reject) => {
        const req = http.get(NGROK_API_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.tunnels && response.tunnels.length > 0) {
                        resolve(response.tunnels[0].public_url);
                    } else {
                        reject('Nenhum túnel ativo encontrado ainda...');
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
    });
}

async function waitForTunnel() {
    let retries = 20; // Try for 20 seconds
    while (retries > 0) {
        try {
            const url = await getNgrokUrl();
            if (url) return url;
        } catch (e) {
            // Wait 1s and retry
            await new Promise(r => setTimeout(r, 1000));
        }
        process.stdout.write('.');
        retries--;
    }
    throw new Error('Timeout aguardando URL do Ngrok (verifique sua conexão ou token)');
}

function startDevTunnel() {
    const authToken = process.env.NGROK_AUTHTOKEN;

    if (!authToken) {
        console.error('\x1b[31m%s\x1b[0m', '❌ ERRO: NGROK_AUTHTOKEN não encontrado no arquivo .env');
        console.log('\x1b[33m%s\x1b[0m', '➜ Adicione NGROK_AUTHTOKEN=seu_token no arquivo .env para continuar.');
        process.exit(1);
    }

    // 1. Aggressive cleanup
    cleanNgrokCompletely();

    // 2. Start Next.js dev server
    console.log('\x1b[36m%s\x1b[0m', `🚀 Iniciando servidor de desenvolvimento na porta ${PORT}...`);
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
        console.error('\x1b[31m%s\x1b[0m', '❌ Falha ao iniciar o servidor de desenvolvimento:', err);
        process.exit(1);
    });

    // 3. Start Ngrok manually via npx
    console.log('\x1b[36m%s\x1b[0m', '🚀 Iniciando túnel Ngrok (via npx)...');

    // NOTE: Using 'inherit' for stdio would mess up our console box, so we ignore it or pipe it logs are needed
    // We add the authtoken explicitly or rely on config, but environment variable NGROK_AUTHTOKEN should work for npx ngrok too
    const ngrokProcess = spawn('npx', ['ngrok', 'http', PORT.toString()], {
        stdio: 'ignore', // We don't want ngrok's TUI taking over
        shell: true,
        env: {
            ...process.env,
            NGROK_AUTHTOKEN: authToken
        }
    });

    ngrokProcess.on('error', (err) => {
        console.error('\x1b[31m%s\x1b[0m', '❌ Falha ao iniciar Ngrok:', err);
    });

    // 4. Poll for the URL
    console.log('\x1b[90m%s\x1b[0m', '⏳ Aguardando URL do túnel...');

    waitForTunnel().then(url => {
        console.clear();
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
    }).catch(err => {
        console.error('\n\x1b[31m%s\x1b[0m', err.message);
        cleanupAndExit();
    });

    // Valid Clean Exit
    const cleanupAndExit = () => {
        console.log('\n\x1b[33m%s\x1b[0m', '🛑 Encerrando túnel e servidor...');
        try {
            if (devServer) process.kill(-devServer.pid); // Kill process group if possible
        } catch (e) {
            devServer.kill();
        }

        try {
            // Specific kill for the ngrok process we started
            // Since we use shell:true, the pid might be the shell. 
            // Just aggressive cleanup again is safest.
            execSync('killall -9 ngrok', { stdio: 'ignore' });
        } catch (e) { }

        process.exit(0);
    };

    process.on('SIGINT', cleanupAndExit);
    process.on('SIGTERM', cleanupAndExit);
}

startDevTunnel();
