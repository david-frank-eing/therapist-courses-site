import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SESSION_TYPE_LABELS } from "@/lib/constants";
import type { Session } from "./SessionFormDialog";
import { SessionFormDialog } from "./SessionFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Clock, Banknote, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";

interface SessionsListProps {
  clientId: string;
  sessions: Session[];
  onRefresh: () => void;
}

export const SessionsList = ({ clientId, sessions, onRefresh }: SessionsListProps) => {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = sessions.length;
    const paidRevenue = sessions
      .filter((s) => s.is_paid && s.price != null)
      .reduce((sum, s) => sum + (s.price ?? 0), 0);
    const unpaidRevenue = sessions
      .filter((s) => !s.is_paid && s.price != null)
      .reduce((sum, s) => sum + (s.price ?? 0), 0);
    const minutes = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    return { total, paidRevenue, unpaidRevenue, minutes };
  }, [sessions]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (s: Session) => { setEditing(s); setFormOpen(true); };

  const togglePaid = async (s: Session) => {
    setTogglingId(s.id);
    const { error } = await supabase
      .from("sessions")
      .update({ is_paid: !s.is_paid })
      .eq("id", s.id);
    setTogglingId(null);
    if (error) {
      toast({ title: "עדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    onRefresh();
  };

  const handleDelete = async (s: Session) => {
    if (!confirm(`למחוק פגישה מ-${new Date(s.date).toLocaleDateString("he-IL")}?`)) return;
    const { error } = await supabase.from("sessions").delete().eq("id", s.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הפגישה נמחקה" });
    onRefresh();
  };

  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">פגישות</h2>
        <Button size="sm" className="gap-1" onClick={openCreate}>
          <Plus size={16} />
          פגישה חדשה
        </Button>
      </div>

      {/* Stats */}
      {sessions.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Card className="p-3 text-center">
              <p className="text-xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">פגישות</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xl font-bold text-green-600">
                {stats.paidRevenue > 0 ? `₪${stats.paidRevenue.toLocaleString()}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">שולם</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xl font-bold text-foreground">
                {stats.minutes > 0 ? `${Math.round(stats.minutes / 60)}ש'` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">שעות טיפול</p>
            </Card>
          </div>

          {/* Outstanding debt banner */}
          {stats.unpaidRevenue > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 mb-4 text-sm">
              <AlertCircle size={15} className="text-amber-600 shrink-0" />
              <span className="text-amber-800 font-medium">
                חוב פתוח: ₪{stats.unpaidRevenue.toLocaleString()}
              </span>
              <span className="text-amber-600 mr-1">
                ({sessions.filter((s) => !s.is_paid && s.price).length} פגישות לא שולמו)
              </span>
            </div>
          )}
        </>
      )}

      {sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground mb-3">עדיין אין פגישות מתועדות</p>
          <Button size="sm" onClick={openCreate} className="gap-1">
            <Plus size={16} />
            תעד פגישה ראשונה
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => (
            <Card key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-foreground">
                    {new Date(s.date).toLocaleDateString("he-IL", {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <Badge variant="secondary">{SESSION_TYPE_LABELS[s.type]}</Badge>
                  {s.price != null && (
                    <Badge
                      variant="secondary"
                      className={
                        s.is_paid
                          ? "bg-green-50 text-green-700 hover:bg-green-50"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-50"
                      }
                    >
                      {s.is_paid ? "שולם" : "טרם שולם"}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {s.duration_minutes && (
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      {s.duration_minutes} דקות
                    </span>
                  )}
                  {s.price != null && (
                    <span className="flex items-center gap-1">
                      <Banknote size={13} />
                      ₪{s.price.toLocaleString()}
                    </span>
                  )}
                </div>
                {s.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{s.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.price != null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={togglingId === s.id}
                    title={s.is_paid ? "סמן כלא שולם" : "סמן כשולם"}
                    onClick={() => togglePaid(s)}
                    className={s.is_paid ? "text-green-600 hover:text-green-700" : "text-amber-500 hover:text-amber-600"}
                  >
                    <CheckCircle2 size={17} />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => handleDelete(s)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SessionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        clientId={clientId}
        session={editing}
        onSaved={onRefresh}
      />
    </div>
  );
};
