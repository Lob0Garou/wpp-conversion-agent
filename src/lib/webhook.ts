import crypto from "crypto";

/**
 * Valida a assinatura X-Hub-Signature-256 enviada pela Meta.
 * Garante que o payload é realmente da Meta, não forjado.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string | null,
    appSecret: string
): boolean {
    if (!signature) return false;

    const expectedSignature =
        "sha256=" +
        crypto.createHmac("sha256", appSecret).update(payload).digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

/**
 * Extrai dados da mensagem do payload do WhatsApp Cloud API.
 * Retorna null se não for uma mensagem válida.
 */
export interface IncomingMessage {
    phoneNumberId: string; // identifica a store
    from: string; // telefone do cliente
    waMessageId: string; // id único da mensagem (idempotência)
    text: string; // conteúdo da mensagem
    timestamp: string;
}

// Estrutura parcial do payload do WhatsApp Cloud API
interface WhatsAppPayload {
    entry?: Array<{
        changes?: Array<{
            value?: {
                metadata?: { phone_number_id?: string };
                messages?: Array<{
                    id?: string;
                    from?: string;
                    timestamp?: string;
                    text?: { body?: string };
                }>;
            };
        }>;
    }>;
}

export function extractMessage(body: unknown): IncomingMessage | null {
    try {
        const payload = body as WhatsAppPayload;
        const value = payload?.entry?.[0]?.changes?.[0]?.value;

        if (!value?.messages?.[0]) return null;

        const message = value.messages[0];
        const metadata = value.metadata;

        return {
            phoneNumberId: metadata?.phone_number_id ?? "",
            from: message.from ?? "",
            waMessageId: message.id ?? "",
            text: message.text?.body ?? "",
            timestamp: message.timestamp ?? "",
        };
    } catch {
        return null;
    }
}
