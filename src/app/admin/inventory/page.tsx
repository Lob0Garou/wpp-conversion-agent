"use client";

import { useState, useRef } from "react";
import RetroStockChecker from "@/components/admin/RetroStockChecker";

export default function InventoryPage() {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const [showRetro, setShowRetro] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ success: boolean; upserted: number; errors: number; total: number } | undefined>();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus("idle");
            setMessage("");
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped && dropped.name.endsWith(".csv")) {
            setFile(dropped);
            setStatus("idle");
            setMessage("");
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setStatus("uploading");
        setMessage("");
        setUploadResult(undefined);
        setShowRetro(true);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/inventory/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setStatus("success");
                setMessage(data.message || "Estoque atualizado com sucesso!");
                setUploadResult({ success: true, upserted: data.upserted || 0, errors: data.invalidRows || 0, total: data.totalRows || 0 });
            } else {
                setStatus("error");
                setMessage(data.error || "Erro ao atualizar estoque.");
                setUploadResult({ success: false, upserted: 0, errors: 0, total: 0 });
            }
        } catch {
            setStatus("error");
            setMessage("Erro de conexão com o servidor.");
            setUploadResult({ success: false, upserted: 0, errors: 0, total: 0 });
        }
    };

    return (
        <div className="h-full bg-[#0f1117] flex flex-col relative w-full overflow-hidden">
            {showRetro && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10000 }}>
                    <RetroStockChecker
                        mode="upload"
                        productName={file?.name || "ARQUIVO CSV"}
                        isUploading={status === "uploading"}
                        uploadResult={uploadResult}
                        autoCloseMsAfterResult={4000}
                        onClose={() => setShowRetro(false)}
                    />
                </div>
            )}
            {/* Header */}
            <div className="px-8 py-6 border-b border-[#2e3440]">
                <h1 className="text-[#e8eaed] text-xl font-bold">Gestão de Estoque</h1>
                <p className="text-[#6b7280] text-sm mt-0.5">
                    Importe um arquivo CSV para atualizar o catálogo de produtos
                </p>
            </div>

            {/* Content */}
            <div className="flex-1 px-8 py-8 flex flex-col items-center justify-start">
                <div className="w-full max-w-lg space-y-4">

                    {/* Format info */}
                    <div className="bg-[#1a1d23] border border-[#2e3440] rounded-xl px-4 py-3 flex gap-3 items-start">
                        <span className="text-lg mt-0.5">ℹ️</span>
                        <div>
                            <div className="text-[#e8eaed] text-sm font-medium">Formato esperado</div>
                            <div className="text-[#6b7280] text-xs mt-0.5">
                                Arquivo <code className="bg-[#22262f] px-1 py-0.5 rounded text-[#25D366]">.csv</code> com colunas:{" "}
                                <code className="bg-[#22262f] px-1 py-0.5 rounded text-[#e8eaed]">Descrição, Quantidade</code>
                            </div>
                        </div>
                    </div>

                    {/* Drop zone */}
                    <div
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center ${dragging
                                ? "border-[#25D366] bg-[#25D366]/5"
                                : file
                                    ? "border-[#25D366]/40 bg-[#1a1d23]"
                                    : "border-[#2e3440] bg-[#1a1d23] hover:border-[#3e4450] hover:bg-[#22262f]"
                            }`}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {file ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center text-2xl">
                                    📄
                                </div>
                                <div>
                                    <div className="text-[#e8eaed] text-sm font-medium">{file.name}</div>
                                    <div className="text-[#6b7280] text-xs mt-0.5">
                                        {(file.size / 1024).toFixed(1)} KB · Clique para trocar
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-[#22262f] border border-[#2e3440] flex items-center justify-center text-2xl">
                                    📂
                                </div>
                                <div>
                                    <div className="text-[#e8eaed] text-sm font-medium">
                                        Arraste o CSV aqui
                                    </div>
                                    <div className="text-[#6b7280] text-xs mt-0.5">
                                        ou clique para selecionar
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Upload button */}
                    <button
                        onClick={handleUpload}
                        disabled={!file || status === "uploading"}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#25D366] hover:bg-[#1ebe57] text-white disabled:bg-[#22262f] disabled:text-[#6b7280]"
                    >
                        {status === "uploading" ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Enviando...
                            </span>
                        ) : (
                            "Atualizar Estoque"
                        )}
                    </button>

                    {/* Result message */}
                    {message && (
                        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm ${status === "success"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}>
                            <span className="mt-0.5">{status === "success" ? "✅" : "❌"}</span>
                            <span>{message}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
