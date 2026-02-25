import type { Template } from "../template-engine";
import { infoTemplates } from "./info";
import { salesTemplates } from "./sales";
import { sacTemplates } from "./sac";

/**
 * Todos os templates combinados
 */
export const allTemplates: Template[] = [
    ...infoTemplates,
    ...salesTemplates,
    ...sacTemplates,
];

export { infoTemplates, salesTemplates, sacTemplates };
