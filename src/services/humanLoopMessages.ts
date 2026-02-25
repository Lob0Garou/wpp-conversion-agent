import type { Slots } from '../lib/state-manager';
import type { HandoffReason } from './humanLoopEngine';

/**
 * buildSaleAlertMessage: cria mensagem de alerta para o grupo de vendas
 *
 * Formato com reason tag:
 * - RESERVA_CONFIRMADA: cliente quer reservar/comprar agora
 * - SEM_ESTOQUE_CONVERTER: estoque indisponível mas cliente quer converter
 *
 * Exemplos:
 *
 * "🟢 CLIENTE PARA ATENDER (RESERVA)
 * Produto: *{product.name}*
 * Tamanho: {size}
 * Ação: finalizar RESERVA e fechar venda."
 *
 * ou
 *
 * "🔴 CLIENTE PARA ATENDER (SEM ESTOQUE)
 * Produto: *{product.name}*
 * Tamanho: {size}
 * Ação: oferecer SIMILAR ou ENCOMENDA e fechar venda."
 */
export function buildSaleAlertMessage(
    slots: Slots,
    customerPhone?: string,
    reason?: HandoffReason
): string {
    const lines: string[] = [];

    // Define emoji e título baseado na reason
    const isReserva = reason === 'RESERVA_CONFIRMADA';
    const emoji = isReserva ? '🟢' : '🔴';
    const title = isReserva ? 'RESERVA' : 'SEM ESTOQUE';

    lines.push(`${emoji} CLIENTE PARA ATENDER (${title})`);
    lines.push('');

    // Produto
    if (slots.product || slots.marca || slots.categoria) {
        const productDesc = [slots.marca, slots.categoria, slots.product]
            .filter(Boolean)
            .join(' ');
        lines.push(`Produto: *${productDesc}*`);
    }

    // Tamanho
    if (slots.size) {
        lines.push(`Tamanho: ${slots.size}`);
    }

    // Gênero (usado como proxy para cor/estilo)
    if (slots.genero) {
        lines.push(`Estilo: ${slots.genero}`);
    }

    // Uso
    if (slots.usage) {
        lines.push(`Uso: ${slots.usage}`);
    }

    // Phone do cliente (últimos dígitos para identificação)
    if (customerPhone) {
        const lastDigits = customerPhone.slice(-4);
        lines.push(`Cliente: ...${lastDigits}`);
    }

    lines.push('');

    // Ação baseada na reason
    if (isReserva) {
        lines.push('Ação: finalizar RESERVA e fechar venda.');
    } else {
        lines.push('Ação: oferecer SIMILAR ou ENCOMENDA e fechar venda.');
    }

    return lines.join('\n');
}

/**
 * buildHandoffMessage: mensagem curta para o cliente quando há transferência
 *
 * IMPORTANTE: Sem explicação de processo, apenas redirecionamento.
 */
export function buildHandoffMessage(): string {
    return 'Vou te direcionar para um vendedor da loja te atender por aqui. ✅';
}

/**
 * buildSACAlertMessage: cria mensagem de alerta para o grupo de SAC
 *
 * Formato curto e estruturado:
 *
 * "🔴 SAC PARA ATENDER
 *
 * Cliente: *{name}*
 * Pedido: #{orderId} (omit if missing)
 * Email: {email} (omit if missing)
 *
 * Problema: *{problem}*
 *
 * Ação: abrir chamado e tratar com o cliente no WhatsApp."
 */
export function buildSACAlertMessage(
    slots: Slots,
    intent: string,
    customerName?: string | null,
    customerPhone?: string,
    email?: string
): string {
    const lines: string[] = [];

    lines.push('🔴 SAC PARA ATENDER');
    lines.push('');

    // Cliente (nome ou últimos dígitos do telefone)
    if (customerName && customerName.trim().length > 2) {
        lines.push(`Cliente: *${customerName}*`);
    } else if (customerPhone) {
        const lastDigits = customerPhone.slice(-4);
        lines.push(`Cliente: ...${lastDigits}`);
    }

    // Pedido
    if (slots.orderId) {
        lines.push(`Pedido: #${slots.orderId}`);
    }

    // Email
    if (email) {
        lines.push(`Email: ${email}`);
    }

    // Problema (motivoTroca ou statusPedido como proxy)
    const problem = slots.motivoTroca || slots.statusPedido;
    if (problem) {
        lines.push('');
        lines.push(`Problema: *${problem}*`);
    }

    lines.push('');
    lines.push('Ação: abrir chamado e tratar com o cliente no WhatsApp.');

    return lines.join('\n');
}
