import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const file = readdirSync("dist/assets").find((f) => f.endsWith(".css"));
assert(file, "Compiled CSS missing");
const css = readFileSync(`dist/assets/${file}`, "utf8");
for (const token of [
  ".inline-flex",
  ".fixed",
  ".rounded-lg",
  ".items-center",
  ".text-sm",
])
  assert(css.includes(token), `Tailwind utility missing: ${token}`);
assert(!/@(source|theme|utility)\b/.test(css), "Uncompiled Tailwind directive");
console.log(
  "Tailwind verification: 5 generated utilities present; no raw directives.",
);
