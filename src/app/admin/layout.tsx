import type { Metadata } from "next";
import { AdminTabProvider } from "@/contexts/AdminTabContext";
import AdminHeader from "@/components/admin/AdminHeader";

export const metadata: Metadata = {
    title: "Centauro Elite Cockpit | SaaS CRM",
    description: "Painel de atendimento de alta performance",
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AdminTabProvider>
            <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-deep)] text-[var(--text-primary)]">
                <AdminHeader />
                <main className="flex-1 overflow-hidden relative">
                    {children}
                </main>
            </div>
        </AdminTabProvider>
    );
}
