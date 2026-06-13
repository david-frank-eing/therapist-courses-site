import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListingFormDialog } from "@/components/board/ListingFormDialog";
import { LISTING_CATEGORY_LABELS } from "@/lib/constants";
import {
  Loader2,
  ArrowRight,
  MapPin,
  Tag,
  Phone,
  Mail,
  User as UserIcon,
  Share2,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";

type Listing = Database["public"]["Tables"]["listings"]["Row"];

const BUCKET = "listing-images";
const PUBLIC_COLS =
  "id,user_id,title,description,category,price,city,image_path,is_active,created_at";

const imageUrl = (path: string | null): string | null =>
  path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;

const ListingPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showContact, setShowContact] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const fetchListing = async () => {
    if (!id) return;
    setIsLoading(true);
    // Logged-in users can read contact columns; anonymous cannot (select limited)
    const { data } = await supabase
      .from("listings")
      .select(user ? "*" : PUBLIC_COLS)
      .eq("id", id)
      .maybeSingle();
    setListing((data as Listing) ?? null);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchListing();
    setShowContact(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/board/${id}` : "";

  const shareWhatsApp = () => {
    const text = `${listing?.title ?? "מודעה"} - ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "הקישור הועתק" });
    } catch {
      toast({ title: "לא ניתן להעתיק", description: shareUrl, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!listing) return;
    if (!confirm(`למחוק את המודעה "${listing.title}"?`)) return;
    const { error } = await supabase.from("listings").delete().eq("id", listing.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    if (listing.image_path) {
      await supabase.storage.from(BUCKET).remove([listing.image_path]);
    }
    toast({ title: "המודעה נמחקה" });
    navigate("/board");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">המודעה לא נמצאה</h1>
          <p className="text-muted-foreground mb-6">ייתכן שהיא הוסרה או אינה פעילה.</p>
          <Button asChild>
            <Link to="/board">חזרה ללוח המודעות</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const img = imageUrl(listing.image_path);
  const canManage = !!user && (user.id === listing.user_id || isAdmin);
  const hasContact = listing.contact_name || listing.contact_phone || listing.contact_email;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 md:py-12 max-w-3xl">
        <Link
          to="/board"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowRight size={16} />
          לכל המודעות
        </Link>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="secondary">{LISTING_CATEGORY_LABELS[listing.category]}</Badge>
          {!listing.is_active && <Badge variant="outline">לא פעילה</Badge>}
        </div>

        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">{listing.title}</h1>
          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
                <Pencil size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={handleDelete}>
                <Trash2 size={16} />
              </Button>
            </div>
          )}
        </div>

        {img && (
          <div className="rounded-xl overflow-hidden bg-muted mb-6">
            <img src={img} alt={listing.title} className="w-full max-h-[420px] object-contain" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-6">
          {listing.price && (
            <span className="flex items-center gap-1">
              <Tag size={16} />
              {listing.price}
            </span>
          )}
          {listing.city && (
            <span className="flex items-center gap-1">
              <MapPin size={16} />
              {listing.city}
            </span>
          )}
        </div>

        <p className="text-foreground whitespace-pre-wrap mb-8">{listing.description}</p>

        {/* Share */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Share2 size={16} /> שתף:
          </span>
          <Button variant="outline" size="sm" className="gap-1" onClick={shareWhatsApp}>
            וואטסאפ
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={copyLink}>
            <Copy size={14} />
            העתק קישור
          </Button>
        </div>

        {/* Contact */}
        <Card className="p-5">
          <h2 className="font-semibold text-foreground mb-3">יצירת קשר</h2>
          {!user ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                התחבר כדי לראות את פרטי הקשר של המפרסם.
              </p>
              <Button asChild size="sm">
                <Link to="/auth">התחברות / הרשמה</Link>
              </Button>
            </div>
          ) : !hasContact ? (
            <p className="text-sm text-muted-foreground">המפרסם לא השאיר פרטי קשר.</p>
          ) : !showContact ? (
            <Button onClick={() => setShowContact(true)}>הצג פרטי קשר</Button>
          ) : (
            <div className="space-y-2">
              {listing.contact_name && (
                <p className="flex items-center gap-2">
                  <UserIcon size={16} className="text-primary" />
                  {listing.contact_name}
                </p>
              )}
              {listing.contact_phone && (
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                  dir="ltr"
                >
                  <Phone size={16} />
                  {listing.contact_phone}
                </a>
              )}
              {listing.contact_email && (
                <a
                  href={`mailto:${listing.contact_email}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                  dir="ltr"
                >
                  <Mail size={16} />
                  {listing.contact_email}
                </a>
              )}
              {listing.contact_phone && (
                <Button
                  size="sm"
                  className="gap-1 mt-2"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${listing.contact_phone!.replace(/[^0-9]/g, "").replace(/^0/, "972")}`,
                      "_blank"
                    )
                  }
                >
                  שלח וואטסאפ למפרסם
                </Button>
              )}
            </div>
          )}
        </Card>
      </main>
      <Footer />

      <ListingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        listing={listing}
        onSaved={fetchListing}
      />
    </div>
  );
};

export default ListingPage;
