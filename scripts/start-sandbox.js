/**
 * Script de start para Sandbox (modo produção)
 * 
 * Inicia o Next.js em modo produção (sem Turbopack) na porta 8081.
 * Passa explicitamente as variáveis de ambiente para o processo filho
 * para garantir que o DATABASE_URL correto seja usado em produção.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
require('./load-sandbox-env');

// Resolve o caminho absoluto do banco de dados para garantir que seja
// o mesmo independente do CWD ou da forma que o Next.js resolve env vars
const dbAbsolutePath = path.resolve(__dirname, '..', 'tests_harness', 'test_harness.db');
process.env.DATABASE_URL = `file:${dbAbsolutePath}`;
process.env.SANDBOX_DATABASE_URL = `file:${dbAbsolutePath}`;

// Garante que o Prisma Client SQLite está gerado no diretório isolado
// (.prisma/client-sandbox) antes de subir o Next.js. Sem isso, qualquer
// `prisma generate` do schema principal sobrescreveria o client e quebraria o sandbox.
console.log('🔄 Gerando Prisma Client SQLite (schema-sandbox)...');
const projectRoot = path.resolve(__dirname, '..');
execSync('npx prisma generate --schema=prisma/schema-sandbox.prisma', {
    stdio: 'inherit',
    cwd: projectRoot,
});

console.log('');
console.log('🔧 Iniciando Sandbox em modo produção (sem Turbopack)');
console.log('🌍 ENV:', process.env.ENV);
console.log('🗄️  DATABASE_URL:', process.env.DATABASE_URL);
console.log('🔌 PORT:', process.env.PORT);
console.log('');

const port = process.env.PORT || '8081';

// Passa o env completo explicitamente para o processo filho
const child = spawn('npx', ['next', 'start', '-p', port], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
    env: { ...process.env } // <-- env explícito com DATABASE_URL correto
});

child.on('close', code => {
    console.log(`Processo finalizado com código ${code}`);
});

child.on('error', err => {
    console.error('❌ Erro ao iniciar:', err);
    process.exit(1);
});

// Tratamento de encerramento
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando Sandbox...');
    child.kill('SIGINT');
    process.exit(0);
});
