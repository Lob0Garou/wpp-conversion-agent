/**
 * dev-all.js — Orquestrador único. Roda no Windows.
 *
 * Faz tudo em sequência:
 *   1. Limpa porta 8080 + cloudflared
 *   2. Sobe Next.js (Windows)
 *   3. Aguarda servidor responder
 *   4. Dispara cloudflared via WSL (wsl node scripts/dev-cf-tunnel.js)
 *   5. Aguarda .tunnel_url ser escrito pelo script WSL
 *   6. Valida webhook externamente
 *   7. Imprime box final
 *
 * Uso:
 *   npm run dev:all
 */

const { spawn, execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;
const TUNNEL_FILE = path.resolve(process.cwd(), '.tunnel_url');

const G = '\x1b[32m';
const Y = '\x1b[33m';
const C = '\x1b[36m';
const R = '\x1b[31m';
const D = '\x1b[90m';
const X = '\x1b[0m';

// ─────────────────────────────────────────
// 1. Cleanup (Windows)
// ─────────────────────────────────────────
function cleanAll() {
    console.log(`${C}🔪 Limpando ambiente...${X}`);

    // Kill port 8080 on Windows
    try {
        execSync(
            `powershell -NoProfile -Command "` +
            `Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess ` +
            `-ErrorAction SilentlyContinue | Stop-Process -Force"`,
            { stdio: 'ignore' }
        );
    } catch (e) { }

    // Kill cloudflared in WSL
    try { execSync('wsl pkill -f cloudflared', { stdio: 'ignore' }); } catch (e) { }

    // Remove stale tunnel URL file
    try { fs.unlinkSync(TUNNEL_FILE); } catch (e) { }

    // Wait for OS to reclaim ports
    const start = Date.now();
    while (Date.now() - start < 2000) { }

    console.log(`${D}   ✓ Porta 8080 liberada${X}`);
    console.log(`${D}   ✓ cloudflared antigo removido${X}`);
}

// ─────────────────────────────────────────
// 2. Probe local server
// ─────────────────────────────────────────
function probeServer() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${PORT}`, { timeout: 2000 }, (res) => {
            resolve(res.statusCode < 500);
            res.resume();
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

// ─────────────────────────────────────────
// 3. Start Next.js (Windows)
// ─────────────────────────────────────────
async function startNextJs() {
    console.log(`${C}🚀 Iniciando Next.js na porta ${PORT}...${X}`);

    const server = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', String(PORT)], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT: String(PORT), TURBOPACK: '0' }
    });

    server.on('error', (err) => {
        console.error(`${R}❌ Falha ao iniciar Next.js: ${err.message}${X}`);
        process.exit(1);
    });

    // Wait up to 60s for server to respond
    console.log(`${D}⏳ Aguardando servidor (timeout 60s)...${X}`);
    for (let i = 0; i < 60; i++) {
        if (await probeServer()) {
            console.log(`${G}   ✅ Servidor online! http://localhost:${PORT}${X}`);
            return server;
        }
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
    }
    process.stdout.write('\n');
    throw new Error(`Timeout: Next.js não respondeu em 60s na porta ${PORT}`);
}

// ─────────────────────────────────────────
// 4. Start cloudflared tunnel via WSL
// ─────────────────────────────────────────
function startTunnelViaWsl() {
    console.log(`${C}☁️  Iniciando cloudflared via WSL...${X}`);

    // Convert Windows path to WSL path (handles special chars like accents)
    let wslProject;
    try {
        wslProject = execSync(`wsl wslpath -u "${process.cwd().replace(/\\/g, '/')}"`, { encoding: 'utf8' }).trim();
    } catch (e) {
        // Fallback: manual conversion C:\foo → /mnt/c/foo
        wslProject = process.cwd()
            .replace(/\\/g, '/')
            .replace(/^([A-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    }

    const tunnel = spawn('wsl', [
        'bash', '-c',
        `cd '${wslProject}' && node scripts/dev-cf-tunnel.js`
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
    });

    tunnel.stdout.on('data', (d) => {
        const line = d.toString().replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (line) console.log(`${D}   [wsl] ${line}${X}`);
    });
    tunnel.stderr.on('data', (d) => {
        const line = d.toString().replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (line) console.log(`${D}   [wsl] ${line}${X}`);
    });

    tunnel.on('error', (err) => {
        console.error(`${R}❌ Falha ao iniciar tunnel WSL: ${err.message}${X}`);
    });

    return tunnel;
}

// ─────────────────────────────────────────
// 5. Wait for .tunnel_url to appear
// ─────────────────────────────────────────
async function waitForTunnelUrl(timeoutMs = 40000) {
    console.log(`${D}⏳ Aguardando URL do tunnel (timeout 40s)...${X}`);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (fs.existsSync(TUNNEL_FILE)) {
            const url = fs.readFileSync(TUNNEL_FILE, 'utf-8').trim();
            if (url && url.startsWith('https://')) {
                console.log(`${G}   ✅ URL capturada: ${url}${X}`);
                return url;
            }
        }
        await new Promise(r => setTimeout(r, 500));
        process.stdout.write('.');
    }
    process.stdout.write('\n');
    throw new Error('Timeout: cloudflared não gerou URL em 40s. Verifique WSL e cloudflared.');
}

// ─────────────────────────────────────────
// 6. Validate webhook
// ─────────────────────────────────────────
function validateWebhook(baseUrl) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'TEST_TOKEN';
    const challenge = '123';
    const url = `${baseUrl}/api/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`;

    console.log(`${C}🕵️  Validando webhook...${X}`);

    return new Promise((resolve) => {
        https.get(url, { timeout: 8000 }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const ok = res.statusCode === 200 && data.trim() === challenge;
                resolve(ok);
            });
        }).on('error', () => resolve(false));
    });
}

// ─────────────────────────────────────────
// 7. Print final box
// ─────────────────────────────────────────
function printBox(publicUrl, webhookOk) {
    const callbackUrl = `${publicUrl}/api/webhook`;
    const token = process.env.WHATSAPP_VERIFY_TOKEN || 'TEST_TOKEN';

    console.clear();
    console.log(`${G}┌──────────────────────────────────────────────────────────────────┐${X}`);
    console.log(`${G}│                                                                  │${X}`);
    console.log(`${G}│   ✅ PROJETO INICIADO                                            │${X}`);
    console.log(`${G}│                                                                  │${X}`);
    console.log(`${G}│   🌐 Servidor:  http://localhost:${PORT}`.padEnd(69) + `│${X}`);
    console.log(`${G}│   🔗 Túnel:     ${publicUrl}`.padEnd(69) + `│${X}`);
    console.log(`${G}│   📋 Webhook:   ${webhookOk ? '✅ 200 OK (challenge ok)' : '⚠️  não validado — cheque WHATSAPP_VERIFY_TOKEN'}`.padEnd(69) + `│${X}`);
    console.log(`${G}│   🧪 Token:     WHATSAPP_VERIFY_TOKEN = "${token}"`.padEnd(69) + `│${X}`);
    console.log(`${G}│   ⏰ Status:    PRONTO PARA USAR`.padEnd(69) + `│${X}`);
    console.log(`${G}│                                                                  │${X}`);
    console.log(`${G}│   📌 Meta Callback URL:                                          │${X}`);
    console.log(`${G}│   ${callbackUrl.padEnd(65)}│${X}`);
    console.log(`${G}│                                                                  │${X}`);
    console.log(`${G}└──────────────────────────────────────────────────────────────────┘${X}`);
    console.log(`\n${D}⬇️  LOGS DO SERVIDOR ABAIXO ⬇️${X}`);
    console.log(`${D}─────────────────────────────────${X}`);
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────
async function main() {
    let nextServer;
    let tunnelProcess;

    try {
        cleanAll();

        nextServer = await startNextJs();

        tunnelProcess = startTunnelViaWsl();

        const publicUrl = await waitForTunnelUrl();

        // Webhook validation: retry 3x with 3s gap (tunnel needs ~5s to warm up)
        let webhookOk = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            webhookOk = await validateWebhook(publicUrl);
            if (webhookOk) break;
            if (attempt < 3) {
                console.log(`${D}   ↻ Webhook ainda aquecendo, aguardando 3s... (tentativa ${attempt}/3)${X}`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        if (!webhookOk) {
            console.log(`${Y}   ⚠️  Webhook não validou após 3 tentativas.${X}`);
            console.log(`${Y}   Token atual: "${process.env.WHATSAPP_VERIFY_TOKEN || 'TEST_TOKEN'}"${X}`);
            console.log(`${Y}   O projeto ainda está funcional — verifique o token no .env se necessário.${X}`);
        }

        printBox(publicUrl, webhookOk);

    } catch (err) {
        console.error(`\n${R}❌ Erro fatal: ${err.message}${X}`);
        if (nextServer) try { nextServer.kill(); } catch (e) { }
        if (tunnelProcess) try { tunnelProcess.kill(); } catch (e) { }
        try { execSync('wsl pkill -f cloudflared', { stdio: 'ignore' }); } catch (e) { }
        try { fs.unlinkSync(TUNNEL_FILE); } catch (e) { }
        process.exit(1);
    }

    const shutdown = () => {
        console.log(`\n${Y}🛑 Encerrando tudo...${X}`);
        if (nextServer) try { nextServer.kill(); } catch (e) { }
        if (tunnelProcess) try { tunnelProcess.kill(); } catch (e) { }
        try { execSync('wsl pkill -f cloudflared', { stdio: 'ignore' }); } catch (e) { }
        try { fs.unlinkSync(TUNNEL_FILE); } catch (e) { }
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main();
