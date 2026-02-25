"use strict";
// ─── inventory-snapshot.ts ───
// Gerencia o ciclo de vida de snapshots de estoque.
// O DB NÃO é source of truth — espelha o último CSV/XLSX importado.
//
// Fluxo de importação:
// 1. Parse do arquivo → validação
// 2. Criar InventoryImport com status=PENDING
// 3. Inserir produtos com importId (staging)
// 4. Transação atômica:
//    a) Marcar import anterior como SUPERSEDED
//    b) Marcar novo import como ACTIVE
//    c) Deletar produtos do import anterior
// 5. Se falhar, marcar import como FAILED
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSnapshot = getActiveSnapshot;
exports.hasActiveSnapshot = hasActiveSnapshot;
exports.getActiveImportId = getActiveImportId;
exports.createInventorySnapshot = createInventorySnapshot;
exports.getImportHistory = getImportHistory;
exports.getActiveProductsSourceCount = getActiveProductsSourceCount;
var prisma_1 = require("./prisma");
function isMissingInventoryImportStatusField(error) {
    var message = error instanceof Error ? error.message : String(error);
    return message.includes("Unknown argument `status`");
}
// ─── CORE FUNCTIONS ───
/**
 * Verifica se existe um snapshot ativo para a loja.
 * Usado pelo Stock Agent para decidir se pode responder.
 */
function getActiveSnapshot(storeId) {
    return __awaiter(this, void 0, void 0, function () {
        var activeImport, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.findFirst({
                            where: {
                                storeId: storeId,
                                status: "ACTIVE",
                            },
                            select: {
                                id: true,
                                fileName: true,
                                totalRows: true,
                                validRows: true,
                                importedAt: true,
                            },
                        })];
                case 1:
                    activeImport = _a.sent();
                    return [2 /*return*/, activeImport];
                case 2:
                    error_1 = _a.sent();
                    if (!isMissingInventoryImportStatusField(error_1))
                        throw error_1;
                    console.warn("[SNAPSHOT] inventory_imports sem campo status no sandbox - usando import mais recente");
                    return [2 /*return*/, prisma_1.prisma.inventoryImport.findFirst({
                            where: { storeId: storeId },
                            orderBy: { importedAt: "desc" },
                            select: {
                                id: true,
                                fileName: true,
                                totalRows: true,
                                validRows: true,
                                importedAt: true,
                            },
                        })];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verifica se a loja tem snapshot ativo.
 * Atalho para validação no stock-agent.
 */
function hasActiveSnapshot(storeId) {
    return __awaiter(this, void 0, void 0, function () {
        var count, error_2, count;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 4]);
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.count({
                            where: {
                                storeId: storeId,
                                status: "ACTIVE",
                            },
                        })];
                case 1:
                    count = _a.sent();
                    return [2 /*return*/, count > 0];
                case 2:
                    error_2 = _a.sent();
                    if (!isMissingInventoryImportStatusField(error_2))
                        throw error_2;
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.count({
                            where: { storeId: storeId },
                        })];
                case 3:
                    count = _a.sent();
                    return [2 /*return*/, count > 0];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém o importId do snapshot ativo.
 * Retorna null se não houver snapshot ativo.
 */
function getActiveImportId(storeId) {
    return __awaiter(this, void 0, void 0, function () {
        var activeImport, error_3, latestImport;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 4]);
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.findFirst({
                            where: {
                                storeId: storeId,
                                status: "ACTIVE",
                            },
                            select: {
                                id: true,
                            },
                        })];
                case 1:
                    activeImport = _c.sent();
                    return [2 /*return*/, (_a = activeImport === null || activeImport === void 0 ? void 0 : activeImport.id) !== null && _a !== void 0 ? _a : null];
                case 2:
                    error_3 = _c.sent();
                    if (!isMissingInventoryImportStatusField(error_3))
                        throw error_3;
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.findFirst({
                            where: { storeId: storeId },
                            orderBy: { importedAt: "desc" },
                            select: { id: true },
                        })];
                case 3:
                    latestImport = _c.sent();
                    return [2 /*return*/, (_b = latestImport === null || latestImport === void 0 ? void 0 : latestImport.id) !== null && _b !== void 0 ? _b : null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Cria um novo snapshot de estoque com staging + swap atômico.
 *
 * @param storeId - ID da loja
 * @param fileName - Nome do arquivo importado
 * @param products - Produtos parseados e validados
 * @param sourceType - DETAILED (CSV) ou AGGREGATED (XLSX)
 * @returns ID do novo import ativo
 */
function createInventorySnapshot(storeId_1, fileName_1, products_1, sourceType_1) {
    return __awaiter(this, arguments, void 0, function (storeId, fileName, products, sourceType, invalidRows, totalRows) {
        var importId, error_4, _i, products_2, p, error_5, error_6;
        var _this = this;
        var _a, _b, _c, _d, _e;
        if (invalidRows === void 0) { invalidRows = []; }
        if (totalRows === void 0) { totalRows = products.length; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    importId = crypto.randomUUID();
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.create({
                            data: {
                                id: importId,
                                storeId: storeId,
                                fileName: fileName,
                                totalRows: totalRows,
                                validRows: products.length,
                                invalidRows: invalidRows.length,
                                errors: invalidRows.length > 0 ? invalidRows : undefined,
                                status: "PENDING",
                            },
                        })];
                case 2:
                    _f.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_4 = _f.sent();
                    console.error("[SNAPSHOT] Erro ao criar registro de importação:", error_4);
                    return [2 /*return*/, { success: false, importId: importId, error: "Falha ao criar registro de importação" }];
                case 4:
                    _f.trys.push([4, 9, , 11]);
                    _i = 0, products_2 = products;
                    _f.label = 5;
                case 5:
                    if (!(_i < products_2.length)) return [3 /*break*/, 8];
                    p = products_2[_i];
                    return [4 /*yield*/, prisma_1.prisma.product.create({
                            data: {
                                storeId: storeId,
                                sku: (_a = p.sku) !== null && _a !== void 0 ? _a : null,
                                description: p.description,
                                brand: (_b = p.brand) !== null && _b !== void 0 ? _b : null,
                                groupName: (_c = p.groupName) !== null && _c !== void 0 ? _c : null,
                                size: (_d = p.size) !== null && _d !== void 0 ? _d : null,
                                quantity: p.quantity,
                                price: (_e = p.price) !== null && _e !== void 0 ? _e : null,
                                importId: importId,
                            },
                        })];
                case 6:
                    _f.sent();
                    _f.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [3 /*break*/, 11];
                case 9:
                    error_5 = _f.sent();
                    console.error("[SNAPSHOT] Erro ao inserir produtos:", error_5);
                    // Marcar como FAILED
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.update({
                            where: { id: importId },
                            data: { status: "FAILED" },
                        })];
                case 10:
                    // Marcar como FAILED
                    _f.sent();
                    return [2 /*return*/, { success: false, importId: importId, error: "Falha ao inserir produtos" }];
                case 11:
                    _f.trys.push([11, 13, , 15]);
                    return [4 /*yield*/, prisma_1.prisma.$transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var previousActive;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx.inventoryImport.findFirst({
                                            where: {
                                                storeId: storeId,
                                                status: "ACTIVE",
                                            },
                                            select: { id: true },
                                        })];
                                    case 1:
                                        previousActive = _a.sent();
                                        if (!previousActive) return [3 /*break*/, 4];
                                        return [4 /*yield*/, tx.inventoryImport.update({
                                                where: { id: previousActive.id },
                                                data: {
                                                    status: "SUPERSEDED",
                                                    supersededAt: new Date(),
                                                },
                                            })];
                                    case 2:
                                        _a.sent();
                                        // 3c. Deletar produtos do import anterior
                                        return [4 /*yield*/, tx.product.deleteMany({
                                                where: {
                                                    storeId: storeId,
                                                    importId: previousActive.id,
                                                },
                                            })];
                                    case 3:
                                        // 3c. Deletar produtos do import anterior
                                        _a.sent();
                                        _a.label = 4;
                                    case 4: 
                                    // 3d. Marcar novo import como ACTIVE
                                    return [4 /*yield*/, tx.inventoryImport.update({
                                            where: { id: importId },
                                            data: { status: "ACTIVE" },
                                        })];
                                    case 5:
                                        // 3d. Marcar novo import como ACTIVE
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 12:
                    _f.sent();
                    console.log("[SNAPSHOT] \u2705 Snapshot ".concat(importId, " criado com ").concat(products.length, " produtos"));
                    return [2 /*return*/, { success: true, importId: importId }];
                case 13:
                    error_6 = _f.sent();
                    console.error("[SNAPSHOT] Erro no swap atômico:", error_6);
                    // Marcar como FAILED
                    return [4 /*yield*/, prisma_1.prisma.inventoryImport.update({
                            where: { id: importId },
                            data: { status: "FAILED" },
                        })];
                case 14:
                    // Marcar como FAILED
                    _f.sent();
                    return [2 /*return*/, { success: false, importId: importId, error: "Falha no swap de snapshots" }];
                case 15: return [2 /*return*/];
            }
        });
    });
}
/**
 * Obtém histórico de importações para exibição no admin.
 */
function getImportHistory(storeId_1) {
    return __awaiter(this, arguments, void 0, function (storeId, limit) {
        var imports;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.inventoryImport.findMany({
                        where: { storeId: storeId },
                        orderBy: { importedAt: "desc" },
                        take: limit,
                        select: {
                            id: true,
                            fileName: true,
                            totalRows: true,
                            validRows: true,
                            status: true,
                            importedAt: true,
                            supersededAt: true,
                        },
                    })];
                case 1:
                    imports = _a.sent();
                    return [2 /*return*/, imports];
            }
        });
    });
}
/**
 * Conta produtos por fonte (DETAILED vs AGGREGATED) do snapshot ativo.
 */
function getActiveProductsSourceCount(storeId) {
    return __awaiter(this, void 0, void 0, function () {
        var activeImportId, result;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, getActiveImportId(storeId)];
                case 1:
                    activeImportId = _g.sent();
                    if (!activeImportId) {
                        return [2 /*return*/, { detailed: 0, aggregated: 0, total: 0 }];
                    }
                    return [4 /*yield*/, prisma_1.prisma.$queryRaw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n        SELECT\n            COUNT(*) FILTER (WHERE sku IS NOT NULL AND size IS NOT NULL) AS detailed,\n            COUNT(*) FILTER (WHERE sku IS NULL OR size IS NULL) AS aggregated,\n            COUNT(*) AS total\n        FROM products\n        WHERE store_id = ", " AND import_id = ", "\n    "], ["\n        SELECT\n            COUNT(*) FILTER (WHERE sku IS NOT NULL AND size IS NOT NULL) AS detailed,\n            COUNT(*) FILTER (WHERE sku IS NULL OR size IS NULL) AS aggregated,\n            COUNT(*) AS total\n        FROM products\n        WHERE store_id = ", " AND import_id = ", "\n    "])), storeId, activeImportId)];
                case 2:
                    result = _g.sent();
                    return [2 /*return*/, {
                            detailed: Number((_b = (_a = result[0]) === null || _a === void 0 ? void 0 : _a.detailed) !== null && _b !== void 0 ? _b : 0),
                            aggregated: Number((_d = (_c = result[0]) === null || _c === void 0 ? void 0 : _c.aggregated) !== null && _d !== void 0 ? _d : 0),
                            total: Number((_f = (_e = result[0]) === null || _e === void 0 ? void 0 : _e.total) !== null && _f !== void 0 ? _f : 0),
                        }];
            }
        });
    });
}
var templateObject_1;
