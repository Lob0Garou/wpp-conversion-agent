import { createCatalogoTool } from "./catalogo";
import { createEstoqueTool } from "./estoque";
import { createPedidosTool } from "./pedidos";
import { createPoliticasTool } from "./politicas";

export const getVendasTools = (storeId: string) => {
    return [
        createCatalogoTool(storeId),
        createEstoqueTool(storeId),
    ];
};

export const getSacTools = (storeId: string) => {
    return [
        createPedidosTool(storeId),
        createPoliticasTool(storeId),
    ];
};

export {
    createCatalogoTool,
    createEstoqueTool,
    createPedidosTool,
    createPoliticasTool,
};
