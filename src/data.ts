import content from "../content/archives.json" with { type: "json" };
import type { ArchiveChapter, ArchiveProjection, ArchiveSource } from "./projection-types";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  image: string;
  kind?: "research" | "question" | "record";
  chapters?: ArchiveChapter[];
  sources?: ArchiveSource[];
  projection?: ArchiveProjection;
}

// JSON strings are widened by TypeScript; predev/prebuild validate the full
// content schema before this module is bundled, including projection variants.
export const records = content.records as ArchiveRecord[];
export const categories = ["全部档案", ...content.categories];
export const archiveColumns = content.columns;
export const archiveLanePeriod = archiveColumns.length;
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
export const archiveRowPeriod = archiveColumns.map((_, lane) => columnFiles(lane).length).reduce((a, b) => a * b / gcd(a, b), 1);

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  // The reference animation keeps its original five-column physical pool.
  // Collections with fewer catalog columns still need a valid source record.
  const lane = ((Math.floor(slot / 32) % archiveLanePeriod) + archiveLanePeriod) % archiveLanePeriod;
  const files = columnFiles(lane);
  const row = ((slot % 32) + 32) % 32;
  return files[Math.max(0, Math.min(files.length - 1, row - 12))];
}
