import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { validateContent } from "./archive-content.mjs";

// Private records are copied into an isolated checkout. The public template,
// generated downloads and source tree are never overwritten with private text.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const input = args.find(arg => !arg.startsWith("--"));
if (!input) throw new Error("用法：npm run archive:private -- /绝对路径/archives.json [--dev]");
const source = path.resolve(input);
const content = validateContent(JSON.parse(await fs.readFile(source, "utf8")));
const base = path.join(root, ".private-build");
await fs.mkdir(base, { recursive: true });
const checkout = await fs.mkdtemp(path.join(base, "archive-"));
const items = ["src", "public", "scripts", "content", "wallpaper", "verification/boot-lettering/webfont-sources.json", "index.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts"];
for (const item of items) {
  try { await fs.cp(path.join(root, item), path.join(checkout, item), { recursive: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
await fs.writeFile(path.join(checkout, "content/archives.json"), JSON.stringify(content, null, 2) + "\n");
// A personal collection may have fewer records than the public template.
await fs.rm(path.join(checkout, "public/archives"), { recursive: true, force: true });
await fs.symlink(path.join(root, "node_modules"), path.join(checkout, "node_modules"), "dir");
await fs.writeFile(path.join(checkout, "PRIVATE-CONTENT.json"), JSON.stringify({ source, created: new Date().toISOString(), records: content.records.length }, null, 2));
console.log(`Private archive workspace: ${checkout}`);
const dev = args.includes("--dev");
const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", dev ? "dev" : "build", ...(dev ? ["--", "--port", "5178"] : [])], { cwd: checkout, env: process.env, stdio: "inherit" });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", code => { if (!dev && code === 0) console.log(`Private archive ready: ${path.join(checkout, "dist")}`); process.exitCode = code ?? 1; });
