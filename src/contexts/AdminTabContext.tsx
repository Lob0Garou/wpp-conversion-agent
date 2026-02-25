"use client";

import { createContext, useContext, useState } from "react";

export type AdminTab = "vendas" | "estoque" | "perdidos" | "langgraph";

interface AdminTabContextType {
    activeTab: AdminTab;
    setActiveTab: (tab: AdminTab) => void;
}

export const AdminTabContext = createContext<AdminTabContextType>({
    activeTab: "vendas",
    setActiveTab: () => { },
});

export function useAdminTab() {
    return useContext(AdminTabContext);
}

export function AdminTabProvider({ children }: { children: React.ReactNode }) {
    const [activeTab, setActiveTab] = useState<AdminTab>("vendas");
    return (
        <AdminTabContext.Provider value={{ activeTab, setActiveTab }}>
            {children}
        </AdminTabContext.Provider>
    );
}
