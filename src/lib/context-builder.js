"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
exports.buildContext = buildContext;
var prisma_1 = require("./prisma");
var state_manager_1 = require("./state-manager");
var intent_classifier_1 = require("./intent-classifier");
var slot_extractor_1 = require("./slot-extractor");
var products_1 = require("./products");
var stock_agent_1 = require("./stock-agent");
var inventory_snapshot_1 = require("./inventory-snapshot");
function buildContext(params) {
    return __awaiter(this, void 0, void 0, function () {
        var conversationId, userMessage, storeId, storeName, customerName, state, lastMessages, conversationHistory, fullHistoryText, textToExtract, slotExtraction, detectedIntent, mergedSlots, snapshotExists, availableProducts, stockResult, activeImportId, alternatives, fetchedCustomerName, conversation;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    conversationId = params.conversationId, userMessage = params.userMessage, storeId = params.storeId, storeName = params.storeName, customerName = params.customerName;
                    return [4 /*yield*/, (0, state_manager_1.loadState)(conversationId)];
                case 1:
                    state = _e.sent();
                    return [4 /*yield*/, prisma_1.prisma.message.findMany({
                            where: {
                                conversationId: conversationId,
                                NOT: { waMessageId: (_a = params.currentWaMessageId) !== null && _a !== void 0 ? _a : "" }, // Fix 3
                            },
                            orderBy: { timestamp: "desc" }, // Keep original orderBy
                            take: parseInt((_b = process.env.MAX_HISTORY_MESSAGES) !== null && _b !== void 0 ? _b : "8", 10),
                        })];
                case 2:
                    lastMessages = _e.sent();
                    conversationHistory = lastMessages.reverse().map(function (m) { return ({
                        role: (m.direction === "inbound" ? "user" : "assistant"),
                        content: m.content,
                    }); });
                    fullHistoryText = conversationHistory.map(function (m) { return m.content; }).join("\n ");
                    textToExtract = fullHistoryText ? "".concat(fullHistoryText, "\n ").concat(userMessage) : userMessage;
                    slotExtraction = (0, slot_extractor_1.extractSlots)(textToExtract, state.slots);
                    detectedIntent = (0, intent_classifier_1.classifyIntent)(userMessage, state.currentState, conversationHistory);
                    mergedSlots = __assign(__assign({}, state.slots), slotExtraction.extracted);
                    return [4 /*yield*/, (0, inventory_snapshot_1.hasActiveSnapshot)(storeId)];
                case 3:
                    snapshotExists = _e.sent();
                    availableProducts = [];
                    if (!!snapshotExists) return [3 /*break*/, 4];
                    // Sem snapshot ativo — retorna STOCK_UNKNOWN
                    // O Cadu NÃO deve afirmar disponibilidade sem dados
                    console.log("[CONTEXT] \u26A0\uFE0F Sem snapshot ativo para store ".concat(storeId));
                    stockResult = (0, stock_agent_1.createStockUnknownResult)();
                    return [3 /*break*/, 8];
                case 4: return [4 /*yield*/, (0, inventory_snapshot_1.getActiveImportId)(storeId)];
                case 5:
                    activeImportId = _e.sent();
                    return [4 /*yield*/, (0, products_1.findRelevantProducts)(userMessage, storeId, mergedSlots, activeImportId !== null && activeImportId !== void 0 ? activeImportId : undefined)];
                case 6:
                    availableProducts = _e.sent();
                    // 5b. Stock Agent: validate availability (rule-based, 0 LLM tokens)
                    stockResult = (0, stock_agent_1.validateStockRequest)(availableProducts, mergedSlots);
                    if (!(stockResult.status === "UNAVAILABLE")) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, stock_agent_1.findAlternatives)(storeId, mergedSlots, (_c = stockResult.best) === null || _c === void 0 ? void 0 : _c.description)];
                case 7:
                    alternatives = _e.sent();
                    stockResult.alternatives = alternatives;
                    _e.label = 8;
                case 8:
                    fetchedCustomerName = customerName;
                    if (!!fetchedCustomerName) return [3 /*break*/, 10];
                    return [4 /*yield*/, prisma_1.prisma.conversation.findUnique({
                            where: { id: conversationId },
                            include: { customer: { select: { name: true } } },
                        })];
                case 9:
                    conversation = _e.sent();
                    fetchedCustomerName = ((_d = conversation === null || conversation === void 0 ? void 0 : conversation.customer) === null || _d === void 0 ? void 0 : _d.name) || undefined;
                    _e.label = 10;
                case 10: return [2 /*return*/, {
                        conversationId: conversationId,
                        currentState: state.currentState,
                        slots: mergedSlots,
                        messageCount: state.messageCount,
                        stallCount: state.stallCount,
                        frustrationLevel: state.frustrationLevel,
                        lastQuestionType: state.lastQuestionType,
                        userMessage: userMessage,
                        conversationHistory: conversationHistory,
                        customerName: fetchedCustomerName,
                        availableProducts: availableProducts,
                        stockResult: stockResult,
                        storeName: storeName,
                        detectedIntent: detectedIntent,
                        slotExtraction: slotExtraction,
                    }];
            }
        });
    });
}
