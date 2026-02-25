const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v18.0";

interface SendMessageResult {
    success: boolean;
    data?: any;
    error?: string;
    httpStatus?: number;
}

/**
 * Valida se as credenciais obrigatórias do WhatsApp estão configuradas
 * @throws Error se credenciais estão faltando
 */
export function validateWhatsAppCredentials() {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token) {
        throw new Error(
            "❌ WHATSAPP_API_TOKEN não configurado. Configure em .env"
        );
    }
    if (!phoneNumberId) {
        throw new Error(
            "❌ WHATSAPP_PHONE_NUMBER_ID não configurado. Configure em .env"
        );
    }

    console.log("[WHATSAPP] ✅ Credenciais validadas");
    console.log(`[WHATSAPP]   - Phone Number ID: ${phoneNumberId}`);
    console.log(`[WHATSAPP]   - API Version: ${WHATSAPP_API_VERSION}`);

    return { token, phoneNumberId };
}

export async function sendTextMessage(
    to: string,
    text: string,
    isRetry: boolean = false
): Promise<SendMessageResult> {
    if (process.env.BLOCK_WHATSAPP_SEND === 'true' || process.env.ENV === 'TEST') {
        console.log(`[WHATSAPP-SANDBOX] 🛡️ Envio de texto bloqueado para ${to} (Texto: "${text.substring(0, 30)}...")`);
        return { success: true, data: { messages: [{ id: `sandbox-msg-${Date.now()}` }] }, httpStatus: 200 };
    }

    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        const errorMsg = "[WHATSAPP] ❌ Erro: Credenciais não configuradas";
        console.error(errorMsg);
        return {
            success: false,
            error: "Missing WhatsApp credentials",
            httpStatus: 0,
        };
    }

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

    // Normalizar número para E.164 (apenas dígitos)
    const normalizedTo = to.replace(/\D/g, "");

    /* 
       Lógica de Retry será mantida.
    */

    const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedTo,
        type: "text",
        text: { preview_url: false, body: text },
    };

    console.log(`[WHATSAPP] 📤 Enviando mensagem... ${isRetry ? "(RETRY)" : ""}`);
    console.log(`[WHATSAPP]   - Para: ${normalizedTo}`);
    console.log(`[WHATSAPP]   - Texto: "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"`);
    console.log(`[WHATSAPP]   - URL: ${url}`);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        let response: Response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json();

        console.log(`[WHATSAPP] HTTP ${response.status} ${response.statusText}`);
        if (!response.ok) {
            console.log(`[WHATSAPP] Resposta Erro:`, JSON.stringify(data, null, 2));

            // Lógica de Retry para números do Brasil (Erro 131030 ou 400 geral)
            // Tenta adicionar ou remover o 9º dígito
            if (!isRetry && (data.error?.code === 131030 || response.status === 400 || response.status === 404)) {
                if (normalizedTo.startsWith('55')) {
                    let newTo = normalizedTo;
                    // Se tem 13 dígitos (55 + 2 DDD + 9 + 8), tenta remover o 9
                    if (normalizedTo.length === 13) {
                        newTo = normalizedTo.slice(0, 4) + normalizedTo.slice(5);
                        console.warn(`[WHATSAPP] ⚠️ Falha ao enviar para ${normalizedTo}. Tentando ${newTo} (sem 9º dígito)...`);
                    }
                    // Se tem 12 dígitos (55 + 2 DDD + 8), tenta adicionar o 9
                    else if (normalizedTo.length === 12) {
                        newTo = normalizedTo.slice(0, 4) + '9' + normalizedTo.slice(4);
                        console.warn(`[WHATSAPP] ⚠️ Falha ao enviar para ${normalizedTo}. Tentando ${newTo} (com 9º dígito)...`);
                    }

                    if (newTo !== normalizedTo) {
                        return sendTextMessage(newTo, text, true);
                    }
                }
            }

            console.error(
                "[WHATSAPP] ❌ Erro na Graph API:",
                data.error?.message || "Unknown error"
            );
            return {
                success: false,
                error: data.error?.message || "Unknown Graph API error",
                httpStatus: response.status,
                data,
            };
        }

        console.log(`[WHATSAPP] ✅ Mensagem enviada com sucesso`);
        if (data.messages?.[0]?.id) {
            console.log(`[WHATSAPP]   - Message ID: ${data.messages[0].id}`);
        }

        return { success: true, data, httpStatus: response.status };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            console.error("[WHATSAPP] ❌ Request timeout (10s) sending message to:", normalizedTo);
            return {
                success: false,
                error: "Request timeout (10s)",
                httpStatus: 0,
            };
        }
        console.error("[WHATSAPP] ❌ Erro na requisição:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Network/Fetch error",
            httpStatus: 0,
        };
    }
}



/**
 * Marks a message as read in WhatsApp (Blue Ticks)
 */
export async function markMessageAsRead(messageId: string) {
    if (process.env.BLOCK_WHATSAPP_SEND === 'true' || process.env.ENV === 'TEST') {
        console.log(`[WHATSAPP-SANDBOX] 🛡️ Marcação de leitura bloqueada para msg ${messageId}`);
        return;
    }

    const { token, phoneNumberId } = validateWhatsAppCredentials();
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

    const body = {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
    };

    try {
        await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        // Console log removed to keep logs clean, or use debug level
    } catch (error) {
        console.error("[WHATSAPP] ❌ Failed to mark message as read:", error);
    }
}

/**
 * Sends a "typing..." or "recording..." state to the user.
 * Helps with perceived latency.
 * @param to Phone number
 * @param state 'composing' (typing) or 'recording' (recording audio)
 */
/**
 * Sends a "typing..." or "recording..." sender action to the user.
 * Helps with perceived latency — the indicator lasts up to 25s or until next message.
 * Fire-and-forget: caller should NOT await this to avoid blocking the pipeline.
 *
 * Correct payload per Meta docs: { messaging_product, recipient_type, to, sender_action }
 * Note: NO "type" field — that was a bug that caused 400 errors from Graph API.
 */
export async function sendSenderAction(to: string, state: "typing_on" | "typing_off" | "read" = "typing_on") {
    if (process.env.BLOCK_WHATSAPP_SEND === 'true' || process.env.ENV === 'TEST') {
        console.log(`[WHATSAPP-SANDBOX] 🛡️ Sender action "${state}" bloqueada para ${to}`);
        return;
    }

    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        console.warn("[WHATSAPP] ⚠️ sendSenderAction: credenciais não configuradas");
        return;
    }

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
    const normalizedTo = to.replace(/\D/g, "");

    // Correct body per Meta API docs — no "type" field for sender_action
    const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedTo,
        sender_action: state,
    };

    try {
        await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        console.log(`[WHATSAPP] ✍️ Sender action "${state}" sent to ${normalizedTo.slice(-4).padStart(normalizedTo.length, '*')}`);
    } catch (error) {
        console.error(`[WHATSAPP] ❌ Failed to send sender action "${state}":`, error);
    }
}
