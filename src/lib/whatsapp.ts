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
        console.error("[WHATSAPP] ❌ Erro na requisição:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Network/Fetch error",
            httpStatus: 0,
        };
    }
}

