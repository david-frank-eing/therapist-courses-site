import { supabase } from "@/integrations/supabase/client";

// Which lessons a therapist already opened (table lesson_progress). Every call is tolerant: before the
// "התקדמות בקורסים" SQL runs the table does not exist, and the site simply shows no progress.

export interface ProgressRow { resource_id: string; course_id: string; viewed_at: string }

const db = supabase as any;

/** null = the table is not there yet */
export const loadProgress = async (userId: string, courseId?: string): Promise<ProgressRow[] | null> => {
  let q = db.from("lesson_progress").select("resource_id,course_id,viewed_at").eq("user_id", userId);
  if (courseId) q = q.eq("course_id", courseId);
  const { data, error } = await q.order("viewed_at", { ascending: false });
  return error ? null : ((data as ProgressRow[]) ?? []);
};

export const markViewed = async (userId: string, courseId: string, resourceId: string): Promise<boolean> => {
  const { error } = await db
    .from("lesson_progress")
    .upsert(
      { user_id: userId, course_id: courseId, resource_id: resourceId, viewed_at: new Date().toISOString() },
      { onConflict: "user_id,resource_id" }
    );
  return !error;
};

/** the lesson to continue from: the first allowed lesson after the last one opened, else the last one itself */
export const resumeFrom = <T extends { id: string }>(lessons: T[], progress: ProgressRow[]): T | null => {
  if (!progress.length) return null;
  const last = progress[0].resource_id;
  const at = lessons.findIndex((l) => l.id === last);
  if (at < 0) return null;
  const seen = new Set(progress.map((p) => p.resource_id));
  return lessons.slice(at + 1).find((l) => !seen.has(l.id)) ?? lessons[at];
};
