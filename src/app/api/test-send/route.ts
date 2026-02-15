import { NextRequest, NextResponse } from "next/server";
import { sendTextMessage, validateWhatsAppCredentials } from "@/lib/whatsapp";

/**
 * GET /api/test-send?to=5585985963329&text=Olá%20teste
 *
 * Endpoint para testar envio de mensagens de texto via WhatsApp.
 * Útil para validar credenciais e conexão com a Graph API.
 *
 * Parâmetros:
 * - to: Número do telefone em E.164 (com país, sem espaços) ex: 5585985963329
 * - text: Texto da mensagem (URL encoded)
 *
 * Resposta:
 * {
 *   "status": "success" | "error",
 *   "to": "5585985963329",
 *   "text": "Olá teste",
 *   "httpStatus": 200,
 *   "messageId": "wamid.HBEUGoZFDdjO...",
 *   "error": null
 * }
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const to = searchParams.get("to");
    const text = searchParams.get("text");

    console.log("[TEST-SEND] 🧪 Teste de envio iniciado");
    console.log(`[TEST-SEND] Parâmetros: to=${to}, text=${text}`);

    // Validar parâmetros
    if (!to || !text) {
        return NextResponse.json(
            {
                status: "error",
                error: "Parâmetros obrigatórios: to (número E.164) e text",
                example: "/api/test-send?to=5585985963329&text=Olá%20teste",
            },
            { status: 400 }
        );
    }

    try {
        // Validar credenciais
        validateWhatsAppCredentials();

        // Enviar mensagem
        const result = await sendTextMessage(to, text);

        if (result.success) {
            const messageId = result.data?.messages?.[0]?.id;
            return NextResponse.json(
                {
                    status: "success",
                    to,
                    text,
                    httpStatus: result.httpStatus,
                    messageId,
                    message: "Mensagem enviada com sucesso",
                },
                { status: 200 }
            );
        } else {
            return NextResponse.json(
                {
                    status: "error",
                    to,
                    text,
                    httpStatus: result.httpStatus,
                    error: result.error,
                },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error("[TEST-SEND] ❌ Erro:", error);
        return NextResponse.json(
            {
                status: "error",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
