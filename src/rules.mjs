import { parseColor, contrast, suggestShade } from "./color.mjs";

const MARKUP = /\.(?:[jt]sx|html?|vue|svelte|astro|mdx)$/;
const CSS = /\.(?:css|scss|less)$/;
const CLASS_ATTR = /\b(?:className|class)=(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|\{\s*["']([^"']*)["']\s*\})/g;
const LARGE = /^(?:text-(?:2xl|[3-9]xl))$/;

const classStrings = (src) => [...src.matchAll(CLASS_ATTR)].map((m) => ({ index: m.index, value: m[1] ?? m[2] ?? m[3] ?? m[4] }));

function lowContrastClasses(src) {
  const out = [];
  for (const { index, value } of classStrings(src)) {
    const tokens = value.split(/\s+/).filter(Boolean);
    for (const variant of ["", "dark:"]) {
      const pick = (kind) => tokens.filter((t) => t.startsWith(`${variant}${kind}-`) && !t.slice(variant.length + kind.length + 1).includes(":")).map((t) => parseColor(t.slice(variant.length))).filter(Boolean).pop();
      const fg = pick("text");
      const bg = pick("bg");
      // A translucent background composites over an unknown backdrop; check_contrast handles those explicitly.
      if (!fg || !bg || bg.a < 1) continue;
      const bold = tokens.some((t) => /^font-(?:bold|semibold|extrabold|black)$/.test(t));
      const large = tokens.some((t) => LARGE.test(t)) || (bold && tokens.includes("text-xl"));
      const target = large ? 3 : 4.5;
      const ratio = contrast(fg, bg);
      if (ratio < target) {
        const textFix = suggestShade(fg, bg, target);
        const bgFix = textFix ? null : suggestShade(bg, fg, target);
        const fix = textFix ? `; try ${variant}text-${textFix}` : bgFix ? `; try ${variant}bg-${bgFix}` : "";
        out.push({ index, message: `${variant || "light "}text ${fg.tailwind} on ${bg.tailwind} is ${ratio.toFixed(2)}:1 (needs ${target}:1)${fix}.` });
      }
    }
  }
  return out;
}

function focusRemoved(src, file) {
  if (CSS.test(file)) {
    if (/:focus-visible|:focus\b/.test(src)) return [];
    return [...src.matchAll(/\boutline\s*:\s*(?:none|0)\b/g)].map((m) => ({ index: m.index }));
  }
  return classStrings(src)
    .filter(({ value }) => /(?:^|\s)(?:focus:)?outline-none(?:\s|$)/.test(value) && !/focus-visible:|focus:(?:ring|outline|border|shadow)|focus-within:/.test(value))
    .map(({ index }) => ({ index }));
}

function iconOnlyControl(src) {
  const out = [];
  for (const m of src.matchAll(/<(button|a)\b([^>]*)>\s*(?:<svg\b[\s\S]*?<\/svg>|<[A-Z][\w.]*\b[^>]*\/>)\s*<\/\1>/g)) {
    if (!/\baria-label(?:ledby)?=|\btitle=/.test(m[2])) out.push({ index: m.index });
  }
  return out;
}

export const rules = [
  {
    id: "LOW_CONTRAST_TEXT",
    severity: "ERROR",
    files: MARKUP,
    check: lowContrastClasses,
    message: "Text/background pair fails WCAG AA contrast.",
    examples: [{ file: "a.tsx", bad: ['<p className="bg-white text-gray-400">', '<p className="bg-slate-900 text-slate-600">', '<p className="bg-white text-black dark:bg-zinc-900 dark:text-zinc-600">'], good: ['<p className="bg-white text-gray-600">', '<p className="bg-amber-500/10 text-amber-300">', '<h1 className="text-3xl bg-white text-gray-500">', '<p className="bg-white text-gray-900 hover:text-gray-400">'] }],
  },
  {
    id: "IMG_WITHOUT_ALT",
    severity: "ERROR",
    files: MARKUP,
    regex: /<(?:img|Image)\b(?![^>]*\balt=)[^>]*>/,
    message: "Image without alt. Describe it, or use alt=\"\" for purely decorative images.",
    examples: [{ file: "a.tsx", bad: ['<img src={hero} className="w-full" />', "<Image src={logo} width={40} height={40} />"], good: ['<img src={hero} alt="Volunteers loading a water truck" />', '<img src={divider} alt="" />'] }],
  },
  {
    id: "CLICKABLE_NON_INTERACTIVE",
    severity: "ERROR",
    files: MARKUP,
    regex: /<(?:div|span|li|td|img|section|article)\b(?![^>]*\brole=)[^>]*\bon[Cc]lick=/,
    message: "onClick on a non-interactive element: unreachable by keyboard and screen readers. Use <button> or <a href>.",
    examples: [{ file: "a.tsx", bad: ["<div className=\"card\" onClick={open}>"], good: ["<button type=\"button\" onClick={open}>", "<div role=\"button\" tabIndex={0} onClick={open} onKeyDown={onKey}>"] }],
  },
  {
    id: "ICON_ONLY_CONTROL_UNLABELLED",
    severity: "ERROR",
    files: MARKUP,
    check: iconOnlyControl,
    message: "Icon-only button/link has no accessible name. Add aria-label.",
    examples: [{ file: "a.tsx", bad: ["<button onClick={close}><XIcon className=\"size-4\" /></button>", "<a href=\"/cart\"><svg viewBox=\"0 0 24 24\"><path d=\"M0 0\" /></svg></a>"], good: ["<button aria-label=\"Close dialog\" onClick={close}><XIcon /></button>", "<button><XIcon /> Close</button>"] }],
  },
  {
    id: "FOCUS_INDICATOR_REMOVED",
    severity: "ERROR",
    files: /\.(?:css|scss|less|[jt]sx|html?|vue|svelte|astro)$/,
    check: focusRemoved,
    message: "Focus outline removed without a replacement. Keep a visible focus-visible style (ring/outline) for keyboard users.",
    examples: [
      { file: "a.tsx", bad: ['<input className="border outline-none" />'], good: ['<input className="border outline-none focus-visible:ring-2 focus-visible:ring-ring" />'] },
      { file: "a.css", bad: ["button { outline: none; }"], good: ["button { outline: none; }\nbutton:focus-visible { outline: 2px solid var(--ring); }"] },
    ],
  },
  {
    id: "ZOOM_DISABLED",
    severity: "ERROR",
    regex: /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?\b|userScalable\s*:\s*false|maximumScale\s*:\s*1\b/,
    message: "Pinch-zoom disabled. Low-vision users need zoom; remove user-scalable=no / maximum-scale=1.",
    examples: [{ file: "index.html", bad: ['<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">'], good: ['<meta name="viewport" content="width=device-width, initial-scale=1">'] }, { file: "layout.tsx", bad: ["export const viewport = { width: 'device-width', userScalable: false }"], good: ["export const viewport = { width: 'device-width', initialScale: 1 }"] }],
  },
  {
    id: "POSITIVE_TABINDEX",
    severity: "ERROR",
    files: MARKUP,
    regex: /\btab[iI]ndex=(?:["']?[1-9]|\{\s*[1-9])/,
    message: "Positive tabindex scrambles keyboard order. Use 0 or -1 and fix the DOM order instead.",
    examples: [{ file: "a.tsx", bad: ["<input tabIndex={2} />", '<div tabindex="1">'], good: ["<div tabIndex={0}>", "<div tabIndex={-1}>"] }],
  },
  {
    id: "TINY_TEXT",
    severity: "ERROR",
    regex: /font-size\s*:\s*(?:[0-9]|1[01])(?:\.\d+)?px|\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]|\btext-\[0?\.(?:[0-6]\d*)rem\]/,
    message: "Text below 12px is unreadable on most screens. Use 12px+ (14px+ for body copy).",
    examples: [{ file: "a.css", bad: [".meta { font-size: 10px; }"], good: [".meta { font-size: 12px; }"] }, { file: "a.tsx", bad: ['<span className="text-[10px]">'], good: ['<span className="text-xs">'] }],
  },
  {
    id: "EMOJI_AS_ICON",
    severity: "WARN",
    files: MARKUP,
    regex: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/u,
    message: "Emoji used as UI iconography reads as a generated template. Use the project's icon set (or nothing).",
    examples: [{ file: "a.tsx", bad: ["<h3>🚀 Fast setup</h3>", "<li>✅ Free shipping</li>"], good: ["<h3><Rocket aria-hidden /> Fast setup</h3>", "<p>© 2026 Acme</p>"] }],
  },
  {
    id: "GRADIENT_TEXT",
    severity: "WARN",
    regex: /\bbg-clip-text\b[^"'`]*\btext-transparent\b|\btext-transparent\b[^"'`]*\bbg-clip-text\b|-webkit-background-clip\s*:\s*text/,
    message: "Gradient-filled headline text is the default AI landing-page look and often fails contrast. Use a solid token color.",
    examples: [{ file: "a.tsx", bad: ['<h1 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">'], good: ['<h1 className="text-foreground">'] }],
  },
  {
    id: "GLASSMORPHISM_CARD",
    severity: "WARN",
    regex: /\bbg-white\/(?:5|10|15|20)\b[^"'`]*\bbackdrop-blur|\bbackdrop-blur(?:-\w+)?\b[^"'`]*\bbg-white\/(?:5|10|15|20)\b/,
    message: "Frosted-glass card (bg-white/10 + backdrop-blur) is a generated-UI tell and hurts legibility. Use a solid surface token.",
    examples: [{ file: "a.tsx", bad: ['<div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl">'], good: ['<div className="rounded-lg border bg-card">'] }],
  },
  {
    id: "FAINT_TEXT_ON_FILL",
    severity: "WARN",
    files: MARKUP,
    regex: /\btext-(?:white|black)\/(?:[1-7]\d?|\[0?\.[1-7]\d*\])(?![\d/])|\btext-(?:white|black)\b[^"'`]*\bopacity-(?:[1-7]\d?)\b/,
    message: "Low-opacity white/black text on a coloured fill is faint and usually fails AA. Hand-pick a same-hue tone that passes 4.5:1, or use dark text on a light tint.",
    examples: [{ file: "a.tsx", bad: ['<p className="bg-indigo-600 text-white/60">', '<p className="bg-emerald-700 text-white/[0.7]">'], good: ['<p className="bg-indigo-700 text-indigo-100">', '<p className="bg-white text-gray-600">', '<p className="text-white/90">'] }],
  },
  {
    id: "TRANSITION_ALL",
    severity: "WARN",
    regex: /\btransition-all\b|transition\s*:\s*all\b/,
    message: "transition-all animates layout properties and causes jank. Transition specific properties (colors, opacity, transform).",
    examples: [{ file: "a.tsx", bad: ['<button className="transition-all duration-300">'], good: ['<button className="transition-colors">'] }],
  },
  {
    id: "FULL_VIEWPORT_HEIGHT",
    severity: "WARN",
    regex: /\bh-screen\b|(?<![-\w])height\s*:\s*100vh/,
    message: "100vh overflows behind mobile browser toolbars. Use min-h-dvh / min-h-svh (100dvh).",
    examples: [{ file: "a.tsx", bad: ['<main className="h-screen">'], good: ['<main className="min-h-dvh">'] }],
  },
  {
    id: "Z_INDEX_ARMS_RACE",
    severity: "WARN",
    regex: /\bz-\[\d{3,}\]|z-index\s*:\s*\d{3,}/,
    message: "z-index in the hundreds/thousands signals a stacking-context fight. Define a small z-index scale.",
    examples: [{ file: "a.css", bad: [".modal { z-index: 9999; }"], good: [".modal { z-index: var(--z-modal); }"] }],
  },
  {
    id: "IMPORTANT_OVERRIDE",
    severity: "WARN",
    files: CSS,
    regex: /!important/,
    message: "!important override. Fix specificity or layer order (@layer) instead.",
    examples: [{ file: "a.css", bad: [".btn { color: red !important; }"], good: [".btn { color: var(--danger); }"] }],
  },
  {
    id: "ATTENTION_ANIMATION",
    severity: "WARN",
    regex: /\banimate-(?:bounce|ping)\b/,
    message: "Bouncing/pinging attention animation on UI. Draw attention with hierarchy, and respect prefers-reduced-motion.",
    examples: [{ file: "a.tsx", bad: ['<a className="animate-bounce">Get started</a>'], good: ['<div className="animate-pulse rounded bg-muted" />'] }],
  },
  {
    id: "PLACEHOLDER_AS_LABEL",
    severity: "WARN",
    files: MARKUP,
    regex: /<(?:input|textarea)\b(?![^>]*\b(?:aria-label|aria-labelledby|id)=)(?![^>]*type=["'](?:hidden|submit|checkbox|radio)["'])[^>]*\bplaceholder=/,
    message: "Input labelled only by its placeholder (disappears on typing, low contrast). Add a <label htmlFor> or aria-label.",
    examples: [{ file: "a.tsx", bad: ['<input type="email" placeholder="Email" />'], good: ['<input id="email" type="email" placeholder="you@company.com" />'] }],
  },
];
