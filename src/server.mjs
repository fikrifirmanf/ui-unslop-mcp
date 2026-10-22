#!/usr/bin/env node
import { run, byExt } from "unslop-core";
import { rules } from "./rules.mjs";
import { checkContrast } from "./color.mjs";
import { analyzeDesignTokens } from "./tokens.mjs";

await run({
  packageUrl: new URL("../package.json", import.meta.url),
  skill: "ui-unslop",
  description: "UI design-craft and accessibility anti-slop rules (hierarchy, color, type, spacing, motion, WCAG) for any web stack.",
  auditTool: "audit_ui_slop",
  auditDescription:
    "Deterministically scans markup and stylesheets for UI slop and accessibility failures: low-contrast Tailwind text/background pairs, images without alt, clickable divs, unlabelled icon buttons, removed focus rings, disabled zoom, positive tabindex, tiny text, emoji icons, gradient text, glassmorphism, transition-all, 100vh, z-index wars and placeholder-only labels.",
  rules,
  accept: byExt(".tsx", ".jsx", ".html", ".htm", ".vue", ".svelte", ".astro", ".mdx", ".css", ".scss", ".less"),
  tools: [
    {
      name: "check_contrast",
      description:
        "Computes WCAG 2.x contrast ratios. Colors may be #hex, rgb(), hsl(), oklch(), CSS names or Tailwind v4 palette names (slate-400, text-slate-400/80). Returns AA/AAA pass and, for Tailwind colors, the nearest passing shade. Use it before choosing text, border and focus colors.",
      inputSchema: {
        type: "object",
        properties: {
          pairs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fg: { type: "string" },
                bg: { type: "string" },
                large: { type: "boolean", description: "Text >= 24px, or >= 18.66px bold (3:1 target)" },
                ui: { type: "boolean", description: "Non-text UI: borders of inputs, focus rings, icons (3:1 target)" },
              },
              required: ["fg", "bg"],
            },
          },
          fg: { type: "string" },
          bg: { type: "string" },
          large: { type: "boolean" },
        },
      },
      handler: async (args) => checkContrast(args),
    },
    {
      name: "analyze_design_tokens",
      description:
        "Inventories hardcoded design values across stylesheets and markup: distinct colors, font sizes, radii, shadows, z-indexes, font families and off-grid spacing. Flags sprawl beyond a coherent system so you consolidate into tokens instead of inventing more one-offs.",
      inputSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" }, description: "Files or directories (default: whole workspace)" },
          grid: { type: "number", description: "Spacing grid in px (default 4)" },
        },
      },
      handler: analyzeDesignTokens,
    },
  ],
});
