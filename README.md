# ui-unslop-mcp

> Make AI-built interfaces look designed and pass accessibility: WCAG contrast (computed from Tailwind class pairs), a11y failures, design-token sprawl and the visual tells of generated UI, for any web stack.

[![npm](https://img.shields.io/npm/v/ui-unslop-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/ui-unslop-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io)

An **agent skill** plus an **MCP server** in one package. The skill tells your coding agent what slop to avoid; the MCP tools then *deterministically verify* the result, so the agent can't just claim it's done.

Works with **Claude Code**, **Claude Desktop**, **Codex** and **Antigravity**.

## What it catches

| Rule | Severity | Catches |
| --- | --- | --- |
| `LOW_CONTRAST_TEXT` | ERROR | Text/background pair fails WCAG AA contrast. |
| `IMG_WITHOUT_ALT` | ERROR | Image without alt. Describe it, or use alt="" for purely decorative images. |
| `CLICKABLE_NON_INTERACTIVE` | ERROR | onClick on a non-interactive element: unreachable by keyboard and screen readers. Use <button> or <a href>. |
| `ICON_ONLY_CONTROL_UNLABELLED` | ERROR | Icon-only button/link has no accessible name. Add aria-label. |
| `FOCUS_INDICATOR_REMOVED` | ERROR | Focus outline removed without a replacement. Keep a visible focus-visible style (ring/outline) for keyboard users. |
| `ZOOM_DISABLED` | ERROR | Pinch-zoom disabled. Low-vision users need zoom; remove user-scalable=no / maximum-scale=1. |
| `POSITIVE_TABINDEX` | ERROR | Positive tabindex scrambles keyboard order. Use 0 or -1 and fix the DOM order instead. |
| `TINY_TEXT` | ERROR | Text below 12px is unreadable on most screens. Use 12px+ (14px+ for body copy). |
| `EMOJI_AS_ICON` | WARN | Emoji used as UI iconography reads as a generated template. Use the project's icon set (or nothing). |
| `GRADIENT_TEXT` | WARN | Gradient-filled headline text is the default AI landing-page look and often fails contrast. Use a solid token color. |
| `GLASSMORPHISM_CARD` | WARN | Frosted-glass card (bg-white/10 + backdrop-blur) is a generated-UI tell and hurts legibility. Use a solid surface token. |
| `TRANSITION_ALL` | WARN | transition-all animates layout properties and causes jank. Transition specific properties (colors, opacity, transform). |
| `FULL_VIEWPORT_HEIGHT` | WARN | 100vh overflows behind mobile browser toolbars. Use min-h-dvh / min-h-svh (100dvh). |
| `Z_INDEX_ARMS_RACE` | WARN | z-index in the hundreds/thousands signals a stacking-context fight. Define a small z-index scale. |
| `IMPORTANT_OVERRIDE` | WARN | !important override. Fix specificity or layer order (@layer) instead. |
| `ATTENTION_ANIMATION` | WARN | Bouncing/pinging attention animation on UI. Draw attention with hierarchy, and respect prefers-reduced-motion. |
| `PLACEHOLDER_AS_LABEL` | WARN | Input labelled only by its placeholder (disappears on typing, low contrast). Add a <label htmlFor> or aria-label. |

`LOW_CONTRAST_TEXT` resolves `text-*`/`bg-*` pairs in the same class string against the Tailwind v4 palette and computes the real WCAG ratio for light and `dark:` variants, suggesting the nearest passing shade. Translucent backgrounds are skipped (unknown backdrop); check those with `check_contrast`.

Rules marked **ERROR** make the audit return `status: "FAIL"`; **WARN** is reported but does not fail.

## Quick start

### 1. Add the MCP server

```bash
# Claude Code
claude mcp add ui-unslop -s user -- npx -y ui-unslop-mcp

# Codex
codex mcp add ui-unslop -- npx -y ui-unslop-mcp
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`) and **Antigravity** (`~/.gemini/config/mcp_config.json`):

```json
{
  "mcpServers": {
    "ui-unslop": {
      "command": "npx",
      "args": ["-y", "ui-unslop-mcp"]
    }
  }
}
```

Restart the app afterwards.

### 2. Install the bundled skill

```bash
npx -y ui-unslop-mcp install-skills        # clients that are installed
npx -y ui-unslop-mcp install-skills --all  # every location
```

| Client | Location |
| --- | --- |
| Claude Code | `~/.claude/skills/` |
| Codex | `~/.codex/skills/` |
| Antigravity | `~/.gemini/config/skills/` (and `~/.gemini/antigravity/skills/` if present) |

Claude Desktop has no skills folder, so it receives the rules through the MCP prompt and the `load_*_rules` tool.

## MCP surface

| Kind | Name | Purpose |
| --- | --- | --- |
| Prompt | `ui-unslop` | The full skill text, for GUI clients |
| Tool | `load_ui_unslop_rules` | Returns the full ui-unslop ruleset. Call before writing code if the ui-unslop skill is not already loaded. |
| Tool | `audit_ui_slop` | Deterministically scans markup and stylesheets for UI slop and accessibility failures: low-contrast Tailwind text/background pairs, images without alt, clickable divs, unlabelled icon buttons, removed focus rings, disabled zoom, positive tabindex, tiny text, emoji icons, gradient text, glassmorphism, transition-all, 100vh, z-index wars and placeholder-only labels. Accepts files or directories; with no files it audits the git working-tree changes. Suppress a verified false positive with a `unslop-ignore RULE_ID -- reason` comment on or above the line. |
| Tool | `check_contrast` | Computes WCAG 2.x contrast ratios. Colors may be #hex, rgb(), hsl(), oklch(), CSS names or Tailwind v4 palette names (slate-400, text-slate-400/80). Returns AA/AAA pass and, for Tailwind colors, the nearest passing shade. Use it before choosing text, border and focus colors. |
| Tool | `analyze_design_tokens` | Inventories hardcoded design values across stylesheets and markup: distinct colors, font sizes, radii, shadows, z-indexes, font families and off-grid spacing. Flags sprawl beyond a coherent system so you consolidate into tokens instead of inventing more one-offs. |

File paths resolve against the server's working directory and cannot escape it. Directories honour `.gitignore` and skip `node_modules`, build output and minified files.

## CLI and CI

The same audit runs without an agent. It exits `1` on any ERROR, so it works as a pre-commit hook or CI step:

```bash
npx -y ui-unslop-mcp audit              # git working-tree changes
npx -y ui-unslop-mcp audit src app      # files or directories
npx -y ui-unslop-mcp audit src --json   # machine-readable
npx -y ui-unslop-mcp rules              # list every rule
```

## Suppressing a false positive

The checks are regex and structure based: fast, offline and predictable, but heuristic. For a verified false positive, add a comment on the line or the line above, **with a reason**:

```js
// unslop-ignore LOW_CONTRAST_TEXT -- why this is safe here
```

Suppressions without a reason are reported as `SUPPRESSION_WITHOUT_REASON` errors, and every honoured suppression is listed in the audit output so reviewers can see it.

## How it works

1. The agent loads the skill and writes code under its constraints.
2. Before finishing, the skill requires the audit and verification tools.
3. On `FAIL`, the agent fixes every finding and re-runs until `PASS`. Missing toolchains are reported as `SKIPPED`, never as passing.

## The unslop family

- [`backend-unslop-mcp`](https://github.com/fikrifirmanf/backend-unslop-mcp)
- [`frontend-unslop-mcp`](https://github.com/fikrifirmanf/frontend-unslop-mcp)
- [`mobile-unslop-mcp`](https://github.com/fikrifirmanf/mobile-unslop-mcp)
- [`copy-unslop-mcp`](https://github.com/fikrifirmanf/copy-unslop-mcp)
- [`test-unslop-mcp`](https://github.com/fikrifirmanf/test-unslop-mcp)

All share the engine in [`unslop-core`](https://github.com/fikrifirmanf/unslop-core).

## Development

```bash
git clone https://github.com/fikrifirmanf/ui-unslop-mcp
cd ui-unslop-mcp && npm install
npm test                   # every rule is checked against its good/bad examples
node src/server.mjs        # speaks MCP over stdio
```

## License

MIT © Fikri Firman Fadilah
