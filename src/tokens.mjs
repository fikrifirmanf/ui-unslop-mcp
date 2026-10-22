import fs from "node:fs/promises";
import path from "node:path";
import { collectFiles, maskComments } from "unslop-core";
import { parseColor, toHex } from "./color.mjs";

const STYLE_FILES = /\.(?:css|scss|less|[jt]sx|html?|vue|svelte|astro)$/;

// Each tracked dimension: how to find values, and how many distinct values is still a system.
const DIMENSIONS = {
  colors: { limit: 16, patterns: [/(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, /\b(?:rgba?|hsla?|oklch)\([^)]*\)/g] },
  fontSizes: { limit: 9, patterns: [/font-size:\s*([^;}\n]+)/g, /\btext-\[(\d[^\]]*)\]/g] },
  radii: { limit: 5, patterns: [/border-radius:\s*([^;}\n]+)/g, /\brounded-\[([^\]]+)\]/g] },
  shadows: { limit: 5, patterns: [/box-shadow:\s*([^;}\n]+)/g, /\bshadow-\[([^\]]+)\]/g] },
  zIndex: { limit: 6, patterns: [/z-index:\s*(-?\d+)/g, /\bz-\[(-?\d+)\]/g] },
  fontFamilies: { limit: 3, patterns: [/font-family:\s*([^;}\n]+)/g] },
};
const SPACING = /\b(?:margin|padding|gap|row-gap|column-gap|top|right|bottom|left|inset)(?:-[a-z]+)?:\s*([^;}\n]+)|\b(?:[mp][xytrbl]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|left|right|bottom)-\[(-?[\d.]+px)\]/g;

const normalize = (dim, v) => {
  const s = v.trim().replace(/\s*!important$/, "").replace(/\s+/g, " ");
  if (dim !== "colors") return s.toLowerCase();
  const c = parseColor(s);
  return c ? toHex(c) + (c.a < 1 ? `/${Math.round(c.a * 100)}` : "") : s.toLowerCase();
};

export async function analyzeDesignTokens(args, root) {
  const inputs = Array.isArray(args.files) && args.files.length ? args.files : ["."];
  const { files } = await collectFiles(inputs, root, (p) => STYLE_FILES.test(p));
  const found = Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, new Map()]));
  const offGrid = new Map();
  const grid = Number(args.grid) || 4;

  for (const full of files) {
    const rel = path.relative(root, full);
    const src = maskComments(await fs.readFile(full, "utf8").catch(() => ""), full)
      // Custom-property definitions are the token system itself; count usages, not definitions.
      .replace(/(--[\w-]+\s*:)[^;}]+/g, "$1");
    for (const [dim, { patterns }] of Object.entries(DIMENSIONS)) {
      for (const re of patterns) {
        for (const m of src.matchAll(re)) {
          const v = m[1] ?? m[0];
          if (/var\(|inherit|initial|unset|currentcolor|transparent|none/i.test(v)) continue;
          const key = normalize(dim, v);
          const entry = found[dim].get(key) ?? { value: key, count: 0, files: new Set() };
          entry.count++;
          entry.files.add(rel);
          found[dim].set(key, entry);
        }
      }
    }
    for (const m of src.matchAll(SPACING)) {
      for (const px of (m[1] ?? m[2]).matchAll(/(-?[\d.]+)px\b/g)) {
        const n = Math.abs(parseFloat(px[1]));
        if (n > 1 && n % grid !== 0) offGrid.set(`${px[1]}px`, (offGrid.get(`${px[1]}px`) ?? 0) + 1);
      }
    }
  }

  const report = {};
  const sprawl = [];
  for (const [dim, map] of Object.entries(found)) {
    const values = [...map.values()].sort((a, b) => b.count - a.count).map((e) => ({ value: e.value, count: e.count, files: [...e.files].slice(0, 5) }));
    report[dim] = { distinct: values.length, limit: DIMENSIONS[dim].limit, top: values.slice(0, 25) };
    if (values.length > DIMENSIONS[dim].limit) sprawl.push(`${dim}: ${values.length} distinct hardcoded values (limit ${DIMENSIONS[dim].limit}). Consolidate into tokens; the rarely used ones are usually near-duplicates.`);
  }
  const off = [...offGrid.entries()].sort((a, b) => b[1] - a[1]);
  if (off.length) sprawl.push(`spacing: ${off.length} values off the ${grid}px grid (${off.slice(0, 8).map(([v]) => v).join(", ")}). Snap to the spacing scale.`);

  return {
    status: sprawl.length ? "SPRAWL" : "CONSISTENT",
    filesScanned: files.length,
    sprawl,
    ...report,
    offGridSpacing: off.slice(0, 25).map(([value, count]) => ({ value, count })),
    instruction: sprawl.length
      ? "Hardcoded values have drifted. Define/extend tokens (CSS variables or @theme) and replace near-duplicates before adding new ones."
      : "Hardcoded values stay within a coherent scale.",
  };
}
