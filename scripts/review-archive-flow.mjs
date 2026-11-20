import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

// Actual ArchiveScene, original GLBs and production optical modules. Only the
// public five-by-ten fixture may enter this portable review, never private data.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destination = path.resolve(process.argv[2] ?? ".tools/archive-flow-review");
const publicBase = "https://raw.githubusercontent.com/milligence/RhineLabUI/2a68fb4137e52b0f836f7e6b726186b647c875bb/public/";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const result = await build({
  absWorkingDir: root, entryPoints: ["reference/archive-flow-review.js"],
  outdir: path.join(destination, "compiled"), bundle: true, minify: true,
  format: "esm", target: "es2022", write: false, metafile: true,
  define: { "import.meta.env.PROD": "false", "import.meta.env.BASE_URL": JSON.stringify(publicBase), __RHINE_MODELS__: "{}" },
  plugins: [{ name: "public-scene-review", setup(plugin) {
    plugin.onLoad({ filter: /[/\\]content[/\\]archives\.json$/ }, async () => ({
      contents: await fs.readFile(path.join(root, "content/fixtures/array-5x10.json"), "utf8"), loader: "json",
    }));
    plugin.onLoad({ filter: /[/\\]src[/\\]fonts\.css$/ }, async () => ({
      contents: (await fs.readFile(path.join(root, "src/fonts.css"), "utf8")).replaceAll('url("/', `url("${publicBase}`), loader: "css",
    }));
  } }],
});
const js = result.outputFiles.find(file => file.path.endsWith(".js"))?.text;
const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text;
if (!js || !css) throw new Error("Missing actual scene bundle");
const sourceFiles = {};
for (const file of Object.keys(result.metafile.inputs).sort()) {
  if (file.includes(".private-build") || file.includes("inscriber-cube-archive")) throw new Error("Private input rejected");
  if (file.startsWith("src/") || file.startsWith("reference/") || file.startsWith("content/")) {
    const actual = file === "content/archives.json" ? "content/fixtures/array-5x10.json" : file;
    sourceFiles[actual] = hash(await fs.readFile(path.join(root, actual)));
  }
}
const identity = { content: "public synthetic fixture only", reviewKind: "archive-flow", sourceDigest: hash(JSON.stringify(sourceFiles)), sourceFiles,
  scope: "Actual ArchiveScene, original public GLBs, production ProjectionViewer, camera, aperture and optical field. Requires WebGL2. Public five-by-ten fixture only." };
const template = await fs.readFile(path.join(root, "reference/archive-flow-review.html"), "utf8");
const frameHTML = template.replace("</head>", () => `<meta name="rhine-review-source" content="${identity.sourceDigest}"><style>${css}</style></head>`)
  .replace('<script type="module" src="./archive-flow-review.js"></script>', () => `<script>(async()=>{${js.replaceAll("</script", "<\\/script")}\n})()</script>`);
if ([...frameHTML.matchAll(/<script(?:\s|>)/gi)].length !== 1 || [...frameHTML.matchAll(/<\/script>/gi)].length !== 1)
  throw new Error("Review script boundary was not preserved");
const compressed = gzipSync(frameHTML, { level: 9 }).toString("base64");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhine · actual scene review</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block;overflow:hidden}</style></head><body><iframe id="actual-scene" title="真实档案投影场景"></iframe><script>const bytes=Uint8Array.from(atob("${compressed}"),c=>c.charCodeAt(0));new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(html=>document.getElementById("actual-scene").srcdoc=html);</script></body></html>`;
await fs.mkdir(destination, { recursive: true });
await fs.writeFile(path.join(destination, "archive-flow-review.bundle.html"), html);
await fs.writeFile(path.join(destination, "archive-flow-review.production.html"), frameHTML);
await fs.writeFile(path.join(destination, "manifest.json"), JSON.stringify({ ...identity, bundle: { bytes: Buffer.byteLength(html), sha256: hash(html) } }, null, 2) + "\n");
console.log(JSON.stringify({ path: path.join(destination, "archive-flow-review.bundle.html"), bytes: Buffer.byteLength(html), sha256: hash(html), sourceDigest: identity.sourceDigest }, null, 2));
