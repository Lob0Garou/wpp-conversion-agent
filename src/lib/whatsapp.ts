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
    text: string
): Promise<SendMessageResult> {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        console.error(
            "[WHATSAPP] ❌ Erro: Credenciais não configuradas (WHATSAPP_API_TOKEN ou WHATSAPP_PHONE_NUMBER_ID)"
        );
        return {
            success: false,
            error: "Missing WhatsApp credentials",
            httpStatus: 0,
        };
    }

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

    // Normalizar número para E.164 (sem espaços)
    const normalizedTo = to.replace(/\s+/g, "");

    const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedTo,
        type: "text",
        text: { preview_url: false, body: text },
    };

    console.log("[WHATSAPP] 📤 Enviando mensagem...");
    console.log(`[WHATSAPP]   - Para: ${normalizedTo}`);
    console.log(`[WHATSAPP]   - Texto: "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"`);
    console.log(`[WHATSAPP]   - URL: ${url}`);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        console.log(`[WHATSAPP] HTTP ${response.status} ${response.statusText}`);
        console.log(`[WHATSAPP] Resposta:`, JSON.stringify(data, null, 2));

        if (!response.ok) {
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
        console.error("[WHATSAPP] ❌ Erro na requisição:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Network/Fetch error",
            httpStatus: 0,
        };
    }
}

