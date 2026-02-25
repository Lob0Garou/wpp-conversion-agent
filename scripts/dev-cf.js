/**
 * dev-cf.js — Inicia o servidor Next.js no Windows e instrui a abrir o tunnel no WSL.
 *
 * Arquitetura real:
 *   Windows: Next.js (porta 8080) ← este script
 *   WSL:     cloudflared tunnel → http://<gateway-windows>:8080
 *
 * Uso:
 *   npm run dev:cf        ← roda no Windows (PowerShell/CMD)
 *
 * Para o tunnel (rodar separado no WSL):
 *   npm run dev:cf:tunnel  ← roda no WSL
 */

const { spawn, execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;

// ─────────────────────────────────────────
// 1. Cleanup (Windows)
// ─────────────────────────────────────────
function cleanPorts() {
    console.log('\x1b[36m%s\x1b[0m', '🔪 Limpando ambiente...');

    // Kill port 8080 on Windows
    try {
        execSync(`powershell -NoProfile -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force"`, { stdio: 'ignore' });
    } catch (e) { }

    // Also try npx kill-port
    try { execSync(`npx kill-port ${PORT}`, { stdio: 'ignore' }); } catch (e) { }

    const start = Date.now();
    while (Date.now() - start < 2000) { }

    console.log('\x1b[90m%s\x1b[0m', '   ✓ Porta 8080 liberada');
}

// ─────────────────────────────────────────
// 2. Start Next.js (Windows)
// ─────────────────────────────────────────
async function startServer() {
    console.log('\x1b[36m%s\x1b[0m', `🚀 Iniciando Next.js na porta ${PORT}...`);

    const devServer = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', PORT.toString()], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
            ...process.env,
            PORT: PORT.toString(),
            TURBOPACK: '0',
            NEXT_SKIP_BUILD: '0',
        }
    });

    devServer.on('error', (err) => {
        console.error('\x1b[31m%s\x1b[0m', '❌ Falha ao iniciar Next.js:', err.message);
        process.exit(1);
    });

    // Wait for server to respond
    console.log('\x1b[90m%s\x1b[0m', '⏳ Aguardando servidor...');

    for (let i = 0; i < 60; i++) {
        try {
            await new Promise((resolve, reject) => {
                http.get(`http://localhost:${PORT}`, { timeout: 2000 }, (res) => {
                    if (res.statusCode < 500) resolve();
                    else reject();
                    res.resume();
                }).on('error', reject).on('timeout', reject);
            });
            console.log('\x1b[32m%s\x1b[0m', `   ✅ Servidor online! http://localhost:${PORT}`);
            return devServer;
        } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
            process.stdout.write('.');
        }
    }

    throw new Error(`Timeout: Next.js não respondeu em 60s`);
}

// ─────────────────────────────────────────
// 3. Webhook Validation (via public URL in .tunnel_url)
// ─────────────────────────────────────────
async function validateWebhook(baseUrl) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'TEST_TOKEN';
    const challenge = '123';
    const verifyUrl = `${baseUrl}/api/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`;

    console.log('\x1b[36m%s\x1b[0m', '🕵️ Validando Webhook via URL pública...');

    return new Promise((resolve) => {
        https.get(verifyUrl, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 && data.trim() === challenge) {
                    console.log('\x1b[32m%s\x1b[0m', '   ✅ Webhook validado! (200 OK)');
                    resolve(true);
                } else {
                    console.log('\x1b[33m%s\x1b[0m', `   ⚠️ Webhook: HTTP ${res.statusCode}`);
                    resolve(false);
                }
            });
        }).on('error', () => resolve(false));
    });
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────
async function main() {
    let devServerProcess;
    let wslTunnelProcess;

    try {
        cleanPorts();
        devServerProcess = await startServer();

        console.log('\x1b[36m%s\x1b[0m', '☁️  Iniciando Cloudflare Tunnel (via WSL)...');

        let publicUrl = null;

        // Spawn WSL process directly
        // wsl npm run dev:cf:tunnel
        wslTunnelProcess = spawn('wsl', ['npm', 'run', 'dev:cf:tunnel'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        // Capture URL from WSL output
        await new Promise((resolve, reject) => {
            const onData = (data) => {
                const output = data.toString();
                // Match URL from dev-cf-tunnel.js output
                const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (match) {
                    publicUrl = match[0];
                    resolve();
                }
                // Stream stderr to console for debugging
                if (process.env.DEBUG) process.stdout.write(output);
            };

            wslTunnelProcess.stdout.on('data', onData);
            wslTunnelProcess.stderr.on('data', onData);

            wslTunnelProcess.on('error', err => reject(err));

            // Timeout 30s
            setTimeout(() => {
                if (!publicUrl) reject(new Error('Timeout aguardando URL do Cloudflare (WSL).'));
            }, 30000);
        });

        let webhookOk = false;
        if (publicUrl) {
            webhookOk = await validateWebhook(publicUrl);
        }

        console.clear();
        console.log('\x1b[32m%s\x1b[0m', '┌──────────────────────────────────────────────────────────────────┐');
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', '│   ✅ CLOUDFLARE TUNNEL ATIVO! (WSL Integrado)                    │');
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', `│   Local:    http://localhost:${PORT}`.padEnd(68) + '│');
        console.log('\x1b[32m%s\x1b[0m', `│   Túnel:    ${publicUrl}`.padEnd(68) + '│');
        console.log('\x1b[32m%s\x1b[0m', `│   Webhook:  ${webhookOk ? '✅ Validado' : '⚠️  Não validado'}`.padEnd(68) + '│');
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', '│   👉 Cole no Meta → Webhooks:                                    │');
        console.log('\x1b[32m%s\x1b[0m', `│   ${(publicUrl + '/api/webhook').padEnd(65)}│`);
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', '└──────────────────────────────────────────────────────────────────┘');
        console.log('\n\x1b[90m%s\x1b[0m', '⬇️  LOGS DO SERVIDOR ABAIXO ⬇️');
        console.log('\x1b[90m%s\x1b[0m', '─────────────────────────────────');

        // Pipe server logs
        devServerProcess.stdout.pipe(process.stdout);
        devServerProcess.stderr.pipe(process.stderr);

    } catch (error) {
        console.error('\n\x1b[31m%s\x1b[0m', '❌ Erro fatal:', error.message);
        if (devServerProcess) try { devServerProcess.kill(); } catch (e) { }
        if (wslTunnelProcess) try { wslTunnelProcess.kill(); } catch (e) { }
        process.exit(1);
    }

    const cleanup = () => {
        console.log('\n\x1b[33m%s\x1b[0m', '🛑 Encerrando servidor e túnel...');
        if (devServerProcess) try { devServerProcess.kill(); } catch (e) { }
        if (wslTunnelProcess) try { wslTunnelProcess.kill(); } catch (e) { }
        // Ensure WSL process is killed deeply
        try { execSync('wsl pkill -f cloudflared', { stdio: 'ignore' }); } catch (e) { }
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

main();
