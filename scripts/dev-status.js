/**
 * dev-status.js — STATUS do ambiente de desenvolvimento.
 *
 * Verifica:
 *   1. Next.js rodando na porta 8080 (Windows ou WSL)
 *   2. Cloudflared ativo (processo)
 *   3. URL pública em .tunnel_url (ainda válida?)
 *   4. Webhook respondendo 200 OK via URL pública
 *   5. .env com tokens obrigatórios
 *
 * Uso: npm run dev:status
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = 8080;
const ENV_FILE = path.resolve(process.cwd(), '.env');
const TUNNEL_URL_FILE = path.resolve(process.cwd(), '.tunnel_url');

// ─────────────────────────────────────────
// Checks
// ─────────────────────────────────────────

async function checkUrl(url, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { timeout: timeoutMs }, (res) => {
            resolve({ ok: res.statusCode < 500, status: res.statusCode });
            res.resume();
        });
        req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    });
}

async function checkNextJs() {
    // Try localhost first (WSL), then gateway (Windows)
    const local = await checkUrl(`http://localhost:${PORT}`);
    if (local.ok) return { ok: true, url: `http://localhost:${PORT}`, note: 'WSL local' };

    // Try Windows gateway
    try {
        const gateway = execSync("ip route 2>/dev/null | awk '/default/ {print $3}'", { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (gateway) {
            const gw = await checkUrl(`http://${gateway}:${PORT}`);
            if (gw.ok) return { ok: true, url: `http://${gateway}:${PORT}`, note: 'gateway Windows' };
        }
    } catch (e) { }

    // Windows fallback: try powershell netstat
    try {
        const result = execSync('powershell -NoProfile -Command "netstat -an | Select-String \':8080\'"', { encoding: 'utf8' });
        if (result.includes('8080') && result.includes('LISTENING')) {
            // Port is listening but we couldn't probe it from here
            return { ok: true, url: `http://localhost:${PORT}`, note: 'Windows (netstat confirma)' };
        }
    } catch (e) { }

    return { ok: false, url: null, note: 'não encontrado' };
}

function checkCloudflaredProcess() {
    // Try Windows tasklist first
    try {
        const result = execSync('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH 2>nul', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (result.includes('cloudflared')) return true;
    } catch (e) { }

    // Try WSL pgrep
    try {
        const result = execSync('pgrep -f cloudflared', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (result.trim().length > 0) return true;
    } catch (e) { }

    return false;
}

async function checkTunnelUrl() {
    if (!fs.existsSync(TUNNEL_URL_FILE)) {
        return { ok: false, url: null, note: 'arquivo .tunnel_url não existe' };
    }

    const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf-8').trim();
    if (!url || !url.startsWith('https://')) {
        return { ok: false, url, note: 'URL inválida em .tunnel_url' };
    }

    const probe = await checkUrl(url, 8000);
    if (!probe.ok) {
        return { ok: false, url, note: `URL expirada ou inacessível (HTTP ${probe.status})` };
    }

    return { ok: true, url, note: 'ativa' };
}

async function checkWebhook(publicUrl) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'TEST_TOKEN';
    const challenge = '123';
    const url = `${publicUrl}/api/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`;

    return new Promise((resolve) => {
        https.get(url, { timeout: 8000 }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const ok = res.statusCode === 200 && data.trim() === challenge;
                resolve({ ok, status: res.statusCode, body: data.trim() });
            });
        }).on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    });
}

function checkEnv() {
    const required = ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'OPENROUTER_API_KEY', 'DATABASE_URL'];
    const missing = required.filter(k => !process.env[k]);
    return { ok: missing.length === 0, missing };
}

// ─────────────────────────────────────────
// Output helpers
// ─────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GRAY   = '\x1b[90m';
const RESET  = '\x1b[0m';

function icon(ok, warn = false) {
    if (ok) return `${GREEN}✅${RESET}`;
    if (warn) return `${YELLOW}⚠️ ${RESET}`;
    return `${RED}❌${RESET}`;
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────

async function main() {
    console.log(`\n${GRAY}📊 STATUS DO AMBIENTE${RESET}`);
    console.log(`${GRAY}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

    // Run all checks in parallel
    const [nextJs, tunnelUrl, envCheck] = await Promise.all([
        checkNextJs(),
        checkTunnelUrl(),
        Promise.resolve(checkEnv()),
    ]);

    const cloudflaredRunning = checkCloudflaredProcess();

    // Webhook check (needs tunnel URL)
    let webhook = { ok: false, status: 0, note: 'sem URL pública' };
    if (tunnelUrl.ok) {
        const wh = await checkWebhook(tunnelUrl.url);
        webhook = { ...wh, note: wh.ok ? '200 OK + challenge' : `HTTP ${wh.status}` };
    }

    // Print results
    console.log(`  ${icon(nextJs.ok)} Next.js (8080): ${nextJs.ok ? `RODANDO — ${nextJs.url} ${GRAY}(${nextJs.note})${RESET}` : `${RED}NÃO RODANDO${RESET}`}`);
    console.log(`  ${icon(cloudflaredRunning, true)} cloudflared:   ${cloudflaredRunning ? `${GREEN}PROCESSO ATIVO${RESET}` : `${YELLOW}processo não detectado${RESET}`}`);
    console.log(`  ${icon(tunnelUrl.ok, !tunnelUrl.ok)} Tunnel URL:    ${tunnelUrl.ok ? `${GREEN}${tunnelUrl.url}${RESET}` : `${YELLOW}${tunnelUrl.note}${RESET}`}`);
    console.log(`  ${icon(webhook.ok, !webhook.ok)} Webhook:       ${webhook.ok ? `${GREEN}validado (${webhook.note})${RESET}` : `${YELLOW}${webhook.note}${RESET}`}`);
    console.log(`  ${icon(envCheck.ok)} .env:          ${envCheck.ok ? `${GREEN}completo${RESET}` : `${RED}faltando: ${envCheck.missing.join(', ')}${RESET}`}`);

    console.log('');

    // Collect problems and suggestions
    const problems = [];

    if (!nextJs.ok) {
        problems.push({
            label: 'Next.js não está rodando',
            fix: 'No Windows (PowerShell):\n       npm run dev:cf:app'
        });
    }

    if (!tunnelUrl.ok) {
        if (!tunnelUrl.url) {
            problems.push({
                label: 'Tunnel não iniciado (.tunnel_url ausente)',
                fix: 'No WSL:\n       npm run dev:cf:tunnel'
            });
        } else {
            problems.push({
                label: `URL expirada: ${tunnelUrl.url}`,
                fix: 'Reinicie o tunnel no WSL:\n       npm run dev:cf:tunnel'
            });
        }
    }

    if (!webhook.ok && tunnelUrl.ok) {
        problems.push({
            label: 'Webhook não valida (URL pública ativa mas webhook falhou)',
            fix: `Verifique WHATSAPP_VERIFY_TOKEN no .env\n       Valor atual: "${process.env.WHATSAPP_VERIFY_TOKEN || 'não definido'}"`
        });
    }

    if (!envCheck.ok) {
        problems.push({
            label: `Variáveis faltando: ${envCheck.missing.join(', ')}`,
            fix: 'Adicione ao arquivo .env'
        });
    }

    if (problems.length === 0) {
        console.log(`  ${GREEN}🟢 TUDO OK — Pronto para testar com WhatsApp${RESET}`);
        if (tunnelUrl.ok) {
            console.log(`\n  ${GRAY}Cole no Meta → Webhooks:${RESET}`);
            console.log(`  ${GREEN}${tunnelUrl.url}/api/webhook${RESET}`);
        }
    } else {
        console.log(`  ${RED}🔴 PROBLEMAS ENCONTRADOS:${RESET}\n`);
        problems.forEach((p, i) => {
            console.log(`  ${YELLOW}${i + 1}️⃣  ${p.label}${RESET}`);
            console.log(`     ${GRAY}→ ${p.fix}${RESET}\n`);
        });
    }

    console.log('');
}

main().catch(e => {
    console.error('Erro no status check:', e.message);
    process.exit(1);
});
