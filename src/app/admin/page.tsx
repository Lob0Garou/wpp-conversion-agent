"use client";

import { useAdminTab } from "@/contexts/AdminTabContext";
import VendasTab from "@/app/admin/tabs/VendasTab";
import EstoqueTab from "@/app/admin/tabs/EstoqueTab";
import PerdidosTab from "@/app/admin/tabs/PerdidosTab";
import LangGraphAuditTab from "@/app/admin/tabs/LangGraphAuditTab";

export default function AdminPage() {
    const { activeTab } = useAdminTab();

    return (
        <div className="flex-1 h-full overflow-hidden">
            {activeTab === "vendas" && <VendasTab />}
            {activeTab === "estoque" && <EstoqueTab />}
            {activeTab === "perdidos" && <PerdidosTab />}
            {activeTab === "langgraph" && <LangGraphAuditTab />}
        </div>
    );
}
