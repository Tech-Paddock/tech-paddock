// Lists this repo's skills from their SKILL.md frontmatter, read at run time so the list
// never goes stale. Run from anywhere: node .claude/skills/skill-check/list.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
for (const dir of readdirSync(root, { withFileTypes: true })) {
  const file = join(root, dir.name, "SKILL.md");
  if (!dir.isDirectory() || !existsSync(file)) continue;
  const head = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const field = (k) => head.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1].trim().replace(/^"(.*)"$/, "$1") ?? "";
  rows.push({
    name: field("name") || dir.name,
    who: field("disable-model-invocation") === "true" ? "owner" : "owner or agent",
    description: field("description") || "(no description)",
  });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
console.log("| Skill | Who runs it | What it does |\n|---|---|---|");
for (const r of rows) console.log(`| \`/${r.name}\` | ${r.who} | ${r.description.replace(/\|/g, "\\|")} |`);
