"use strict";
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
var dotenv = require("dotenv");
dotenv.config({ path: '.env.sandbox' });
process.env.DATABASE_URL = process.env.SANDBOX_DATABASE_URL;
var runtime_langgraph_1 = require("../src/lib/agent/runtime-langgraph");
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: process.env.SANDBOX_DATABASE_URL
        }
    }
});
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var cust, conv, runtime, context, messages, i, result, c_1, s_1, size, c, s;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Starting 20 turns compaction test...");
                    return [4 /*yield*/, prisma.customer.create({
                            data: {
                                phone: "5511".concat(Date.now()).substring(0, 13),
                                name: "Test Compaction",
                                store: {
                                    connect: { id: "cm78c59p60000aayzrmm3ryc4" }
                                }
                            }
                        })];
                case 1:
                    cust = _a.sent();
                    return [4 /*yield*/, prisma.conversation.create({
                            data: {
                                storeId: "cm78c59p60000aayzrmm3ryc4", // Centauro sandbox
                                customerId: cust.id,
                                status: "active",
                                messageCount: 0,
                                slots: {}
                            }
                        })];
                case 2:
                    conv = _a.sent();
                    runtime = new runtime_langgraph_1.LangGraphRuntime();
                    context = {
                        conversationId: conv.id,
                        customerId: cust.id,
                        customerPhone: cust.phone,
                        storeId: conv.storeId
                    };
                    messages = [
                        "Oi, tudo bem?",
                        "Meu nome é Yuri, qual o seu?",
                        "Você vende tênis?",
                        "Tem da Nike?",
                        "Qual o preço?",
                        "Tem tamanho 42?",
                        "Quais as cores disponíveis para esse Nike 42?",
                        "Aceitam PIX na loja?",
                        "Legal. Qual o prazo de entrega se eu pedir agora?",
                        "Eles têm garantia legal?",
                        "Entendi. Como faço pra trocar se por acaso o 42 ficar apertado?",
                        "Para acelerar as coisas, vocês têm loja física em SP?",
                        "Maravilha. Por acaso vende meia também para combinar?",
                        "Rolaria um descontinho se eu levar os dois (o tênis Nike e a meia)?",
                        "Ah legal. Qual o material desse tênis?",
                        "Certeza que é original né?",
                        "Beleza, após o pagamento, como eu rastreio meu pedido?",
                        "Ao invés de entregar, tem como eu simplesmente retirar na loja?",
                        "Aliás, teremos promoção dele na Black Friday?",
                        "Fechado, vou querer o Nike branco tamanho 42."
                    ];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 10, 12]);
                    i = 0;
                    _a.label = 4;
                case 4:
                    if (!(i < messages.length)) return [3 /*break*/, 8];
                    console.log("\n\n--- Turno ".concat(i + 1, " ---"));
                    console.log("User: ".concat(messages[i]));
                    return [4 /*yield*/, runtime.generateReply(messages[i], context)];
                case 5:
                    result = _a.sent();
                    // LangGraph generateReply usually returns { messages: [AIMessage] } or similar based on AgentRuntime interface. 
                    // In our `callModel` implementation we mapped response to what `Orchestrator` expects, but let's just log result stringified.
                    console.log("Agent:", JSON.stringify(result));
                    return [4 /*yield*/, prisma.conversation.findUnique({ where: { id: conv.id } })];
                case 6:
                    c_1 = _a.sent();
                    s_1 = c_1;
                    size = s_1.langgraphState ? JSON.stringify(s_1.langgraphState).length : 0;
                    console.log("-> STATE SIZE: ".concat(size, " bytes"));
                    _a.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 4];
                case 8:
                    console.log("\n=== TEST DONE ===");
                    return [4 /*yield*/, prisma.conversation.findUnique({ where: { id: conv.id } })];
                case 9:
                    c = _a.sent();
                    s = c;
                    console.log("Final state size: ".concat(s.langgraphState ? JSON.stringify(s.langgraphState).length : 0, " bytes"));
                    return [3 /*break*/, 12];
                case 10: return [4 /*yield*/, prisma.conversation.delete({ where: { id: conv.id } })];
                case 11:
                    _a.sent();
                    console.log("Cleanup done.");
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error("FATAL ERROR IN SCRIPT:");
    console.error(err);
    process.exit(1);
});
