// Supabase (PostgREST) returns at most 1000 rows per request. A list that can grow past that
// (patients, listings, lessons of all courses) is read in pages of 1000 until a short page comes back.
//   const rows = await fetchAll((from, to) => supabase.from("clients").select("*").order("created_at").range(from, to));

const PAGE = 1000;
const MAX_PAGES = 50; // 50,000 rows: a safety stop, far above anything the site holds

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}
