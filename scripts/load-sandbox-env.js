/**
 * Loader de variáveis de ambiente para Sandbox
 * 
 * Carrega as variáveis do .env.sandbox para o processo.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.sandbox');

if (!fs.existsSync(envPath)) {
    console.error('❌ .env.sandbox não encontrado');
    process.exit(1);
}

require('dotenv').config({ path: envPath });

// Forçar variáveis de sandbox
process.env.ENV = 'TEST';
process.env.TEST_MODE = 'true';
process.env.PORT = process.env.PORT || '8081';
process.env.BLOCK_EXTERNAL_HTTP = process.env.BLOCK_EXTERNAL_HTTP || 'true';
process.env.BLOCK_WHATSAPP_SEND = process.env.BLOCK_WHATSAPP_SEND || 'true';

console.log('✅ ENV sandbox carregado');
console.log('   ENV:', process.env.ENV);
console.log('   PORT:', process.env.PORT);
console.log('   DATABASE_URL:', process.env.DATABASE_URL);
