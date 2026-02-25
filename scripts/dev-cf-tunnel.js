/**
 * dev-cf-tunnel.js — Roda no WSL.
 * Detecta o IP do Windows (gateway do WSL), sobe o cloudflared tunnel
 * apontando para http://<gateway>:8080, e salva a URL em .tunnel_url.
 *
 * Uso (no terminal WSL, na pasta do projeto):
 *   node scripts/dev-cf-tunnel.js
 *   ou via package.json:
 *   npm run dev:cf:tunnel
 */

const { spawn, execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;

// ─────────────────────────────────────────
// 1. Cleanup
// ─────────────────────────────────────────
function cleanup() {
    try { execSync('pkill -f cloudflared', { stdio: 'ignore' }); } catch (e) { }
    try { execSync('fuser -k 4040/tcp', { stdio: 'ignore' }); } catch (e) { }

    const start = Date.now();
    while (Date.now() - start < 1000) { }
}

// ─────────────────────────────────────────
// 2. Detect Windows gateway IP from WSL
// ─────────────────────────────────────────
function detectWindowsGateway() {
    try {
        // Primary method: ip route default gateway
        const gateway = execSync("ip route | awk '/default/ {print $3}'", { encoding: 'utf8' }).trim();
        if (gateway) return gateway;
    } catch (e) { }

    try {
        // Fallback: /etc/resolv.conf nameserver
        const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const match = resolv.match(/nameserver\s+([\d.]+)/);
        if (match) return match[1];
    } catch (e) { }

    return null;
}

// ─────────────────────────────────────────
// 3. Probe origin URL
// ─────────────────────────────────────────
async function probeUrl(url) {
    return new Promise((resolve) => {
        http.get(url, { timeout: 2000 }, (res) => {
            resolve(res.statusCode < 500);
            res.resume();
        }).on('error', () => resolve(false)).on('timeout', (req) => { req.destroy(); resolve(false); });
    });
}

// ─────────────────────────────────────────
// 4. Detect origin URL (where Next.js is)
// ─────────────────────────────────────────
async function detectOriginUrl() {
    // Option A: Next.js running in WSL itself
    if (await probeUrl(`http://localhost:${PORT}`)) {
        return `http://localhost:${PORT}`;
    }

    // Option B: Next.js running on Windows, accessible via gateway
    const gateway = detectWindowsGateway();
    if (gateway) {
        const gatewayUrl = `http://${gateway}:${PORT}`;
        console.log('\x1b[90m%s\x1b[0m', `   → Testando gateway Windows: ${gatewayUrl}`);
        if (await probeUrl(gatewayUrl)) {
            return gatewayUrl;
        }
        console.log('\x1b[90m%s\x1b[0m', `   → Gateway não respondeu (${gatewayUrl})`);
    } else {
        console.log('\x1b[90m%s\x1b[0m', '   → Gateway Windows não detectado (ip route falhou)');
    }

    return null;
}

// ─────────────────────────────────────────
// 5. Start cloudflared tunnel
// ─────────────────────────────────────────
function startCloudflaredTunnel(originUrl) {
    console.log('\x1b[36m%s\x1b[0m', `☁️ Iniciando cloudflared → ${originUrl}`);

    const tunnel = spawn('cloudflared', ['tunnel', '--url', originUrl], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise((resolve, reject) => {
        let publicUrl = '';
        let resolved = false;

        const onData = (data) => {
            const output = data.toString();
            const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && !resolved) {
                publicUrl = match[0];
                resolved = true;
                resolve({ process: tunnel, url: publicUrl });
            }
        };

        tunnel.stdout.on('data', onData);
        tunnel.stderr.on('data', onData);
        tunnel.on('error', (err) => {
            if (!resolved) reject(new Error(`cloudflared falhou: ${err.message}`));
        });

        setTimeout(() => {
            if (!resolved) {
                tunnel.kill();
                reject(new Error('Timeout (40s) aguardando URL do cloudflared. Verifique: cloudflared --version'));
            }
        }, 40000);
    });
}

// ─────────────────────────────────────────
// 6. Webhook Validation
// ─────────────────────────────────────────
async function validateWebhook(baseUrl) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'TEST_TOKEN';
    const challenge = '123';
    const url = `${baseUrl}/api/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`;

    return new Promise((resolve) => {
        https.get(url, { timeout: 10000 }, (res) => {
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
// MAIN
// ─────────────────────────────────────────
async function main() {
    let tunnelProcess;

    try {
        console.log('\x1b[36m%s\x1b[0m', '🔪 Limpando cloudflared antigo...');
        cleanup();

        // Detect where Next.js is
        console.log('\x1b[36m%s\x1b[0m', `🔍 Detectando servidor Next.js na porta ${PORT}...`);
        const originUrl = await detectOriginUrl();

        if (!originUrl) {
            throw new Error(
                `Next.js não encontrado na porta ${PORT}.\n\n` +
                `O que verificar:\n` +
                `  1. No Windows (PowerShell), rode primeiro:\n` +
                `       npm run dev:cf:app\n` +
                `  2. Aguarde aparecer: ✅ Servidor online! http://localhost:8080\n` +
                `  3. Então rode este comando no WSL novamente.\n\n` +
                `  Dica: o servidor precisa estar de pé ANTES do tunnel.`
            );
        }

        console.log('\x1b[32m%s\x1b[0m', `   ✅ Servidor detectado: ${originUrl}`);

        // Start tunnel
        const { process: tun, url: publicUrl } = await startCloudflaredTunnel(originUrl);
        tunnelProcess = tun;

        // Save URL to file (Windows path via /mnt/c or relative)
        const tunnelFile = path.resolve(process.cwd(), '.tunnel_url');
        fs.writeFileSync(tunnelFile, publicUrl, 'utf-8');
        console.log('\x1b[90m%s\x1b[0m', `   ✓ URL salva em .tunnel_url`);

        // Validate webhook
        const webhookOk = await validateWebhook(publicUrl);

        // Print box
        console.log('\x1b[32m%s\x1b[0m', '┌──────────────────────────────────────────────────────────────────┐');
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', '│   ✅ CLOUDFLARE TUNNEL ATIVO!                                    │');
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', `│   Origin:   ${originUrl.padEnd(53)}│`);
        console.log('\x1b[32m%s\x1b[0m', `│   Túnel:    ${publicUrl.padEnd(53)}│`);
        console.log('\x1b[32m%s\x1b[0m', `│   Webhook:  ${webhookOk ? '✅ Validado (200 OK)' : '⚠️  Não validado — cheque WHATSAPP_VERIFY_TOKEN'}`.padEnd(68) + '│');
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', '│   👉 Cole no Meta → Webhooks:                                    │');
        console.log('\x1b[32m%s\x1b[0m', `│   ${(publicUrl + '/api/webhook').padEnd(65)}│`);
        console.log('\x1b[32m%s\x1b[0m', '│                                                                  │');
        console.log('\x1b[32m%s\x1b[0m', '└──────────────────────────────────────────────────────────────────┘');
        console.log('\n\x1b[90m%s\x1b[0m', 'Tunnel ativo. Pressione Ctrl+C para parar.');

    } catch (error) {
        console.error('\n\x1b[31m%s\x1b[0m', '❌ Erro:', error.message);
        if (tunnelProcess) try { tunnelProcess.kill(); } catch (e) { }
        process.exit(1);
    }

    const exit = () => {
        console.log('\n\x1b[33m%s\x1b[0m', '🛑 Encerrando tunnel...');
        try { fs.unlinkSync(path.resolve(process.cwd(), '.tunnel_url')); } catch (e) { }
        if (tunnelProcess) try { tunnelProcess.kill(); } catch (e) { }
        try { execSync('pkill -f cloudflared', { stdio: 'ignore' }); } catch (e) { }
        process.exit(0);
    };

    process.on('SIGINT', exit);
    process.on('SIGTERM', exit);
}

main();
