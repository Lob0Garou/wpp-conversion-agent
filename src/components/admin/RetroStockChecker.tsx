"use client";

import { useEffect, useState, useRef } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RetroStockCheckerProps {
    /** Modo: "stock" = checagem unitária, "upload" = processamento de arquivo CSV */
    mode?: "stock" | "upload";
    /** Produto/Arquivo sendo consultado */
    productName?: string;
    brand?: string;
    size?: string;
    sku?: string;
    /** Quantidade em estoque (modo 'stock') */
    stock?: number;
    /** Controle de upload (modo 'upload') */
    isUploading?: boolean;
    uploadResult?: { success: boolean; upserted: number; errors: number; total: number };
    /** Callback ao fechar */
    onClose?: () => void;
    /** Auto-fecha após N ms depois do resultado aparecer (0 = não fecha) */
    autoCloseMsAfterResult?: number;
}

// ─── Pixel Art Sprites (via CSS box-shadow rendering) ──────────────────────

// Ícone de caixa de produto em pixel art (10x10)
const BOX_PIXELS = [
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
    [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
];

// Checkmark pixel art (10x10)
const CHECK_PIXELS = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    [0, 1, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// X (sem estoque) pixel art (10x10)
const X_PIXELS = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// Aviso (pouco estoque) pixel art (10x10)
const WARN_PIXELS = [
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
    [0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// ─── Pixel Grid Component ──────────────────────────────────────────────────

function PixelGrid({
    pixels,
    color,
    size = 3,
    className = "",
}: {
    pixels: number[][];
    color: string;
    size?: number;
    className?: string;
}) {
    return (
        <div className={`inline-grid ${className}`} style={{ gap: 1 }}>
            {pixels.map((row, ri) => (
                <div key={ri} style={{ display: "flex", gap: 1 }}>
                    {row.map((cell, ci) => (
                        <div
                            key={ci}
                            style={{
                                width: size,
                                height: size,
                                background: cell ? color : "transparent",
                                imageRendering: "pixelated",
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Scanline Overlay ──────────────────────────────────────────────────────

function Scanlines() {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
                pointerEvents: "none",
                zIndex: 10,
                borderRadius: 4,
            }}
        />
    );
}

// ─── LCD Screen Text Line ──────────────────────────────────────────────────

function LCDLine({
    label,
    value,
    color = "#73a748",
    delay = 0,
    visible = true,
}: {
    label: string;
    value: string;
    color?: string;
    delay?: number;
    visible?: boolean;
}) {
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (!visible) {
            const t = setTimeout(() => setShown(false), 0);
            return () => clearTimeout(t);
        }
        const t = setTimeout(() => setShown(true), delay);
        return () => clearTimeout(t);
    }, [visible, delay]);

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: shown ? 1 : 0,
                transform: shown ? "translateX(0)" : "translateX(-4px)",
                transition: "opacity 0.18s ease, transform 0.18s ease",
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: 9,
                letterSpacing: "0.04em",
                color,
                lineHeight: 1.6,
            }}
        >
            <span style={{ color: "rgba(115,167,72,0.65)", textTransform: "uppercase" }}>{label}</span>
            <span style={{ color, fontWeight: "bold" }}>{value}</span>
        </div>
    );
}

// ─── Blink Cursor ──────────────────────────────────────────────────────────

function BlinkCursor() {
    const [on, setOn] = useState(true);
    useEffect(() => {
        const t = setInterval(() => setOn(v => !v), 530);
        return () => clearInterval(t);
    }, []);
    return (
        <span style={{ display: "inline-block", width: 6, height: 10, background: on ? "#73a748" : "transparent", verticalAlign: "middle" }} />
    );
}

// ─── Progress Bar (pixel style) ───────────────────────────────────────────

function PixelProgressBar({ progress, color }: { progress: number; color: string }) {
    const TOTAL = 20;
    const filled = Math.round((progress / 100) * TOTAL);
    return (
        <div style={{ display: "flex", gap: 2, height: 6 }}>
            {Array.from({ length: TOTAL }, (_, i) => (
                <div
                    key={i}
                    style={{
                        flex: 1,
                        background: i < filled ? color : "rgba(115,167,72,0.2)",
                        transition: "background 0.05s",
                    }}
                />
            ))}
        </div>
    );
}

// ─── Phases ───────────────────────────────────────────────────────────────

type Phase =
    | "boot"           // 0–600ms: CENTAURO logo blink
    | "scanning"       // 600–2400ms: scan animation
    | "result"         // 2400ms+: resultado
    | "closing";

// (Removido SCAN_STEPS hardcoded para usar const steps interno)

// ─── Main Component ────────────────────────────────────────────────────────

export default function RetroStockChecker({
    mode = "stock",
    productName = "Produto",
    brand = "—",
    size = "—",
    sku,
    stock,
    isUploading = false,
    uploadResult,
    onClose,
    autoCloseMsAfterResult = 0,
}: RetroStockCheckerProps) {
    const [phase, setPhase] = useState<Phase>("boot");
    const [scanStep, setScanStep] = useState(0);
    const [progress, setProgress] = useState(0);
    const [stockResult, setStockResult] = useState<number | undefined>(undefined);
    const [visible, setVisible] = useState(false);

    // Dynamic steps based on mode
    const steps = mode === "upload" ? [
        "LENDO ARQUIVO...",
        "PARSING CSV...",
        "VALIDANDO DADOS",
        "SALVANDO DB...",
        "ATUALIZANDO...",
        "FINALIZANDO..."
    ] : [
        "INICIANDO DB...",
        "CONECTANDO...",
        "LENDO INDEX...",
        "BUSCANDO SKU...",
        "VERIFICANDO QTD",
        "CALCULANDO...",
        "PRONTO"
    ];

    const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Mount animation
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 50);
        return () => clearTimeout(t);
    }, []);

    // Boot → Scanning
    useEffect(() => {
        const t = setTimeout(() => setPhase("scanning"), 600);
        return () => clearTimeout(t);
    }, []);

    // Scanning progress
    useEffect(() => {
        if (phase !== "scanning") return;

        let step = 0;
        setScanStep(0);
        setProgress(0);

        const stepMs = mode === "upload" ? 400 : 240;
        const progressMs = mode === "upload" ? 80 : 40;

        const stepInterval = setInterval(() => {
            step++;
            if (step >= steps.length - 1 && mode === "upload" && isUploading) {
                // If uploading, stay on the last "working" step until done
                setScanStep(steps.length - 1);
            } else if (step >= steps.length) {
                clearInterval(stepInterval);
            } else {
                setScanStep(step);
            }
        }, stepMs);

        const progressInterval = setInterval(() => {
            setProgress(prev => {
                const next = prev + (mode === "upload" ? 1.5 : 2.5);

                // Em modo upload, para em 90% se ainda estiver fazendo upload
                if (mode === "upload" && isUploading && next >= 90) {
                    return 90;
                }

                if (next >= 100) {
                    clearInterval(progressInterval);
                    setTimeout(() => {
                        if (mode === "stock") setStockResult(stock);
                        setPhase("result");
                    }, 300);
                    return 100;
                }
                return next;
            });
        }, progressMs);

        return () => {
            clearInterval(stepInterval);
            clearInterval(progressInterval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, isUploading, mode]);

    // Auto-close
    useEffect(() => {
        if (phase === "result" && autoCloseMsAfterResult > 0) {
            autoCloseTimerRef.current = setTimeout(handleClose, autoCloseMsAfterResult);
        }
        return () => {
            if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    function handleClose() {
        setPhase("closing");
        setVisible(false);
        setTimeout(() => onClose?.(), 320);
    }

    // Result config
    const isError = mode === "upload" ? (uploadResult && !uploadResult.success) : stockResult === 0;
    const isOOS = mode === "stock" && stockResult === 0;
    const isLow = mode === "stock" && typeof stockResult === "number" && stockResult > 0 && stockResult <= 5;

    let resultColor = "#4abe4a";
    let resultPixels = CHECK_PIXELS;
    let resultLabel = "OK";

    if (mode === "upload") {
        if (uploadResult?.success) {
            resultColor = "#4abe4a"; resultPixels = CHECK_PIXELS; resultLabel = "ATUALIZADO";
        } else {
            resultColor = "#e05050"; resultPixels = X_PIXELS; resultLabel = "ERRO UPLOAD";
        }
    } else {
        resultColor = isOOS ? "#e05050" : isLow ? "#d4a017" : "#4abe4a";
        resultPixels = isOOS ? X_PIXELS : isLow ? WARN_PIXELS : CHECK_PIXELS;
        resultLabel = isOOS ? "SEM ESTOQUE" : isLow ? `BAIXO: ${stockResult} UN` : `OK: ${stockResult} UN`;
    }

    // LCD green color
    const LCD_BG = "#8bac0f";
    const LCD_DARK = "#306230";
    const LCD_MID = "#73a748";

    return (
        /* ── Backdrop ── */
        <div
            onClick={handleClose}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(3px)",
                opacity: visible ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >

            {/* ── Game Boy Body ── */}
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 280,
                    background: "#c8c8c8",
                    borderRadius: "18px 18px 40px 40px",
                    boxShadow: "inset 0 2px 0 rgba(255,255,255,0.6), inset 0 -3px 0 rgba(0,0,0,0.2), 0 20px 60px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4)",
                    padding: "20px 20px 24px",
                    transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(20px)",
                    transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    position: "relative",
                    userSelect: "none",
                }}
            >

                {/* ── Top strip ── */}
                <div style={{
                    position: "absolute",
                    top: 0,
                    left: "14px",
                    right: "14px",
                    height: 6,
                    background: "linear-gradient(90deg, #9e9e9e, #bebebe, #9e9e9e)",
                    borderRadius: "0 0 3px 3px",
                }} />

                {/* ── Brand label on body ── */}
                <div style={{
                    fontFamily: "'Arial Black', sans-serif",
                    fontSize: 8,
                    fontWeight: 900,
                    letterSpacing: "0.3em",
                    color: "#555",
                    textAlign: "center",
                    marginBottom: 10,
                    textTransform: "uppercase",
                }}>
                    ◆ CENTAURO SCANNER ◆
                </div>

                {/* ── LCD Screen surround ── */}
                <div style={{
                    background: "#3a3a4a",
                    borderRadius: 8,
                    padding: 6,
                    boxShadow: "inset 0 3px 8px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.3)",
                    marginBottom: 14,
                }}>

                    {/* ── LCD Screen ── */}
                    <div style={{
                        background: LCD_BG,
                        borderRadius: 4,
                        padding: "10px 10px 8px",
                        position: "relative",
                        overflow: "hidden",
                        minHeight: 120,
                    }}>
                        <Scanlines />

                        {/* BOOT */}
                        {phase === "boot" && (
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                height: 104,
                                gap: 6,
                            }}>
                                <div style={{
                                    fontFamily: "'Courier New', monospace",
                                    fontSize: 14,
                                    fontWeight: "bold",
                                    color: LCD_DARK,
                                    letterSpacing: "0.1em",
                                    animation: "gb-blink 0.4s step-end infinite",
                                }}>
                                    CENTAURO
                                </div>
                                <div style={{
                                    fontFamily: "'Courier New', monospace",
                                    fontSize: 7,
                                    color: LCD_MID,
                                    letterSpacing: "0.3em",
                                }}>
                                    STOCK v1.0
                                </div>
                            </div>
                        )}

                        {/* SCANNING */}
                        {phase === "scanning" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {/* Product name truncated */}
                                <div style={{
                                    fontFamily: "'Courier New', monospace",
                                    fontSize: 8,
                                    color: LCD_DARK,
                                    fontWeight: "bold",
                                    overflow: "hidden",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    borderBottom: `1px solid ${LCD_DARK}`,
                                    paddingBottom: 3,
                                    marginBottom: 2,
                                }}>
                                    {productName.toUpperCase().slice(0, 28)}
                                </div>

                                {/* Scan step lines */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                                    {steps.map((s, i) => (
                                        <div key={s} style={{
                                            fontFamily: "'Courier New', monospace",
                                            fontSize: 7,
                                            color: i < scanStep ? LCD_DARK : i === scanStep ? LCD_MID : "rgba(115,167,72,0.3)",
                                            alignItems: "center",
                                            gap: 4,
                                            transition: "color 0.15s",
                                            ...((i >= scanStep - 3 && i <= scanStep + 1) ? { display: "flex" } : { display: "none" })
                                        }}>
                                            <span>{i < scanStep ? "■" : i === scanStep ? "▶" : "·"}</span>
                                            <span>{s}</span>
                                            {i === scanStep && <BlinkCursor />}
                                        </div>
                                    ))}
                                </div>

                                {/* Progress bar */}
                                <div style={{ marginTop: 6 }}>
                                    <PixelProgressBar progress={progress} color={LCD_DARK} />
                                    <div style={{
                                        fontFamily: "'Courier New', monospace",
                                        fontSize: 7,
                                        color: LCD_MID,
                                        textAlign: "right",
                                        marginTop: 2,
                                    }}>
                                        {Math.round(progress)}%
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* RESULT */}
                        {(phase === "result" || phase === "closing") && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {/* Header */}
                                <div style={{
                                    fontFamily: "'Courier New', monospace",
                                    fontSize: 7,
                                    color: LCD_MID,
                                    borderBottom: `1px solid ${LCD_DARK}`,
                                    paddingBottom: 3,
                                    textAlign: "center",
                                    letterSpacing: "0.15em",
                                }}>
                                    ── RESULTADO ──
                                </div>

                                {/* Result icon + status */}
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8,
                                }}>
                                    <PixelGrid
                                        pixels={resultPixels}
                                        color={resultColor === "#4abe4a" ? LCD_DARK : resultColor}
                                        size={4}
                                    />
                                    <div style={{
                                        fontFamily: "'Courier New', monospace",
                                        fontSize: 8,
                                        fontWeight: "bold",
                                        color: resultColor === "#4abe4a" ? LCD_DARK : resultColor,
                                        textShadow: resultColor === "#4abe4a" ? "none" : `0 0 6px ${resultColor}`,
                                    }}>
                                        {resultLabel}
                                    </div>
                                </div>

                                {/* Info lines */}
                                <div style={{
                                    background: "rgba(0,0,0,0.08)",
                                    borderRadius: 3,
                                    padding: "4px 6px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}>
                                    {mode === "stock" ? (
                                        <>
                                            <LCDLine label="PROD" value={productName.slice(0, 14).toUpperCase()} delay={0} visible={phase === "result" || phase === "closing"} />
                                            <LCDLine label="MARCA" value={brand.toUpperCase()} delay={80} visible={phase === "result" || phase === "closing"} />
                                            <LCDLine label="TAMA" value={size.toUpperCase()} delay={160} visible={phase === "result" || phase === "closing"} />
                                            {sku && <LCDLine label="SKU" value={sku.slice(0, 14)} delay={240} visible={phase === "result" || phase === "closing"} />}
                                        </>
                                    ) : (
                                        <>
                                            <LCDLine label="FILE" value={productName.slice(0, 14).toUpperCase()} delay={0} visible={phase === "result" || phase === "closing"} />
                                            <LCDLine label="TOTAL" value={String(uploadResult?.total || 0)} delay={80} visible={phase === "result" || phase === "closing"} />
                                            <LCDLine label="CRIADOS" value={String(uploadResult?.upserted || 0)} delay={160} visible={phase === "result" || phase === "closing"} />
                                            {uploadResult?.errors ? <LCDLine label="ERROS" value={String(uploadResult.errors)} delay={240} color="#e05050" visible={phase === "result" || phase === "closing"} /> : null}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── D-Pad area ── */}
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                }}>
                    {/* D-pad */}
                    <div style={{ position: "relative", width: 60, height: 60 }}>
                        {/* Horizontal bar */}
                        <div style={{
                            position: "absolute",
                            left: 0,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "100%",
                            height: "33%",
                            background: "#aaa",
                            borderRadius: 3,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.3)",
                        }} />
                        {/* Vertical bar */}
                        <div style={{
                            position: "absolute",
                            top: 0,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "33%",
                            height: "100%",
                            background: "#aaa",
                            borderRadius: 3,
                            boxShadow: "inset 1px 0 0 rgba(255,255,255,0.4), inset -1px 0 0 rgba(0,0,0,0.3)",
                        }} />
                        {/* Center */}
                        <div style={{
                            position: "absolute",
                            left: "33%",
                            top: "33%",
                            width: "34%",
                            height: "34%",
                            background: "#999",
                        }} />
                    </div>

                    {/* Center area: pixel art box icon */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <PixelGrid pixels={BOX_PIXELS} color="#888" size={2} />
                        <div style={{
                            fontFamily: "'Courier New', monospace",
                            fontSize: 7,
                            color: "#888",
                            letterSpacing: "0.1em",
                        }}>
                            STOCK
                        </div>
                    </div>

                    {/* A/B buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                        {/* B button */}
                        <button
                            onClick={handleClose}
                            title="Fechar"
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: "radial-gradient(circle at 35% 35%, #e06060, #a03030)",
                                border: "none",
                                cursor: "pointer",
                                boxShadow: "0 3px 0 #701010, 0 4px 6px rgba(0,0,0,0.4)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "'Courier New', monospace",
                                fontSize: 7,
                                color: "rgba(255,255,255,0.7)",
                                fontWeight: "bold",
                                transform: "translateY(0)",
                                transition: "transform 0.08s, box-shadow 0.08s",
                            }}
                            onMouseDown={e => {
                                (e.currentTarget as HTMLElement).style.transform = "translateY(2px)";
                                (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 0 #701010, 0 2px 4px rgba(0,0,0,0.4)";
                            }}
                            onMouseUp={e => {
                                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                                (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 0 #701010, 0 4px 6px rgba(0,0,0,0.4)";
                            }}
                        >
                            B
                        </button>
                        {/* A button */}
                        <button
                            onClick={handleClose}
                            title="OK"
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "radial-gradient(circle at 35% 35%, #6060e0, #3030a0)",
                                border: "none",
                                cursor: "pointer",
                                boxShadow: "0 3px 0 #101070, 0 4px 6px rgba(0,0,0,0.4)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "'Courier New', monospace",
                                fontSize: 8,
                                color: "rgba(255,255,255,0.7)",
                                fontWeight: "bold",
                                transform: "translateY(0)",
                                transition: "transform 0.08s, box-shadow 0.08s",
                            }}
                            onMouseDown={e => {
                                (e.currentTarget as HTMLElement).style.transform = "translateY(2px)";
                                (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 0 #101070, 0 2px 4px rgba(0,0,0,0.4)";
                            }}
                            onMouseUp={e => {
                                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                                (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 0 #101070, 0 4px 6px rgba(0,0,0,0.4)";
                            }}
                        >
                            A
                        </button>
                    </div>
                </div>

                {/* ── Select/Start buttons ── */}
                <div style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 12,
                    marginTop: 2,
                }}>
                    {["SELECT", "START"].map(label => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <button
                                onClick={label === "START" ? handleClose : undefined}
                                style={{
                                    width: 34,
                                    height: 8,
                                    background: "#999",
                                    borderRadius: 4,
                                    border: "none",
                                    cursor: label === "START" ? "pointer" : "default",
                                    boxShadow: "inset 0 2px 3px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.4)",
                                }}
                            />
                            <span style={{
                                fontFamily: "Arial, sans-serif",
                                fontSize: 6,
                                color: "#777",
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                            }}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* ── Speaker grille ── */}
                <div style={{
                    position: "absolute",
                    bottom: 18,
                    right: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                }}>
                    {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} style={{
                            display: "flex",
                            gap: 3,
                        }}>
                            {Array.from({ length: 4 }, (_, j) => (
                                <div key={j} style={{
                                    width: 2.5,
                                    height: 2.5,
                                    borderRadius: "50%",
                                    background: "#aaa",
                                    boxShadow: "inset 0 1px 0 rgba(0,0,0,0.3)",
                                }} />
                            ))}
                        </div>
                    ))}
                </div>

                {/* ── Indicator LED ── */}
                <div style={{
                    position: "absolute",
                    top: 32,
                    left: 22,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: phase === "result"
                        ? (isError ? "#e05050" : isLow ? "#d4a017" : "#4abe4a")
                        : "#4abe4a",
                    boxShadow: phase === "result"
                        ? (isError ? "0 0 8px #e05050" : isLow ? "0 0 8px #d4a017" : "0 0 8px #4abe4a")
                        : "0 0 4px #4abe4a",
                    animation: phase !== "result" ? "gb-led-blink 1s step-end infinite" : "none",
                }} />

            </div>

            {/* ── Keyframe styles injected ── */}
            <style>{`
        @keyframes gb-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes gb-led-blink {
          0%, 49% { opacity: 1; box-shadow: 0 0 6px #4abe4a; }
          50%, 100% { opacity: 0.3; box-shadow: none; }
        }
      `}</style>
        </div>
    );
}
