export interface ArchiveSource {
  label: string;
  url?: string;
  path?: string;
}

export interface ArchiveChapter {
  id: string;
  title: string;
  date?: string;
  paragraphs: string[];
  sources?: ArchiveSource[];
}

export interface ResearchNode {
  id: string;
  title: string;
  date: string;
  stage: number;
  lane: number;
  status: "question" | "tested" | "supported" | "negative" | "paused" | "open";
  evidence: string;
  question: string;
  attempt: string;
  result: string;
  interpretation: string;
  retrospective: string[];
  sources: ArchiveSource[];
}

export interface ResearchProjectionData {
  kind: "research";
  label: string;
  description: string;
  nodes: ResearchNode[];
  edges: { from: string; to: string; label?: string }[];
  retrospectiveDate?: string;
}

export interface CubeProjectionData {
  kind: "cube";
  label: string;
  description: string;
  retrospectiveLabel?: string;
  experiments: {
    id: string;
    title: string;
    description: string;
    state: unknown;
    retrospective: string[];
    sources: ArchiveSource[];
  }[];
}

export type ArchiveProjection = ResearchProjectionData | CubeProjectionData;

export const researchStatus: Record<ResearchNode["status"], string> = {
  question: "问题", tested: "已检验", supported: "得到支持",
  negative: "负结果", paused: "暂缓", open: "待验证",
};

export function safeSourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
