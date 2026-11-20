import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

// A self-contained public review shell around the actual production modules.
// No private data option is accepted: publishing this output is safe by design.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const outputArg = args.indexOf("--output");
const output = outputArg < 0 ? path.join(root, ".tools/projection-cinematic-review") : path.resolve(args[outputArg + 1]);
const inlineFonts = args.includes("--inline-fonts");
const compressed = args.includes("--compress");
const publicRef = "70b614d252a31fbd80efd0d61fe79ba126f2bd85";
const fontBase = `https://raw.githubusercontent.com/milligence/RhineLabUI/${publicRef}/public/`;
const entry = "reference/projection-cinematic-review.ts";
const hash = value => createHash("sha256").update(value).digest("hex");
const uiText = (await Promise.all([entry, "reference/projection-cinematic-review.html", "src/projection-viewer.ts", "src/research-projection.ts", "src/cube-projection.ts", "src/projection-types.ts", "content/fixtures/array-5x10.json"].map(file => fs.readFile(path.join(root, file), "utf8")))).join("\n");
const codepoints = [...new Set([...uiText].map(character => character.codePointAt(0)))];
const fullFontCSS = await fs.readFile(path.join(root, "src/fonts.css"), "utf8");
let fontFaces = 0, inlineFontBytes = 0;
const fontRules = [];
for (const match of fullFontCSS.matchAll(/@font-face\{[^}]+\}/g)) {
  const rule = match[0], range = rule.match(/unicode-range:([^;}]+)/)?.[1];
  const source = rule.match(/url\("([^"]+)"\)/)?.[1];
  if (!range || !source) continue;
  const intervals = range.split(",").map(value => value.replace("U+", "").split("-").map(hex => parseInt(hex, 16)));
  if (!codepoints.some(point => intervals.some(([start, end = start]) => point >= start && point <= end))) continue;
  fontFaces++;
  if (inlineFonts) {
    const bytes = await fs.readFile(path.join(root, "public", source.replace(/^\//, "")));
    inlineFontBytes += bytes.length;
    fontRules.push(rule.replace(source, `data:font/woff2;base64,${bytes.toString("base64")}`));
  } else fontRules.push(rule.replace(source, fontBase + source.replace(/^\//, "")));
}
const result = await build({
  absWorkingDir: root, entryPoints: [entry], outdir: path.join(output, "compiled"),
  bundle: true, minify: true, format: "iife", target: "es2022", write: false, metafile: true,
  define: { "import.meta.env.PROD": "false", "import.meta.env.BASE_URL": JSON.stringify(fontBase), __RHINE_MODELS__: "{}" },
  plugins: [{ name: "public-review-fonts", setup(plugin) {
    plugin.onLoad({ filter: /[/\\]src[/\\]fonts\.css$/ }, () => ({ contents: fontRules.join("\n"), loader: "css" }));
  } }],
});
const js = result.outputFiles.find(file => file.path.endsWith(".js"))?.text;
const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text;
if (!js || !css) throw new Error("Production bundle did not produce JS and CSS");
const sourceFiles = {};
for (const file of Object.keys(result.metafile.inputs).sort()) {
  if (file.includes(".private-build") || file.includes("inscriber-cube-archive")) throw new Error(`Private file entered the public review: ${file}`);
  if (file.startsWith("src/") || file.startsWith("reference/") || file.startsWith("content/")) sourceFiles[file] = hash(await fs.readFile(path.join(root, file)));
}
sourceFiles["package-lock.json"] = hash(await fs.readFile(path.join(root, "package-lock.json")));
for (const file of ["reference/projection-cinematic-review.html", "reference/projection-cinematic-review.css", "scripts/review-projection-cinematic.mjs"])
  sourceFiles[file] = hash(await fs.readFile(path.join(root, file)));
const identity = {
  created: new Date().toISOString(), content: "public synthetic fixture only", reviewKind: "projection-cinematic", nodes: 36, edges: 39, route: 23,
  scope: "Production ProjectionViewer and CarrierFlight continuously played or replayed at fixed display steps, with real ResearchProjection and CubeProjection. The labelled synthetic calibration plane uses the same camera projection. No ArchiveScene, GLB, real physical carrier, GPU occlusion or Cube WebGL pixel acceptance.",
  sourceDigest: hash(JSON.stringify(sourceFiles)), sourceFiles,
  fonts: { source: fontBase, faces: fontFaces, inline: inlineFonts, bytes: inlineFontBytes },
};
const safeScript = value => value.replaceAll("</script", "<\\/script");
const frameHTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="rhine-review-content" content="public-synthetic"><meta name="rhine-review-source" content="${identity.sourceDigest}"><style>${css}</style></head><body><div id="viewport"></div><script>${safeScript(js)}</script></body></html>`;
const template = await fs.readFile(path.join(root, "reference/projection-cinematic-review.html"), "utf8");
const reviewCSS = await fs.readFile(path.join(root, "reference/projection-cinematic-review.css"), "utf8");
// External HTML previewers rewrite literal <script tags before execution.
// Unicode-escape the nested document in the outer JS string so that only the
// outer script is rewritten; srcdoc receives the original document at runtime.
const payload = compressed
  ? { encoding: "gzip-base64", data: gzipSync(frameHTML, { level: 9 }).toString("base64") }
  : { encoding: "plain", data: frameHTML };
const nestedDocument = JSON.stringify(payload).replaceAll("<", "\\u003c");
const html = template.replace("/*__REVIEW_CSS__*/", reviewCSS).replace("/*__REVIEW_IDENTITY__*/", JSON.stringify(identity)).replace("/*__FRAME_PAYLOAD__*/", nestedDocument);
if (html.includes("/*__")) throw new Error("Review placeholder remained unfilled");
await fs.mkdir(output, { recursive: true });
const htmlPath = path.join(output, "projection-cinematic-review.bundle.html");
await fs.writeFile(htmlPath, html);
await fs.writeFile(path.join(output, "projection-cinematic-review.production.html"), frameHTML);
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify({ ...identity, bundle: { file: path.basename(htmlPath), bytes: Buffer.byteLength(html), sha256: hash(html), compressed, frameBytes: Buffer.byteLength(frameHTML), frameSha256: hash(frameHTML) } }, null, 2) + "\n");
console.log(JSON.stringify({ file: htmlPath, bytes: Buffer.byteLength(html), sha256: hash(html), sourceDigest: identity.sourceDigest, compressed, fontFaces, inlineFontBytes }, null, 2));
