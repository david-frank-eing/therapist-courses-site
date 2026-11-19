import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import type { PlanResult } from "@/lib/assistant";

// The plan the assistant produces (K48): the business summary, ONE channel to start from, three actions for the
// week, the text of the first message, and the next step. Plain text only (never HTML) because the words come
// from a model.

export const PlanView = ({ plan }: { plan: PlanResult }) => {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plan.outreach_message);
      toast({ title: "הנוסח הועתק" });
    } catch {
      toast({ title: "לא הצלחתי להעתיק. אפשר לסמן ולהעתיק ידנית", variant: "destructive" });
    }
  };
  return (
    <div className="space-y-5 text-right">
      <section>
        <h3 className="font-bold text-foreground mb-1">איפה אתם עומדים</h3>
        <p className="text-muted-foreground whitespace-pre-line">{plan.business_summary}</p>
      </section>
      <section className="rounded-lg border border-brand-orange/40 bg-brand-orange/5 p-4">
        <h3 className="font-bold text-foreground mb-1">הערוץ להתחיל ממנו</h3>
        <p className="text-lg font-semibold text-foreground">{plan.channel}</p>
        {plan.why && <p className="text-muted-foreground mt-1 whitespace-pre-line">{plan.why}</p>}
      </section>
      <section>
        <h3 className="font-bold text-foreground mb-2">שלוש פעולות לשבוע הקרוב</h3>
        <ol className="list-decimal pr-5 space-y-2 text-foreground">
          {plan.actions.map((a, i) => (
            <li key={i} className="whitespace-pre-line">{a}</li>
          ))}
        </ol>
      </section>
      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-foreground">נוסח לפנייה הראשונה</h3>
          <Button type="button" variant="ghost" size="sm" onClick={copy}>
            <Copy className="h-4 w-4 ml-1" /> העתק
          </Button>
        </div>
        <p className="rounded-lg bg-muted p-3 text-foreground whitespace-pre-line">{plan.outreach_message}</p>
      </section>
      <section>
        <h3 className="font-bold text-foreground mb-1">הצעד הבא (ב-24 השעות הקרובות)</h3>
        <p className="text-foreground whitespace-pre-line">{plan.next_step}</p>
      </section>
    </div>
  );
};
