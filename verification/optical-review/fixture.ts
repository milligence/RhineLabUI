import "@product/style.css";
import "@product/archive-template.css";
import "@product/projection.css";
import { paintTheme } from "@product/theme-ui";
import { ProjectionViewer } from "@product/projection-viewer";
import { defaultCubeExperiment } from "@product/cube-projection";
import type { ArchiveRecord } from "@product/data";
import type { ResearchNode } from "@product/projection-types";

// This file is QA-only. Its content must never enter production archive data.
const sampleSource = [
  {
    label: "交互验证样本 · 非真实研究资料",
    path: "verification/optical-review/fixture.ts",
  },
];
const titles = ["问题边界", "建立对照", "失败分支", "重复核验", "下一步问题"];
const nodes: ResearchNode[] = titles.map((title, i) => ({
  id: `qa-node-${i}`,
  title: `${title} · 样本 ${i + 1}`,
  date: `TEST 0${i + 1}`,
  stage: [0, 1, 1, 2, 3][i],
  lane: [0, 0, 1, 0, 0][i],
  status: (["question", "tested", "negative", "supported", "open"] as const)[i],
  evidence: `SAMPLE ${i + 1} / 合成检验资料`,
  question: `样本 ${i + 1}：选择研究节点时，问题、观察与复盘是否保持一致？`,
  attempt:
    "此文字仅用于检查排版、滚动与节点联动。它不描述任何真实实验，也不代表原档案正文。",
  result: `合成观察 ${i + 1}。用于核对时间游标与当前节点记录的对应关系。`,
  interpretation:
    "该页面承担交互验证，不提供研究结论。实际档案须以已取得的原始材料为依据。",
  retrospective: [
    `复盘样本 ${i + 1}：这一段必须随所选节点同步变化。`,
    "此处保留足够正文长度，以验证窄屏阅读和纵向滚动。",
  ],
  sources: sampleSource,
}));
const base = {
  title: "交互验证样本",
  department: "QA",
  category: "验证",
  date: "TEST",
  lead: "SYNTHETIC",
  clearance: "TEST",
  abstract: "合成交互验证样本。",
  findings: [],
  source: "QA fixture",
  image: "",
};
const research: ArchiveRecord = {
  ...base,
  id: "QA-R01",
  en: "INTERACTION TEST SPECIMEN",
  projection: {
    kind: "research",
    label: "交互验证样本",
    description: "合成研究图，仅核查交互与版式；不对应真实研究原文。",
    nodes,
    edges: [
      { from: "qa-node-0", to: "qa-node-1" },
      { from: "qa-node-0", to: "qa-node-2" },
      { from: "qa-node-1", to: "qa-node-3" },
      { from: "qa-node-3", to: "qa-node-4" },
    ],
    retrospectiveDate: "TEST / 非真实记录",
  },
};
const singleGap = defaultCubeExperiment(3);
singleGap.present[13] = 0;
const cube: ArchiveRecord = {
  ...base,
  id: "QA-C01",
  en: "GENERIC CUBE SPECIMEN",
  projection: {
    kind: "cube",
    label: "通用格阵 · 交互验证样本",
    description: "通用 3³ 基本回归。",
    experiments: [
      {
        id: "qa-cube-full",
        title: "通用 3³ 完整格阵",
        description: "交互验证样本。27 个实体单元；不对应任何研究结论。",
        state: defaultCubeExperiment(3),
        retrospective: ["完整格阵样本：用于检验自由观察与数学观察点相互独立。"],
        sources: sampleSource,
      },
      {
        id: "qa-cube-gap",
        title: "通用 3³ 中心空格",
        description:
          "交互验证样本。中心单元移除，仅供切换、编辑和状态恢复核查。",
        state: singleGap,
        retrospective: ["中心空格样本：构造切换后，本段应与新构造同步。"],
        sources: sampleSource,
      },
    ],
  },
};

const surface = document.querySelector<HTMLElement>("#qa-surface")!;
const viewer = new ProjectionViewer(surface);
let dark = new URLSearchParams(location.search).get("theme") === "dark";
let reduced = new URLSearchParams(location.search).get("reduced") !== "0";
let closeCount = 0;
const open = (record: ArchiveRecord) =>
  viewer.open(record, {
    reducedMotion: reduced,
    onClose: () => {
      closeCount++;
    },
  });
document
  .querySelector("#open-research")!
  .addEventListener("click", () => open(research));
document
  .querySelector("#open-cube")!
  .addEventListener("click", () => open(cube));
function setTheme(value: boolean) {
  dark = value;
  paintTheme(dark ? 1 : 0);
  viewer.refreshTheme();
}
document
  .querySelector("#toggle-theme")!
  .addEventListener("click", () => setTheme(!dark));
setTheme(dark);
Object.assign(window, {
  opticalQA: {
    ready: true,
    stats: () => ({
      ...viewer.getStats(),
      closeCount,
      dark,
      syntheticFixture: true,
    }),
    setTheme,
    setReduced: (value: boolean) => {
      reduced = value;
      viewer.setReducedMotion(value);
    },
    close: () => viewer.close(true),
    closeAnimated: () => viewer.close(),
    dispose: () => viewer.dispose(),
    openResearch: () => open(research),
    openCube: () => open(cube),
  },
});
const style = document.createElement("style");
style.textContent =
  "#qa-surface{position:relative;width:100vw;height:100dvh;overflow:hidden;background:var(--theme-paper);color:var(--theme-ink)}#qa-launcher{padding:36px;max-width:700px}#qa-launcher small{letter-spacing:1px}#qa-launcher p{font-size:16px;line-height:1.8}#qa-launcher button{display:block;padding:12px 16px;min-height:44px;margin:12px 0;border:1px solid var(--theme-line)}";
document.head.appendChild(style);
