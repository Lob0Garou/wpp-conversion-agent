# Admin Dashboard — Design System Guardrail

> **This document is the source of truth for the admin UI.**
> Every component under `/components/admin/` must follow these rules.
> Violations will cause visual drift and inconsistency.

---

## Typography — 3-Tier System

| Tier    | Token              | Rendered | Use case                           |
|---------|--------------------|----------|------------------------------------|
| **xs**  | `var(--text-xs)`   | 11px     | Labels, badges, metadata, CTAs     |
| **sm**  | `var(--text-sm)`   | 13px     | Body text, quotes, detail rows     |
| **base**| `var(--text-base)` | 15px     | Titles (only if emphasis needed)   |

**Rules:**

- Card titles use `text-sm font-bold` (14px Tailwind) — not `text-base`.
- Labels are always `text-[var(--text-xs)] font-bold uppercase tracking-widest`.
- Never use raw pixel sizes like `text-[10px]` or `text-[9px]`.

---

## Color Tokens

### Backgrounds

| Token               | Hex       | Use                        |
|----------------------|-----------|----------------------------|
| `--bg-deep`          | `#0f1117` | Page/tab backgrounds       |
| `--bg-surface`       | `#1a1d23` | Card surfaces, inputs       |
| `--bg-elevated`      | `#22262f` | Hover states, raised areas  |
| `--bg-overlay`       | `#2a2e38` | Pop-overs, dropdowns        |

### Borders

| Token               | Hex       | Use                        |
|----------------------|-----------|----------------------------|
| `--border-subtle`    | `#2e3440` | Default card/input borders  |
| `--border-default`   | `#374151` | Hover/focus borders         |
| `--border-strong`    | `#4b5563` | Active/selected borders     |

### Text

| Token               | Hex       | Use                        |
|----------------------|-----------|----------------------------|
| `--text-primary`     | `#ffffff` | Titles, names               |
| `--text-secondary`   | `#9ca3af` | Body text, values           |
| `--text-muted`       | `#6b7280` | Labels, placeholders        |

### Semantic

| Token               | Use                            |
|----------------------|--------------------------------|
| `--color-brand`      | Centauro red — CTAs, SAC label |
| `--color-danger`     | Critical variant border/badge  |
| `--color-ai-sales`   | VENDAS variant label           |
| `--color-brand-green` | WhatsApp green — focus rings  |
| `--color-brand-green-dark` | CTA buttons (SAC form)  |

### ⛔ Never use hardcoded hex

```diff
- className="bg-[#1a1d23] border-[#2e3440] text-[#6b7280]"
+ className="bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)]"
```

---

## Card Structure — CardShell

All conversation cards **must** use `CardShell`. No exceptions.

```
┌─────────────────────────────────────────────┐
│ HEADER: categoryLabel + badge  │  timeAgo   │
│ Title: displayName (text-sm, truncate)      │
├─────────────────────────────────────────────┤
│ BODY: metadata? + quote? (line-clamp-2)     │
├─────────────────────────────────────────────┤
│ FOOTER: avatar + name  │  footerCta         │
└─────────────────────────────────────────────┘
```

**Rules:**

- Structure is immutable — all variants share this exact layout.
- Visual differences come ONLY from `VARIANT_STYLES` (border, label color, avatar, shadow).
- `extraClassName` is for variant-specific animations (e.g. `animate-pulse-red`), NOT layout overrides.
- Body uses `flex-1 overflow-hidden` — content can never break out.
- Footer uses `mt-auto` — always pinned to bottom.

### ⛔ Don'ts

```diff
- <div className="absolute bottom-2 right-2">  // No absolute positioning
- <div className="pb-12">                       // No spacer hacks
- <div className="grid grid-cols-2">            // No layout switching inside cards
```

### ✅ Do's

```diff
+ <CardShell variant="VENDAS" ... />           // Always use CardShell
+ metadata={<ProductSummary data={data} />}    // Pass content as slots
+ footerCta={footerCtaFor(variant, isClosed)}  // Use shared CTA dispatcher
```

---

## CTA Buttons — Rules

Three shared helpers exist in `ConversationCard.tsx`. Use them:

| Component       | Usage           | Style                          |
|-----------------|-----------------|--------------------------------|
| `EncerradoBadge`| Closed cards     | Muted border badge             |
| `ResolveBtn`    | VENDAS/SAC/GERAL | Emerald check_circle icon     |
| `PrioritizeBtn` | CRITICAL only    | Red filled button              |

**Dispatcher:** `footerCtaFor(variant, isClosed, onResolve)` — always use this.

**Rules:**

- CTAs live in the footer zone only — never float or overlap content.
- All CTAs use `e.stopPropagation()` to prevent card click-through.
- Hover states: `hover:text-emerald-300` (resolve), `hover:brightness-110` (prioritize).
- Focus rings use `active:scale-90` or `active:scale-95` for tactile feedback.

### ⛔ Don'ts

```diff
- <button className="opacity-50 hover:opacity-100">   // No custom opacity per variant
- <button className="absolute bottom-2 right-2">      // No absolute positioning
- <div className="bg-red-600 text-white px-2 py-1">   // No inline CTA styling
```

---

## ProductSummary — Rules

Used ONLY inside VENDAS cards via the `metadata` slot.

**Rules:**

1. Always renders the SAME structure — never switches layouts.
2. Optional rows disappear; the container stays constant.
3. Shows "Produto não identificado" if zero data extracted.
4. Never shows empty labels like `"Mod —"`.
5. Headline is always `{Category} · {Brand}` or fallback from `slots.product`.

---

## Spacing — 8px Rhythm

- Card padding: `p-4` (16px)
- Grid gap: `gap-6` (24px)
- Section spacing: `mb-3` (12px) between header/body/footer
- Footer separator: `pt-3 border-t`
- Icon sizes: 11–12px for labels, 16px for badges, 24px+ for CTAs

---

## Developer Warnings

> [!CAUTION]
>
> 1. **Never use hardcoded hex** — always reference `design-system.css` tokens.
> 2. **Never create new card layouts** — always use `CardShell` with slots.
> 3. **Never use absolute positioning** inside cards — footer is flexbox-pinned.
> 4. **Never add font sizes outside the 3 tiers** — use `--text-xs`, `--text-sm`, or `--text-base`.
> 5. **Never duplicate CTA markup** — use `footerCtaFor()` or the 3 shared helpers.
> 6. **Never show empty labels** — conditionally render, or omit the row entirely.
