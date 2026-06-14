import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClientFormDialog, type Client } from "@/components/crm/ClientFormDialog";
import { CLIENT_STATUS_LABELS } from "@/lib/constants";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Search,
  Lock,
  Users,
} from "lucide-react";

const statusBadgeClass: Record<string, string> = {
  active: "bg-primary/10 text-primary hover:bg-primary/10",
  lead: "bg-amber-500/10 text-amber-600 hover:bg-amber-500/10",
  inactive: "",
};

const CRM = () => {
  const { user, isLoading: authLoading, canAccessTier } = useAuth();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const hasAccess = !!user && canAccessTier("premium");

  const fetchClients = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setClients(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (hasAccess) fetchClients();
    else setIsLoading(false);
  }, [hasAccess]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.full_name, c.phone, c.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [clients, search]);

  const stats = useMemo(
    () => ({
      total: clients.length,
      active: clients.filter((c) => c.status === "active").length,
      lead: clients.filter((c) => c.status === "lead").length,
    }),
    [clients]
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (client: Client) => {
    setEditing(client);
    setFormOpen(true);
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`למחוק את "${client.full_name}"?`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "המטופל נמחק" });
    fetchClients();
  };

  // --- Access guards ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">ניהול המטופלים שלך</h1>
          <p className="text-muted-foreground mb-6">התחבר כדי לגשת לאזור הפרטי שלך.</p>
          <Button asChild>
            <Link to="/auth">התחברות / הרשמה</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20">
          <div className="max-w-md mx-auto text-center">
            <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">ניהול מטופלים — פיצ'ר פרימיום</h1>
            <p className="text-muted-foreground mb-6">
              מערכת ניהול המטופלים זמינה למנויי פרימיום ו‑VIP. שדרגו כדי לנהל את המטופלים שלכם
              במקום אחד, בצורה פרטית ומאובטחת.
            </p>
            <Button asChild>
              <Link to="/pricing">שדרוג לפרימיום</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // --- CRM ---
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-10 md:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">המטופלים שלי</h1>
            <p className="text-muted-foreground">
              אזור פרטי ומאובטח — רק אתה רואה את הנתונים האלה.
            </p>
          </div>
          <Button className="gap-1 shrink-0" onClick={openCreate}>
            <Plus size={18} />
            מטופל חדש
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-sm text-muted-foreground">סה"כ</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.active}</p>
            <p className="text-sm text-muted-foreground">פעילים</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.lead}</p>
            <p className="text-sm text-muted-foreground">לידים</p>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pr-9"
            placeholder="חיפוש לפי שם, טלפון או מייל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground mb-4">
              {clients.length === 0
                ? "עדיין אין מטופלים. הוסף את הראשון!"
                : "לא נמצאו תוצאות לחיפוש."}
            </p>
            {clients.length === 0 && (
              <Button onClick={openCreate} className="gap-1">
                <Plus size={18} />
                מטופל חדש
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((client) => (
              <Card
                key={client.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{client.full_name}</span>
                    <Badge variant="secondary" className={statusBadgeClass[client.status]}>
                      {CLIENT_STATUS_LABELS[client.status]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
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
                  </div>
                  {client.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                      {client.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDelete(client)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        onSaved={fetchClients}
      />
    </div>
  );
};

export default CRM;
