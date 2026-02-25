/**
 * Script temporário para sincronizar schema do banco
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env.sandbox');

console.log('Carregando variáveis do .env.sandbox...');
const content = fs.readFileSync(envPath, 'utf8');
for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    process.env[key] = val;
}

process.env.SANDBOX_DATABASE_URL = `file:${path.join(projectRoot, 'tests_harness', 'test_harness.db')}`;

console.log('Executando prisma db push...');
try {
    execSync('npx prisma db push --schema=prisma/schema-sandbox.prisma', {
        stdio: 'inherit',
        cwd: projectRoot,
        env: process.env,
    });
    console.log('✅ Schema sincronizado!');
} catch (err) {
    console.error('❌ Erro ao sincronizar schema:', err.message);
    process.exit(1);
}
