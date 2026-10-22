import { TAILWIND } from "./palette.mjs";

const NAMED = { white: "#fff", black: "#000", transparent: "#0000", red: "#f00", green: "#008000", blue: "#00f", gray: "#808080", grey: "#808080", silver: "#c0c0c0", yellow: "#ff0", orange: "#ffa500", purple: "#800080", navy: "#000080" };
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const num = (s, scale = 1) => (s.endsWith("%") ? (parseFloat(s) / 100) * scale : parseFloat(s));

function oklchToSrgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp01(toGamma(clamp01(c))));
}

function hslToSrgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
}

/** Strips Tailwind utility prefixes: "dark:text-slate-400/80" -> { name: "slate-400", alpha: 0.8 }. */
function tailwindName(input) {
  const m = input.match(/^(?:[\w-]+:)*(?:text|bg|border|ring|fill|stroke|from|to|via)?-?([a-z]+(?:-\d{2,3})?)(?:\/(\d{1,3}))?$/);
  if (!m || !TAILWIND[m[1]]) return null;
  return { value: TAILWIND[m[1]], name: m[1], alpha: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Parses hex, rgb(), hsl(), oklch(), CSS names and Tailwind palette names. Returns {r,g,b,a} in 0..1 or null. */
export function parseColor(input) {
  const raw = String(input).trim().toLowerCase();
  const tw = tailwindName(raw);
  if (tw) {
    const c = parseColor(tw.value);
    return c && { ...c, a: c.a * tw.alpha, tailwind: tw.name };
  }
  const s = NAMED[raw] ?? raw;
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join("") : m[1];
    const [r, g, b, a = 255] = h.match(/../g).map((x) => parseInt(x, 16));
    return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
  }
  m = s.match(/^(rgba?|hsla?|oklch)\(\s*([^)]+)\)$/);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] !== undefined ? num(parts[3]) : 1;
  let rgb;
  if (m[1].startsWith("rgb")) rgb = parts.slice(0, 3).map((p) => clamp01(num(p, 255) / 255));
  else if (m[1].startsWith("hsl")) rgb = hslToSrgb(parseFloat(parts[0]), num(parts[1].endsWith("%") ? parts[1] : `${parts[1]}%`), num(parts[2].endsWith("%") ? parts[2] : `${parts[2]}%`));
  else rgb = oklchToSrgb(num(parts[0]), num(parts[1], 0.4), parseFloat(parts[2]) || 0);
  if (rgb.some(Number.isNaN)) return null;
  return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
}

const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const luminance = (c) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
export const toHex = (c) => `#${[c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;

/** WCAG 2.x contrast ratio. Translucent colours are composited (bg over white, fg over bg). */
export function contrast(fg, bg) {
  const solidBg = bg.a < 1 ? over(bg, { r: 1, g: 1, b: 1, a: 1 }) : bg;
  const solidFg = fg.a < 1 ? over(fg, solidBg) : fg;
  const [hi, lo] = [luminance(solidFg), luminance(solidBg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Nearest shade of the same Tailwind hue that reaches `target` against `bg`. */
export function suggestShade(fg, bg, target) {
  if (!fg.tailwind || !/-\d+$/.test(fg.tailwind)) return null;
  const [hue, shade] = [fg.tailwind.replace(/-\d+$/, ""), Number(fg.tailwind.match(/\d+$/)[0])];
  const ordered = SHADES.filter((s) => s !== shade).sort((a, b) => Math.abs(a - shade) - Math.abs(b - shade));
  for (const s of ordered) {
    const c = parseColor(`${hue}-${s}`);
    if (c && contrast({ ...c, a: fg.a }, bg) >= target) return `${hue}-${s}`;
  }
  return null;
}

export function checkContrast(args) {
  const pairs = Array.isArray(args.pairs) ? args.pairs : args.fg && args.bg ? [{ fg: args.fg, bg: args.bg, large: args.large }] : [];
  if (!pairs.length) return { status: "FAIL", message: "Pass `pairs: [{ fg, bg, large? }]` or `fg` + `bg`. Colors: #hex, rgb(), hsl(), oklch(), CSS names or Tailwind names (slate-400, text-slate-400/80).", _failed: true };
  const results = pairs.map(({ fg, bg, large = false, ui = false }) => {
    const f = parseColor(fg);
    const b = parseColor(bg);
    if (!f || !b) return { fg, bg, error: `Unparseable color: ${!f ? fg : bg}` };
    const ratio = contrast(f, b);
    const target = ui || large ? 3 : 4.5;
    const pass = ratio >= target;
    return {
      fg,
      bg,
      fgHex: toHex(f),
      bgHex: toHex(b),
      ratio: Math.round(ratio * 100) / 100,
      required: target,
      AA: pass,
      AAA: ratio >= (ui || large ? 4.5 : 7),
      ...(pass ? {} : { suggestion: suggestShade(f, b, target) ?? "Darken/lighten the foreground until the ratio meets the requirement." }),
    };
  });
  const failed = results.some((r) => r.error || r.AA === false);
  return {
    status: failed ? "FAIL" : "PASS",
    results,
    note: "AA requires 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold) and UI components/focus rings.",
    _failed: failed,
  };
}
