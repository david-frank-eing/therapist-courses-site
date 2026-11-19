import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Loader2, Trash2 } from "lucide-react";
import { deleteConversation, listConversations, type ConversationRow } from "@/lib/assistant";

// "השיחות שלי" (K50): the signed-in therapist's earlier conversations. Opening one continues it; each is independent
// of the others, and a new conversation never carries anything from an old one.

const fmt = (iso: string) => new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
const STATUS: Record<ConversationRow["status"], string> = { open: "בשיחה", done: "עם תוכנית", locked: "נסגרה" };

export const MyConversations = ({ onOpen }: { onOpen: (c: ConversationRow) => void }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<ConversationRow[] | null>(null);

  useEffect(() => {
    listConversations().then(setRows).catch((e) => {
      setRows([]);
      toast({ title: "השיחות לא נטענו", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (c: ConversationRow) => {
    if (!(await confirm({ title: "למחוק את השיחה?", text: "השיחה תימחק לגמרי. תוכנית ששמרתם נשארת.", danger: true }))) return;
    try {
      await deleteConversation(c.id);
      setRows((list) => (list ?? []).filter((x) => x.id !== c.id));
    } catch (e) {
      toast({ title: "המחיקה נכשלה", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  if (rows === null) return <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline ml-2" />טוען...</div>;
  if (rows.length === 0) return <p className="py-10 text-center text-muted-foreground" data-area="K50">עוד אין שיחות קודמות.</p>;

  return (
    <div className="space-y-3" data-area="K50">
      {rows.map((c) => {
        const first = c.messages.find((m) => m.role === "user")?.text ?? "";
        return (
          <Card key={c.id} className="p-4 flex items-center justify-between gap-3">
            <button type="button" className="text-right flex-1 min-w-0" onClick={() => onOpen(c)} disabled={c.status === "locked"}>
              <p className="font-medium text-foreground truncate">{first || "שיחה"}</p>
              <p className="text-sm text-muted-foreground">{fmt(c.updated_at)} · {STATUS[c.status]}</p>
            </button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void remove(c)} aria-label="מחיקת השיחה"><Trash2 className="h-4 w-4" /></Button>
          </Card>
        );
      })}
    </div>
  );
};
