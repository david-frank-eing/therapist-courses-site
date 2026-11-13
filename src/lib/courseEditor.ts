// Pure helpers of the course editor (src/pages/CourseEditor.tsx). No network, no React.
import type { ResourceType, SubscriptionTier } from "@/integrations/supabase/types";

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // the storage limit per file on the current plan

export interface Section {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
}

export interface Lesson {
  id: string;
  course_id: string;
  section_id: string | null;
  title: string;
  description: string | null;
  type: ResourceType;
  file_path: string | null;
  file_name: string | null;
  url: string | null;
  min_tier: SubscriptionTier;
  order_index: number | null;
  is_published: boolean | null;
}

const KIND_BY_EXT: Record<string, ResourceType> = {
  mp4: "video", mov: "video", webm: "video", m4v: "video", ogg: "video",
  pdf: "pdf",
  ppt: "presentation", pptx: "presentation", key: "presentation",
  doc: "document", docx: "document", txt: "document", xls: "document", xlsx: "document", rtf: "document",
};

export const extOf = (fileName: string): string =>
  fileName.includes(".") ? (fileName.split(".").pop() || "").toLowerCase() : "";

export const kindOfFile = (fileName: string): ResourceType => KIND_BY_EXT[extOf(fileName)] || "other";

// "01_פתיחה.mp4" -> "פתיחה", "02-תרגיל בית.pdf" -> "תרגיל בית"
export const titleFromFileName = (fileName: string): string => {
  const base = fileName.replace(/\.[^.]+$/, "");
  const clean = base.replace(/^[\d\s._-]+/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return clean || base || fileName;
};

export const isVideoLink = (url: string): boolean => /(youtube\.com|youtu\.be|vimeo\.com)/i.test(url);

export const lessonsOf = (lessons: Lesson[], sectionId: string | null): Lesson[] =>
  lessons
    .filter((l) => (l.section_id ?? null) === sectionId)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

// Move one lesson to a chapter at a position. Returns the new list and the rows whose
// chapter or order changed (only those need saving).
export const moveLesson = (
  lessons: Lesson[],
  lessonId: string,
  toSection: string | null,
  toIndex: number,
): { next: Lesson[]; changed: Lesson[] } => {
  const moving = lessons.find((l) => l.id === lessonId);
  if (!moving) return { next: lessons, changed: [] };
  const fromSection = moving.section_id ?? null;
  const target = lessonsOf(lessons, toSection).filter((l) => l.id !== lessonId);
  const at = Math.max(0, Math.min(toIndex, target.length));
  target.splice(at, 0, { ...moving, section_id: toSection });
  const renumbered = new Map<string, Lesson>();
  target.forEach((l, i) => renumbered.set(l.id, { ...l, order_index: i }));
  if (fromSection !== toSection) {
    lessonsOf(lessons, fromSection)
      .filter((l) => l.id !== lessonId)
      .forEach((l, i) => renumbered.set(l.id, { ...l, order_index: i }));
  }
  const changed: Lesson[] = [];
  const next = lessons.map((l) => {
    const n = renumbered.get(l.id);
    if (!n) return l;
    if (n.order_index !== l.order_index || (n.section_id ?? null) !== (l.section_id ?? null)) changed.push(n);
    return n;
  });
  return { next, changed };
};
