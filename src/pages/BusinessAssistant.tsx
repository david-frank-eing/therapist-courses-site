import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ChatPanel } from "@/components/assistant/ChatPanel";
import { SavedPlans } from "@/components/assistant/SavedPlans";
import { MyConversations } from "@/components/assistant/MyConversations";
import { clearPending, insertPlan, loadPending, type ConversationRow } from "@/lib/assistant";
import { trackPage } from "@/lib/track";

// "/assistant" (M51): "העוזר העסקי לקליניקה". Open to guests too (they finish a conversation and get the result free);
// a signed-in user also gets "השיחות שלי" and "התוכניות שלי". The assistant itself runs on the server (assistant-chat).

type Tab = "chat" | "conversations" | "plans";

const BusinessAssistant = () => {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("chat");
  const [chatKey, setChatKey] = useState(0);              // a new conversation = a fresh ChatPanel, nothing carried over
  const [opened, setOpened] = useState<ConversationRow | null>(null);
  const [plansKey, setPlansKey] = useState(0);
  const [pending, setPending] = useState(() => loadPending());

  useEffect(() => { trackPage("assistant"); }, []);

  // a guest who saved the plan and then signed up / logged in: offer to save it (never silently)
  useEffect(() => { if (user) setPending(loadPending()); }, [user]);

  const newChat = () => { setOpened(null); setChatKey((k) => k + 1); setTab("chat"); };
  const openOld = (c: ConversationRow) => { setOpened(c); setChatKey((k) => k + 1); setTab("chat"); };

  const savePending = async () => {
    if (!user || !pending) return;
    try {
      await insertPlan(user.id, pending.plan, pending.conversationId);
      clearPending();
      setPending(null);
      setPlansKey((k) => k + 1);
      setTab("plans");
      toast({ title: "התוכנית נשמרה" });
    } catch (e) {
      toast({ title: "לא הצלחתי לשמור", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-t-4 border-brand-orange bg-card border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <img src="/logo.png" alt="הכול בידיים - מרכז מידע למטפלים במגע" className="h-12 w-auto" />
          {user
            ? <Button asChild variant="ghost" size="sm"><Link to="/home">לאתר</Link></Button>
            : <Button asChild variant="ghost" size="sm"><Link to="/auth?redirect=/assistant">כניסה / הרשמה</Link></Button>}
        </div>
      </header>

      <main className="container max-w-3xl py-8 md:py-12 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">העוזר העסקי לקליניקה</h1>
          <p className="text-muted-foreground">איפה למצוא את הלקוחות הראשונים שלי? כמה שאלות קצרות, ואתם מקבלים ערוץ אחד להתחיל ממנו, שלוש פעולות לשבוע ונוסח לפנייה הראשונה. בחינם.</p>
        </div>

        {user && pending && (
          <Card className="p-4 border-brand-orange/50 bg-brand-orange/5 text-right space-y-2" role="status">
            <p className="font-medium text-foreground">יש תוכנית שעוד לא נשמרה בחשבון. לשמור אותה?</p>
            <div className="flex gap-2">
              <Button type="button" variant="cta" size="sm" onClick={savePending}>שמור את התוכנית</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { clearPending(); setPending(null); }}>לא תודה</Button>
            </div>
          </Card>
        )}

        {isLoading ? null : user ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="chat" className="flex-1">שיחה</TabsTrigger>
              <TabsTrigger value="conversations" className="flex-1">השיחות שלי</TabsTrigger>
              <TabsTrigger value="plans" className="flex-1">התוכניות שלי</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="mt-4">
              <ChatPanel key={chatKey} userId={user.id} initial={opened} onNewChat={newChat} onSaved={() => setPlansKey((k) => k + 1)} />
            </TabsContent>
            <TabsContent value="conversations" className="mt-4"><MyConversations onOpen={openOld} /></TabsContent>
            <TabsContent value="plans" className="mt-4"><SavedPlans refreshKey={plansKey} /></TabsContent>
          </Tabs>
        ) : (
          <ChatPanel key={chatKey} userId={null} onNewChat={newChat} />
        )}
      </main>
    </div>
  );
};

export default BusinessAssistant;
