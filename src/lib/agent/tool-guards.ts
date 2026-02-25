/**
 * TOOL GUARDS
 * Serve como uma camada de segurança server-side antes de executar
 * lógicas críticas no sistema, garantindo que o LLM não alucine
 * IDs, parâmetros, ou tente ações destrutivas.
 */

import { z } from "zod";

// Schema rígido para garantir que o formato de pedido recebido é seguro
const OrderIdSchema = z.string()
    .min(1, "ID do pedido não pode ser vazio")
    .max(50, "ID do pedido excede limite máximo")
    .regex(/^[a-zA-Z0-9#-]+$/, "ID do pedido só pode conter letras, números, hash ou hífens");

export const validateOrderId = (id: string): { valid: boolean; error?: string } => {
    const result = OrderIdSchema.safeParse(id);
    if (!result.success) {
        return { valid: false, error: result.error.issues[0]?.message || "Formato de ID inválido" };
    }
    return { valid: true };
};

// Exemplo: Bloqueador de injeção sql ou prompts não semânticos na busca
export const validateSearchQuery = (query: string): { valid: boolean; error?: string } => {
    if (query.length < 2) {
        return { valid: false, error: "Consulta de busca muito curta" };
    }
    if (query.length > 100) {
        return { valid: false, error: "Consulta de busca muito longa" };
    }
    // Previne caracteres de controle maliciosos
    if (/[\x00-\x1F\x7F-\x9F]/.test(query)) {
        return { valid: false, error: "Consulta contém caracteres inválidos" };
    }
    return { valid: true };
};

// Segurança: Garante que o telefone está no formato exato esperado pela API do WhatsApp
export const validatePhoneNumber = (phone: string): { valid: boolean; error?: string } => {
    // Exemplo: 5585999999999
    const regex = /^55\d{10,11}$/;
    if (!regex.test(phone)) {
        return { valid: false, error: "Formato de telefone inválido para o Brasil (esperado 55+DDD+Numero)" };
    }
    return { valid: true };
};
