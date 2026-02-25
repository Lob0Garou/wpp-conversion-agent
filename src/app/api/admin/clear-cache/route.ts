import { NextResponse } from "next/server";
import { clearPromptCache, getPromptCacheStats } from "@/lib/prompt-system";
import { isChatOnlyMode } from "@/lib/chat-mode";

// CHAT_ONLY: Rota admin desabilitada
function guardChatOnly() {
    if (isChatOnlyMode()) {
        return NextResponse.json(
            { error: "Rota admin desabilitada em modo CHAT_ONLY" },
            { status: 404 }
        );
    }
    return null;
}

/**
 * POST /api/admin/clear-cache
 *
 * Invalida o cache de prompts em memória.
 * Isso deve ser chamado após patches serem aplicados nos arquivos de prompt.
 *
 * ⚠️ IMPORTANTE: Este endpoint deve ser protegido em produção!
 *
 * CHAT_ONLY: Rota desabilitada
 *
 * Exemplo de uso:
 *   curl -X POST http://localhost:8081/api/admin/clear-cache
 */
export async function POST() {
    const guard = guardChatOnly();
    if (guard) return guard;

    try {
        const statsBefore = getPromptCacheStats();
        clearPromptCache();
        const statsAfter = getPromptCacheStats();

        return NextResponse.json({
            success: true,
            message: "Cache de prompts invalidado com sucesso",
            before: statsBefore,
            after: statsAfter,
        });
    } catch (error) {
        console.error("[API] Erro ao limpar cache:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}

/**
 * GET /api/admin/clear-cache
 *
 * Retorna estatísticas do cache de prompts.
 *
 * CHAT_ONLY: Rota desabilitada
 */
export async function GET() {
    const guard = guardChatOnly();
    if (guard) return guard;

    try {
        const stats = getPromptCacheStats();
        return NextResponse.json({
            success: true,
            cache: stats,
        });
    } catch (error) {
        console.error("[API] Erro ao obter estatísticas do cache:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
