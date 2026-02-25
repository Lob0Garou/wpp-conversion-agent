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
exports.loadState = loadState;
exports.updateSlots = updateSlots;
exports.transitionTo = transitionTo;
exports.incrementStall = incrementStall;
exports.resetStall = resetStall;
exports.incrementFrustration = incrementFrustration;
exports.incrementMessageCount = incrementMessageCount;
exports.setLastQuestionType = setLastQuestionType;
exports.isHumanLocked = isHumanLocked;
exports.lockToHuman = lockToHuman;
exports.unlockFromHuman = unlockFromHuman;
var prisma_1 = require("./prisma");
// ─── STATE MANAGER (Neutral Persistence Layer) ───
function loadState(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var conv;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.findUniqueOrThrow({
                        where: { id: conversationId },
                        select: {
                            currentState: true,
                            slots: true,
                            messageCount: true,
                            stallCount: true,
                            lastQuestionType: true,
                            frustrationLevel: true,
                            botStatus: true,
                            handoffUntil: true,
                            alertSent: true,
                        },
                    })];
                case 1:
                    conv = _a.sent();
                    return [2 /*return*/, {
                            currentState: conv.currentState,
                            slots: conv.slots || {},
                            messageCount: conv.messageCount,
                            stallCount: conv.stallCount,
                            lastQuestionType: conv.lastQuestionType,
                            frustrationLevel: conv.frustrationLevel,
                            botStatus: conv.botStatus || 'BOT',
                            handoffUntil: conv.handoffUntil,
                            alertSent: conv.alertSent,
                        }];
            }
        });
    });
}
function updateSlots(conversationId, newSlots, currentSlots) {
    return __awaiter(this, void 0, void 0, function () {
        var existingSlots, conv, mergedSlots;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    existingSlots = currentSlots;
                    if (!!existingSlots) return [3 /*break*/, 2];
                    return [4 /*yield*/, prisma_1.prisma.conversation.findUniqueOrThrow({
                            where: { id: conversationId },
                            select: { slots: true },
                        })];
                case 1:
                    conv = _a.sent();
                    existingSlots = conv.slots || {};
                    _a.label = 2;
                case 2:
                    mergedSlots = __assign(__assign({}, existingSlots), newSlots);
                    return [4 /*yield*/, prisma_1.prisma.conversation.update({
                            where: { id: conversationId },
                            data: { slots: mergedSlots },
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function transitionTo(conversationId, newState, reason, storeId) {
    return __awaiter(this, void 0, void 0, function () {
        var conv, oldState;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.findUniqueOrThrow({
                        where: { id: conversationId },
                        select: { currentState: true, storeId: true },
                    })];
                case 1:
                    conv = _a.sent();
                    oldState = conv.currentState;
                    return [4 /*yield*/, Promise.all([
                            prisma_1.prisma.conversation.update({
                                where: { id: conversationId },
                                data: {
                                    currentState: newState,
                                    stallCount: 0, // Reset stall on transition
                                },
                            }),
                            prisma_1.prisma.auditLog.create({
                                data: {
                                    storeId: storeId || conv.storeId,
                                    event: "STATE_TRANSITION",
                                    metadata: {
                                        conversationId: conversationId,
                                        fromState: oldState,
                                        toState: newState,
                                        reason: reason,
                                    },
                                },
                            }),
                        ])];
                case 2:
                    _a.sent();
                    console.log("[STATE] \uD83D\uDD04 ".concat(oldState, " \u2192 ").concat(newState, " (reason: ").concat(reason, ")"));
                    return [2 /*return*/];
            }
        });
    });
}
function incrementStall(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var conv;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { stallCount: { increment: 1 } },
                        select: { stallCount: true },
                    })];
                case 1:
                    conv = _a.sent();
                    console.log("[STATE] \u23F8\uFE0F Stall count: ".concat(conv.stallCount));
                    return [2 /*return*/, conv.stallCount];
            }
        });
    });
}
function resetStall(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { stallCount: 0 },
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function incrementFrustration(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var conv;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { frustrationLevel: { increment: 1 } },
                        select: { frustrationLevel: true },
                    })];
                case 1:
                    conv = _a.sent();
                    console.log("[STATE] \uD83D\uDE24 Frustration level: ".concat(conv.frustrationLevel));
                    return [2 /*return*/, conv.frustrationLevel];
            }
        });
    });
}
function incrementMessageCount(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var conv;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { messageCount: { increment: 1 } },
                        select: { messageCount: true },
                    })];
                case 1:
                    conv = _a.sent();
                    return [2 /*return*/, conv.messageCount];
            }
        });
    });
}
function setLastQuestionType(conversationId, questionType) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { lastQuestionType: questionType },
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ─── HUMAN LOOP HELPERS ───
function isHumanLocked(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var conv;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: {
                            botStatus: true,
                            handoffUntil: true,
                        },
                    })];
                case 1:
                    conv = _a.sent();
                    if (!conv || conv.botStatus !== 'HUMAN') {
                        return [2 /*return*/, false];
                    }
                    if (!(conv.handoffUntil && new Date() > conv.handoffUntil)) return [3 /*break*/, 3];
                    // Auto-unlock: volta para BOT
                    return [4 /*yield*/, prisma_1.prisma.conversation.update({
                            where: { id: conversationId },
                            data: {
                                botStatus: 'BOT',
                                handoffUntil: null,
                            },
                        })];
                case 2:
                    // Auto-unlock: volta para BOT
                    _a.sent();
                    console.log("[HUMAN_LOOP] \uD83D\uDD13 Conversa ".concat(conversationId, " destravada automaticamente (fim do dia)"));
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/, conv.handoffUntil !== null && conv.handoffUntil > new Date()];
            }
        });
    });
}
function lockToHuman(conversationId, alertSent) {
    return __awaiter(this, void 0, void 0, function () {
        var now, endOfDay;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = new Date();
                    endOfDay = new Date(now);
                    endOfDay.setHours(23, 59, 59, 999);
                    return [4 /*yield*/, prisma_1.prisma.conversation.update({
                            where: { id: conversationId },
                            data: {
                                botStatus: 'HUMAN',
                                handoffUntil: endOfDay,
                                alertSent: alertSent ? {
                                    type: alertSent.type,
                                    sentAt: now,
                                    messageId: alertSent.messageId,
                                    groupId: alertSent.groupId,
                                } : undefined,
                            },
                        })];
                case 1:
                    _a.sent();
                    console.log("[HUMAN_LOOP] \uD83D\uDD12 Conversa ".concat(conversationId, " travada at\u00E9 ").concat(endOfDay.toISOString()));
                    return [2 /*return*/];
            }
        });
    });
}
function unlockFromHuman(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.conversation.update({
                        where: { id: conversationId },
                        data: {
                            botStatus: 'BOT',
                            handoffUntil: null,
                        },
                    })];
                case 1:
                    _a.sent();
                    console.log("[HUMAN_LOOP] \uD83D\uDD13 Conversa ".concat(conversationId, " destravada manualmente"));
                    return [2 /*return*/];
            }
        });
    });
}
