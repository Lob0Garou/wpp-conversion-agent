import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Painel de Atendimento | WhatsApp Agent",
    description: "Painel de atendimento para operadores da loja",
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen w-screen overflow-hidden bg-[#111b21]">
            {children}
        </div>
    );
}
