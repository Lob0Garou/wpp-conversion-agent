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
                contacts?: Array<{ wa_id?: string; wa_id_type?: string }>; // Capture contacts for wa_id
                messages?: Array<{
                    id?: string;
                    from?: string;
                    timestamp?: string;
                    type?: string;
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
        const msgType = message.type ?? "unknown";

        // 9-digit fix: prefer wa_id from contacts if available,
        const contact = value.contacts?.[0];
        const waId = contact?.wa_id ?? message.from ?? "";

        // Log ALL incoming messages for visibility (even non-text)
        console.log(`[WEBHOOK] 📨 Message received — type: ${msgType}, from: ${waId}, wamid: ${message.id}`);

        // Only process text messages — ignore image, audio, video, sticker, document, etc.
        if (msgType !== "text") {
            console.log(`[WEBHOOK] ⏭️ Ignored non-text message type: ${msgType}`);
            return null;
        }

        const textBody = message.text?.body;
        if (!textBody) {
            console.log(`[WEBHOOK] ⏭️ Ignored text message with empty body`);
            return null;
        }

        return {
            phoneNumberId: metadata?.phone_number_id ?? "",
            from: waId,
            waMessageId: message.id ?? "",
            text: textBody,
            timestamp: message.timestamp ?? "",
        };
    } catch {
        return null;
    }
}
