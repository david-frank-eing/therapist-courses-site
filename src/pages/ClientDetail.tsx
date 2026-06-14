import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ClientFormDialog, type Client } from "@/components/crm/ClientFormDialog";
import { SessionsList } from "@/components/crm/SessionsList";
import type { Session } from "@/components/crm/SessionFormDialog";
import { CLIENT_STATUS_LABELS } from "@/lib/constants";
import {
  Loader2,
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  Pencil,
  Trash2,
} from "lucide-react";

const statusBadgeClass: Record<string, string> = {
  active: "bg-primary/10 text-primary hover:bg-primary/10",
  lead: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10",
  inactive: "",
};

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading, canAccessTier } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const hasAccess = !!user && canAccessTier("premium");

  const fetchAll = async () => {
    if (!id) return;
    setIsLoading(true);

    const [{ data: clientData }, { data: sessionsData }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase.from("sessions").select("*").eq("client_id", id).order("date", { ascending: false }),
    ]);

    if (clientData) setClient(clientData);
    if (sessionsData) setSessions(sessionsData);
    setIsLoading(false);
  };

  useEffect(() => {
    if (hasAccess) fetchAll();
    else setIsLoading(false);
  }, [hasAccess, id]);

  const handleDelete = async () => {
    if (!client) return;
    if (!confirm(`למחוק את "${client.full_name}" וכל הפגישות שלו?`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "המטופל נמחק" });
    navigate("/crm");
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !hasAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20 text-center">
          <p className="text-muted-foreground mb-4">אין גישה לעמוד זה.</p>
          <Button asChild variant="outline">
            <Link to="/crm">חזרה לCRM</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20 text-center">
          <p className="text-muted-foreground mb-4">המטופל לא נמצא.</p>
          <Button asChild variant="outline">
            <Link to="/crm">חזרה לרשימה</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-10 md:py-14" dir="rtl">

        {/* Back */}
        <Link
          to="/crm"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowRight size={15} />
          חזרה לרשימת המטופלים
        </Link>

        {/* Client header card */}
        <Card className="p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{client.full_name}</h1>
                <Badge variant="secondary" className={statusBadgeClass[client.status]}>
                  {CLIENT_STATUS_LABELS[client.status]}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                {client.phone && (
                  <a
                    href={`tel:${client.phone}`}
                    className="flex items-center gap-1 hover:text-primary"
                    dir="ltr"
                  >
                    <Phone size={14} />
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="flex items-center gap-1 hover:text-primary"
                    dir="ltr"
                  >
                    <Mail size={14} />
                    {client.email}
                  </a>
                )}
                {client.last_visit && (
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    ביקור אחרון: {new Date(client.last_visit).toLocaleDateString("he-IL")}
                  </span>
                )}
              </div>

              {client.notes && (
                <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">
                  {client.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditOpen(true)}>
                <Pencil size={15} />
                עריכה
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 size={15} />
                מחיקה
              </Button>
            </div>
          </div>
        </Card>

        {/* Sessions */}
        <SessionsList
          clientId={client.id}
          sessions={sessions}
          onRefresh={fetchAll}
        />
      </main>
      <Footer />

      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
        onSaved={fetchAll}
      />
    </div>
  );
};

export default ClientDetail;
