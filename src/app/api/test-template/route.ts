import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/test-template?to=5585985963329
 *
 * Teste de envio usando template (hello_world)
 * Templates sempre funcionam, mesmo fora da janela 24h
 *
 * Útil para debug quando texto livre não chega
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const to = searchParams.get("to");

    console.log("[TEST-TEMPLATE] 🧪 Teste de template iniciado");

    if (!to) {
        return NextResponse.json(
            {
                status: "error",
                error: "Parâmetro 'to' obrigatório",
                example: "/api/test-template?to=5585985963329",
            },
            { status: 400 }
        );
    }

    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        console.error("[TEST-TEMPLATE] ❌ Credenciais não configuradas");
        return NextResponse.json(
            {
                status: "error",
                error: "WHATSAPP_API_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados",
            },
            { status: 500 }
        );
    }

    const normalizedTo = to.replace(/\D/g, "");
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

    const body = {
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: "template",
        template: {
            name: "hello_world",
            language: {
                code: "en_US",
            },
        },
    };

    console.log("[TEST-TEMPLATE] 📤 Enviando template hello_world...");
    console.log(`[TEST-TEMPLATE]   - Para: ${normalizedTo}`);
    console.log(`[TEST-TEMPLATE]   - Template: hello_world`);

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

        console.log(`[TEST-TEMPLATE] HTTP ${response.status}`);

        if (!response.ok) {
            console.error("[TEST-TEMPLATE] ❌ Erro na Meta API:");
            console.error(JSON.stringify(data, null, 2));

            return NextResponse.json(
                {
                    status: "error",
                    error: data.error?.message || "Unknown error",
                    code: data.error?.code,
                    httpStatus: response.status,
                },
                { status: 400 }
            );
        }

        const messageId = data.messages?.[0]?.id;
        console.log("[TEST-TEMPLATE] ✅ Template enviado com sucesso");
        console.log(`[TEST-TEMPLATE]   - Message ID: ${messageId}`);

        return NextResponse.json(
            {
                status: "success",
                to: normalizedTo,
                template: "hello_world",
                messageId,
                httpStatus: response.status,
                message: "Template enviado com sucesso. Aguarde o webhook de status.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("[TEST-TEMPLATE] ❌ Erro na requisição:", error);
        return NextResponse.json(
            {
                status: "error",
                error: error instanceof Error ? error.message : "Network error",
            },
            { status: 500 }
        );
    }
}
