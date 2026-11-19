import fs from "node:fs/promises";
import ts from "typescript";

// Reuse the production document verbatim. The review page owns its controls,
// never a second approximation of the reading surface.
const source = await fs.readFile("src/main.ts", "utf8");
const file = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
const render = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderDetail");
let markup, stageMarkup;
function visit(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(file) === '$("#detail-content").innerHTML') markup = node.right.getText(file);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(file) === '$("#stage").innerHTML') stageMarkup = node.right.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
if (!markup || !stageMarkup || !render) throw new Error("Production document or stage markup was not found");
await fs.writeFile("reference/flow-review-markup.generated.js", `// Generated from src/main.ts. Do not edit.\nimport {escapeHtml} from "../src/html";\nimport {assetUrl} from "../src/asset-url";\nimport {logo,brandHeading} from "../src/brand";\nimport {archiveBriefMarkup,archiveNarrativeMarkup} from "../src/archive-narrative";\nexport function stageMarkup() { const isWallpaper=false;return ${stageMarkup}; }\nexport function detailMarkup(r, selected, total) {\nconst records={length:total}, saved=new Set();\nconst overview=()=>archiveNarrativeMarkup(r);\nreturn ${markup};\n}\n`);
