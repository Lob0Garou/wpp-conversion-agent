import { createCatalogoTool } from "../catalogo";
import { createEstoqueTool } from "../estoque";
import { createPedidosTool } from "../pedidos";
import { createPoliticasTool } from "../politicas";
import { validateOrderId, validateSearchQuery, validatePhoneNumber } from "../../tool-guards";

describe("LangGraph Agent Tools (Read-Only)", () => {
    const mockStoreId = "store-123";

    describe("Tool Guards", () => {
        it("should validate a correct order ID", () => {
            const res = validateOrderId("ORD-1234");
            expect(res.valid).toBe(true);
        });

        it("should reject an invalid order ID", () => {
            const res = validateOrderId("ORD_@_1234***");
            expect(res.valid).toBe(false);
            expect(res.error).toBeDefined();
        });

        it("should validate search query", () => {
            expect(validateSearchQuery("Tenis Nike").valid).toBe(true);
            expect(validateSearchQuery("A").valid).toBe(false); // Too short
            expect(validateSearchQuery("Tenis\x00Nike").valid).toBe(false); // Control chars
        });

        it("should validate phone numbers", () => {
            expect(validatePhoneNumber("5511999999999").valid).toBe(true);
            expect(validatePhoneNumber("11999999999").valid).toBe(false); // Missing 55
        });
    });

    // Test coverage for structure and invocation
    // (Note: To test Prisma properly, we should mock the prisma client)
    describe("Tools Generation", () => {
        it("should create the catalogo tool", () => {
            const tool = createCatalogoTool(mockStoreId);
            expect(tool.name).toBe("consultar_catalogo");
            expect(tool.description).toContain("Busca produtos no catálogo");
        });

        it("should create the estoque tool", () => {
            const tool = createEstoqueTool(mockStoreId);
            expect(tool.name).toBe("verificar_estoque");
            expect(tool.description).toContain("disponibilidade em estoque");
        });

        it("should create the pedidos tool", () => {
            const tool = createPedidosTool(mockStoreId);
            expect(tool.name).toBe("consultar_pedido");
            expect(tool.description).toContain("Consulta o status atual");
        });

        it("should create the politicas tool", () => {
            const tool = createPoliticasTool(mockStoreId);
            expect(tool.name).toBe("consultar_politicas");
        });
    });

    describe("Politicas Tool Execution (Static)", () => {
        it("should return the return policy", async () => {
            const tool = createPoliticasTool(mockStoreId);
            const res = await tool.invoke({ topico: "devolucao" });
            const jsonRes = JSON.parse(res);

            expect(jsonRes.source).toBe("politicas_db");
            expect(jsonRes.storeId).toBe(mockStoreId);
            expect(jsonRes.metadata.topico).toBe("devolucao");
            expect(jsonRes.dadosEstruturados.prazoDias).toBe(7);
        });
    });
});
