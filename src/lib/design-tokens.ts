/**
 * Centauro Sales Console — Design Tokens
 * Single source of truth for colors, spacing, and typography
 */

export const colors = {
    // Brand colors
    brand: "#00A651",
    brandLight: "#E8F7EE",
    brandDark: "#007A3D",

    // Semantic colors
    warning: "#F5A623",
    warningLight: "#FFF4E0",
    danger: "#E53935",
    dangerLight: "#FDECEA",
    info: "#1565C0",
    infoLight: "#E3F0FF",

    // Text colors
    text900: "#1A1A1A",
    text700: "#424242",
    text500: "#757575",
    text300: "#E0E0E0",

    // Background colors
    bg100: "#F5F5F5",

    // Additional utility colors
    white: "#FFFFFF",
    timestamp: "#9E9E9E",

    // Warning text (for Novo cliente tag)
    warningText: "#7A5000",
} as const;

export const spacing = {
    xs: 4,   // 4px
    sm: 8,   // 8px
    md: 16,  // 16px
    lg: 24,  // 24px
    xl: 32,  // 32px
} as const;

export const typography = {
    // Section titles
    sectionTitle: {
        size: "18px",
        weight: 600,
    },
    // Data labels
    label: {
        size: "12px",
        weight: 500,
        color: colors.text500,
    },
    // Critical values (LTV, score, price)
    criticalValue: {
        size: "14px",
        weight: 700,
        color: colors.text900,
    },
    // Timestamps
    timestamp: {
        size: "11px",
        weight: 400,
        color: colors.timestamp,
    },
    // Micro text
    micro: {
        size: "11px",
        weight: 400,
    },
} as const;

// CSS variable mappings for use in styles
export const cssVars = {
    colors: {
        brand: "var(--color-brand-green)",
        brandLight: "var(--color-brand-green-light)",
        brandDark: "var(--color-brand-green-dark)",
        warning: "var(--color-warning)",
        warningLight: "var(--color-warning-light)",
        danger: "var(--color-danger)",
        dangerLight: "var(--color-danger-light)",
        text900: "var(--text-primary)",
        text700: "var(--text-secondary)",
        text500: "var(--text-muted)",
        bg100: "var(--bg-elevated)",
    },
    spacing: {
        xs: "var(--space-1)",
        sm: "var(--space-2)",
        md: "var(--space-4)",
        lg: "var(--space-6)",
        xl: "var(--space-8)",
    },
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;