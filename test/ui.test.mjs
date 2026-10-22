import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkRuleExamples } from "unslop-core";
import { rules } from "../src/rules.mjs";
import { checkContrast, parseColor, toHex } from "../src/color.mjs";
import { analyzeDesignTokens } from "../src/tokens.mjs";

test("every rule catches its bad examples and passes its good ones", () => {
  assert.deepEqual(checkRuleExamples(rules), []);
});

test("color parsing and WCAG ratios", () => {
  assert.equal(toHex(parseColor("#abc")), "#aabbcc");
  assert.equal(toHex(parseColor("rgb(255 0 0)")), "#ff0000");
  assert.equal(toHex(parseColor("hsl(0, 100%, 50%)")), "#ff0000");
  assert.equal(toHex(parseColor("oklch(100% 0 0)")), "#ffffff");
  assert.equal(toHex(parseColor("text-gray-400")), "#99a1af");
  const r = checkContrast({ pairs: [{ fg: "#000", bg: "#fff" }, { fg: "gray-400", bg: "white" }, { fg: "gray-400", bg: "white", large: true }] });
  assert.equal(r.results[0].ratio, 21);
  assert.equal(r.results[1].AA, false);
  assert.equal(r.results[1].suggestion, "gray-500");
  assert.equal(r.status, "FAIL");
});

test("design token sprawl", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-unslop-"));
  const colors = Array.from({ length: 20 }, (_, i) => `.c${i} { color: #${(0x100000 + i * 4099).toString(16)}; padding: 13px; }`).join("\n");
  await fs.writeFile(path.join(dir, "a.css"), `:root { --brand: #ff0000; }\n${colors}`);
  const r = await analyzeDesignTokens({}, dir);
  assert.equal(r.status, "SPRAWL");
  assert.equal(r.colors.distinct, 20);
  assert.equal(r.offGridSpacing[0].value, "13px");
});
