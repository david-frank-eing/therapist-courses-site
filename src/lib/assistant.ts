import { supabase } from "@/integrations/supabase/client";

// The business assistant (page /assistant). The browser never talks to the AI: it posts to the Netlify function
// assistant-chat, which keeps the key, the history and the limits. Saved plans live in the table business_plans
// (own rows only, enforced by RLS), conversations in assistant_conversations (read and delete own rows only).

export type ReplyKind = "question" | "ready" | "reply" | "off_topic" | "plan";

export interface PlanResult {
  business_summary: string;
  channel: string;
  why: string;
  actions: string[]; // exactly three
  outreach_message: string;
  next_step: string;
}

export interface ChatReply {
  conversation_id: string;
  kind: ReplyKind;
  text?: string;
  options?: string[];
  locked?: boolean;
  turns?: number;
  max_turns?: number;
  result?: PlanResult;
  can_continue?: boolean;
}

export class AssistantError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.code = code;
  }
}

export interface StoredMessage {
  role: "user" | "assistant";
  text: string;
  kind?: ReplyKind;
  topic?: boolean;
  at?: string;
}

export interface SavedPlan extends PlanResult {
  id: string;
  created_at: string;
  updated_at: string;
  conversation_id: string | null;
}

export interface ConversationRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "done" | "locked";
  turns: number;
  messages: StoredMessage[];
  result: PlanResult | null;
}

// ---- guest identity: a random token in this browser, so a guest can continue his own conversation ----
const GUEST_KEY = "assistant-guest-token";

export const guestToken = (): string => {
  try {
    const old = localStorage.getItem(GUEST_KEY);
    if (old && /^[A-Za-z0-9_-]{20,64}$/.test(old)) return old;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(GUEST_KEY, t);
    return t;
  } catch {
    // no storage: a one-off token still works for this page view
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
};

// ---- calling the function ----
const call = async (payload: Record<string, unknown>): Promise<ChatReply> => {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  const res = await fetch("/.netlify/functions/assistant-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify({ ...payload, guest_token: jwt ? undefined : guestToken() }),
  }).catch(() => null);
  if (!res) throw new AssistantError("אין חיבור לרשת. נסו שוב", "network");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AssistantError(json.error || "משהו השתבש, נסו שוב בעוד רגע", json.code || "error");
  return json as ChatReply;
};

export const sendMessage = (text: string, conversationId: string | null) =>
  call({ action: "message", text, conversation_id: conversationId ?? undefined });

export const requestPlan = (conversationId: string) => call({ action: "plan", conversation_id: conversationId });

// ---- a plan a guest got but did not save yet (kept in this browser for 7 days) ----
const PENDING_KEY = "assistant-pending-plan";
const WEEK = 7 * 24 * 3600 * 1000;

export const savePending = (plan: PlanResult, conversationId: string | null) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ plan, conversationId, at: Date.now() })); } catch { /* no storage */ }
};

export const loadPending = (): { plan: PlanResult; conversationId: string | null } | null => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.at !== "number" || Date.now() - p.at > WEEK || !isPlan(p.plan)) { localStorage.removeItem(PENDING_KEY); return null; }
    return { plan: p.plan, conversationId: typeof p.conversationId === "string" ? p.conversationId : null };
  } catch { return null; }
};

export const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* no storage */ } };

export const isPlan = (p: unknown): p is PlanResult => {
  const o = p as PlanResult | null;
  return !!o && typeof o.business_summary === "string" && typeof o.channel === "string" && Array.isArray(o.actions) && o.actions.length === 3
    && typeof o.outreach_message === "string" && typeof o.next_step === "string" && typeof o.why === "string";
};

// ---- saved plans (RLS: only the owner) ----
const db = () => supabase as any; // the new tables are not in the generated types yet

export const listPlans = async (): Promise<SavedPlan[]> => {
  const { data, error } = await db().from("business_plans").select("*").order("updated_at", { ascending: false });
  if (error) throw new AssistantError(error.message);
  return data ?? [];
};

export const insertPlan = async (userId: string, plan: PlanResult, conversationId: string | null): Promise<SavedPlan> => {
  const { data, error } = await db().from("business_plans").insert({ user_id: userId, ...plan, conversation_id: conversationId }).select("*").single();
  if (error) throw new AssistantError(/limit/i.test(error.message) ? "אפשר לשמור עד 20 תוכניות. מחקו אחת ונסו שוב" : error.message);
  return data;
};

export const updatePlan = async (id: string, plan: PlanResult): Promise<SavedPlan> => {
  const { data, error } = await db().from("business_plans").update(plan).eq("id", id).select("*").single();
  if (error) throw new AssistantError(error.message);
  return data;
};

export const deletePlan = async (id: string) => {
  const { error } = await db().from("business_plans").delete().eq("id", id);
  if (error) throw new AssistantError(error.message);
};

// ---- own conversations (read and delete only; the function is the only writer) ----
export const listConversations = async (): Promise<ConversationRow[]> => {
  const { data, error } = await db().from("assistant_conversations").select("id,created_at,updated_at,status,turns,messages,result").order("updated_at", { ascending: false }).limit(100);
  if (error) throw new AssistantError(error.message);
  return (data ?? []).filter((c: ConversationRow) => Array.isArray(c.messages) && c.messages.length > 0);
};

export const deleteConversation = async (id: string) => {
  const { error } = await db().from("assistant_conversations").delete().eq("id", id);
  if (error) throw new AssistantError(error.message);
};
