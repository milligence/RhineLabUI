import fs from "node:fs/promises";
import { validateContent } from "./archive-content.mjs";
import { defaultCubeExperiment } from "../src/cube-projection.ts";

// Deliberately public, fictional records for the five-by-ten interaction review.
// They never import personal research or replace the production catalogue.
const columns = ["样本 A", "样本 B", "样本 C", "样本 D", "样本 E"];
const titles = ["初始样本", "光学切片", "连续轨迹", "边界记录", "空间构造", "长标题与换行的视觉核查", "归位样本", "反向切换", "末端观察", "循环连接"];
const research = () => {
  const names = ["起点", "初测", "偏差", "拆分", "支路", "合流", "复测", "归档"];
  return {
    kind: "research", label: "占位研究投影", description: "用于检查节点、光束和镜头衔接的公开占位图。",
    layout: "evolution", entryNodeId: "Q1", narrativePath: ["Q1", "Q2", "Q4", "Q6", "Q7", "Q8"],
    phases: [{ id: 0, title: "建立记录", date: "01—03" }, { id: 1, title: "展开分支", date: "04—06" }, { id: 2, title: "完成回路", date: "07—08" }],
    nodes: names.map((title, i) => ({
      id: `Q${i + 1}`, title, date: `REVIEW ${String(i + 1).padStart(2, "0")}`, stage: i, lane: i === 2 ? -1 : i === 4 ? 1 : 0,
      phase: i < 3 ? 0 : i < 6 ? 1 : 2, role: [2, 4].includes(i) ? "branch" : "spine",
      position: { x: 100 + i * 210, y: i === 2 ? 130 : i === 4 ? 510 : 320 },
      status: i === 2 ? "negative" : "tested", evidence: "公开占位记录，不代表实际研究结果。",
      question: `${title}阶段需要回答哪一个问题？`, attempt: "保留一次具体操作，检查内容层次是否清楚。",
      result: "记录完成，下一节点承接这次操作。", interpretation: "该段文字用于检查字数、换行和信息密度。",
      record: ["本页使用公开占位文字。光源、节点、正文和依据沿同一条视线组织。", "打开另一节点后，应从新的题名与记录起点开始阅读。"],
      retrospective: ["这一步改变了后续选择。分支保留在图中，便于沿关系返回检查。"],
      retrospectiveDate: "REVIEW", sources: [{ label: "占位记录" }], retrospectiveSources: [{ label: "占位复盘" }],
    })),
    edges: [[1,2],[2,3],[2,4],[4,5],[4,6],[5,6],[6,7],[7,8]].map(([a,b]) => ({ from: `Q${a}`, to: `Q${b}`, kind: b === 3 || b === 5 ? "branch" : a === 5 ? "merge" : "continuation", weight: a === 5 || b === 3 ? "secondary" : "primary" })),
  };
};
const cube = () => ({
  kind: "cube", label: "占位空间投影", description: "用于检查实际三维成像及自由旋转。", retrospectiveLabel: "构造说明",
  experiments: [{ id: "complete", title: "完整格阵", description: "三阶完整格阵，可自由旋转和挖除。", state: defaultCubeExperiment(), retrospective: ["完整格阵用于观察镜头连续性、格缝和不同面的交接。"], sources: [{ label: "公开测试格阵" }] }],
});
const records = columns.flatMap((category, lane) => titles.map((name, row) => {
  const n = lane * 10 + row + 1, id = `X-${String(n).padStart(3, "0")}`;
  const paragraphs = [
    `这是 ${category} 的第 ${row + 1} 份占位档案。编号 ${id} 用于核对选档、抽取、启封和归位是否始终指向同一份记录。`,
    "镜头尚在移动时，纸面应保留空间，随后逐渐展开。关闭档案时，纸面先收回，实体再完成转正和归位。",
    "列内连续切换、跨列记忆和首尾循环使用同一套动作。快速反向应从当前状态接续，不能重新播放开头。",
  ];
  return {
    id, title: `${name} ${String(lane + 1)}·${String(row + 1).padStart(2, "0")}`, en: `REVIEW ${String(lane + 1)} / ${String(row + 1).padStart(2, "0")}`,
    department: `${category} / 占位样本`, category, date: "VISUAL REVIEW", lead: "测试记录", clearance: "OPEN", image: "", source: "",
    kind: row === 0 ? "research" : row === 4 ? "question" : "record",
    abstract: row % 3 === 0 ? paragraphs.join("\n\n") : paragraphs[0],
    findings: ["核对档案编号与实体选择一致。", "核对开启和关闭途中没有遮挡、跳帧或二次入场。"],
    chapters: Array.from({ length: row === 5 ? 5 : 2 }, (_, chapter) => ({ id: `part-${chapter + 1}`, title: chapter ? "收回与接续" : "开启与观察", date: `PASS ${chapter + 1}`, paragraphs: row === 5 ? [...paragraphs, ...paragraphs] : paragraphs.slice(0, 2) })),
    ...(row === 0 ? { projection: research() } : row === 4 ? { projection: cube() } : {}),
  };
}));
const content = validateContent({ layout: "collection", categories: columns, columns, records });
const destination = new URL("../content/fixtures/array-5x10.json", import.meta.url);
await fs.mkdir(new URL("../content/fixtures/", import.meta.url), { recursive: true });
await fs.writeFile(destination, JSON.stringify(content, null, 2) + "\n");
console.log("Generated five groups × ten public review records, including five research and five Cube projections.");
