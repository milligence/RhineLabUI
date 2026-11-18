import fs from "node:fs/promises";

const requiredFields = [
  "id",
  "title",
  "en",
  "department",
  "category",
  "date",
  "lead",
  "clearance",
  "abstract",
];
const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是 JSON 对象。");
  }
  const collection = content.layout === "collection";
  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (!Array.isArray(names) || (collection ? names.length < 1 || names.length > 12 : names.length !== 5) || !names.every(isText)) {
      errors.push(`${key}：${collection ? "必须包含一至十二个非空分类名称" : "必须包含五个非空分类名称"}`);
    } else if (new Set(names).size !== names.length || names.includes("全部档案")) {
      errors.push(`${key}：分类名称不能重复，也不能使用“全部档案”`);
    }
  }
  const categories = Array.isArray(content.categories)
    ? content.categories
    : [];
  const columns = Array.isArray(content.columns) ? content.columns : [];
  if (
    categories.some((name) => !columns.includes(name)) ||
    columns.some((name) => !categories.includes(name))
  ) {
    errors.push(`categories 与 columns 必须包含相同的${collection ? "分类" : "五个分类"}（顺序可以不同）`);
  }
  const records = Array.isArray(content.records) ? content.records : [];
  if (collection ? records.length < 1 || records.length > 240 : records.length !== 40) errors.push(collection ? "records：个人编目要求一至240份档案" : "records：当前阵列要求四十份档案");
  const ids = new Set();
  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label}：必须是档案对象`);
      return;
    }
    for (const key of requiredFields) {
      if (!isText(record[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    const expectedId = `X-${String(index + 1).padStart(3, "0")}`;
    if (record.kind !== undefined && !["research", "question", "record"].includes(record.kind)) errors.push(`${label}.kind：未知档案类型`);
    if (record.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (
      !Array.isArray(record.findings) ||
      record.findings.length === 0 ||
      !record.findings.every(isText)
    ) {
      errors.push(`${label}.findings：必须包含至少一条非空研究记录`);
    }
    if (record.source !== "") {
      try {
        const url = new URL(record.source);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      } catch {
        errors.push(`${label}.source：必须为空或为有效的 HTTP 或 HTTPS 链接`);
      }
    }
    if (typeof record.image !== "string" || (record.image !== "" && !/^archive-images\/(?!.*\.\.)[\w\-/]+\.(?:png|jpe?g|webp|svg)$/i.test(record.image))) {
      errors.push(`${label}.image：必须为空或为 archive-images 下的图片路径`);
    }
    if (record.chapters !== undefined) {
      if (!Array.isArray(record.chapters) || !record.chapters.every(c => c && /^[\w-]+$/.test(c.id) && isText(c.title) && Array.isArray(c.paragraphs) && c.paragraphs.length && c.paragraphs.every(isText))) errors.push(`${label}.chapters：章节需包含标识、标题与正文段落`);
      else if (new Set(record.chapters.map(c => c.id)).size !== record.chapters.length) errors.push(`${label}.chapters：章节标识不能重复`);
    }
    if (record.projection !== undefined) validateProjection(record.projection, `${label}.projection`, errors);
    if (record.sources !== undefined) validateSources(record.sources, `${label}.sources`, errors);
  });
  for (const name of columns) {
    const count = records.filter((record) => record?.category === name).length;
    if (collection ? count < 1 || count > 20 : count !== 8) {
      errors.push(`分类“${name}”：${collection ? "个人编目要求一至20份档案" : "当前阵列要求八份档案"}`);
    }
  }
  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent() {
  return validateContent(
    JSON.parse(
      await fs.readFile(
        new URL("../content/archives.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

export function archiveText(r) {
  const story = r.chapters?.map((chapter, index) => `\n${String(index + 1).padStart(2, "0")} ${chapter.title}${chapter.date ? ` / ${chapter.date}` : ""}\n\n${chapter.paragraphs.join("\n\n")}\n`).join("") ?? "";
  return `\uFEFFTHE ARCHIVE · RECORD\nFILE ${r.id} / ${r.title}\n${r.en}\n\n分类：${r.category}\n编目范围：${r.date}\n记录人：${r.lead}\n状态：${r.clearance}\n\n${r.abstract}\n${story}\n文字记录\n${r.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n${r.source ? `\n资料来源：${r.source}\n` : ""}`;
}

function validateSources(sources, label, errors) {
  if (!Array.isArray(sources)) { errors.push(`${label}：来源必须是数组`); return; }
  for (const source of sources) {
    if (!source || !isText(source.label)) { errors.push(`${label}：来源需有名称`); continue; }
    if (source.url) { try { if (!["http:", "https:"].includes(new URL(source.url).protocol)) throw new Error(); } catch { errors.push(`${label}：来源链接需为HTTP或HTTPS`); } }
  }
}

function validateProjection(projection, label, errors) {
  if (!projection || !["research", "cube"].includes(projection.kind) || !isText(projection.label) || !isText(projection.description)) { errors.push(`${label}：投影类型、名称与说明无效`); return; }
  if (projection.kind === "cube") {
    if (!Array.isArray(projection.experiments) || projection.experiments.length < 1) { errors.push(`${label}：需要至少一项实验构造`); return; }
    const ids = new Set();
    for (const e of projection.experiments) {
      if (!e || !isText(e.id) || ids.has(e.id) || !isText(e.title) || !isText(e.description) || !e.state || !Array.isArray(e.retrospective) || !e.retrospective.every(isText)) errors.push(`${label}：实验构造记录不完整或编号重复`);
      if (e) { ids.add(e.id); validateSources(e.sources, label, errors); }
    }
    return;
  }
  if (!Array.isArray(projection.nodes) || projection.nodes.length < 1 || !Array.isArray(projection.edges)) { errors.push(`${label}：研究图需要节点与连线`); return; }
  const ids = new Map();
  for (const n of projection.nodes) {
    if (!n || !isText(n.id) || ids.has(n.id) || !isText(n.title) || !isText(n.date) || !Number.isInteger(n.stage) || n.stage < 0 || !Number.isInteger(n.lane) || Math.abs(n.lane) > 20 || !["question", "tested", "supported", "negative", "paused", "open"].includes(n.status) || !isText(n.evidence)) { errors.push(`${label}：研究节点字段无效或编号重复`); continue; }
    ids.set(n.id, n);
    for (const key of ["question", "attempt", "result", "interpretation"]) if (typeof n[key] !== "string") errors.push(`${label}.${n.id}.${key}：必须为文字`);
    if (!Array.isArray(n.retrospective) || !n.retrospective.every(isText)) errors.push(`${label}.${n.id}：复盘必须为文字段落数组`);
    validateSources(n.sources, `${label}.${n.id}`, errors);
  }
  for (const edge of projection.edges) {
    const from = ids.get(edge?.from), to = ids.get(edge?.to);
    if (!from || !to || from.stage >= to.stage) errors.push(`${label}：连线必须指向存在的后续阶段节点`);
  }
}
