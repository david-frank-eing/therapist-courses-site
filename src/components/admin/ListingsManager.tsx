import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListingFormDialog } from "@/components/board/ListingFormDialog";
import { LISTING_CATEGORY_LABELS } from "@/lib/constants";
import { Loader2, Pencil, Trash2, Eye, EyeOff, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetchAll } from "@/lib/fetchAll";
import { useConfirm } from "@/components/ConfirmDialog";

type Listing = Database["public"]["Tables"]["listings"]["Row"];

const BUCKET = "listing-images";
const PAGE = 30;

export const ListingsManager = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [shownCount, setShownCount] = useState(PAGE);
  useEffect(() => setShownCount(PAGE), [query]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? listings.filter((l) => [l.title, l.description, l.city].some((v) => (v ?? "").toLowerCase().includes(q))) : listings;
  }, [listings, query]);
  const shown = filtered.slice(0, shownCount);

  const fetchListings = async () => {
    setIsLoading(true);
    const { data, error } = await fetchAll<Listing>((from, to) =>
      supabase.from("listings").select("*").order("created_at", { ascending: false }).order("id").range(from, to) as any
    );
    if (!error) setListings(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const toggleActive = async (listing: Listing) => {
    const { error } = await supabase
      .from("listings")
      .update({ is_active: !listing.is_active })
      .eq("id", listing.id);
    if (error) {
      toast({ title: "עדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    setListings((prev) =>
      prev.map((l) => (l.id === listing.id ? { ...l, is_active: !l.is_active } : l))
    );
  };

  const handleDelete = async (listing: Listing) => {
    if (!(await confirm({ title: `למחוק את המודעה "${listing.title}"?`, danger: true }))) return;
    const { error } = await supabase.from("listings").delete().eq("id", listing.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    if (listing.image_path) {
      await supabase.storage.from(BUCKET).remove([listing.image_path]);
    }
    toast({ title: "המודעה נמחקה" });
    fetchListings();
  };

  const openEdit = (listing: Listing) => {
    setEditing(listing);
    setEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (listings.length === 0) {
    return <Card className="p-10 text-center text-muted-foreground">אין מודעות עדיין.</Card>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        כל המודעות בלוח. אפשר להסתיר, לערוך או למחוק כל מודעה.
      </p>
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי כותרת, תיאור או עיר" className="pr-9" />
      </div>
      {filtered.length === 0 && <Card className="p-8 text-center text-muted-foreground">אין מודעות שמתאימות לחיפוש.</Card>}
      {shown.map((listing) => (
        <Card
          key={listing.id}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{listing.title}</span>
              <Badge variant="secondary">{LISTING_CATEGORY_LABELS[listing.category]}</Badge>
              {listing.is_active ? (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">פעילה</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">מוסתרת</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
              {listing.description}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => toggleActive(listing)}
            >
              {listing.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
              {listing.is_active ? "הסתר" : "הצג"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(listing)}>
              <Pencil size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => handleDelete(listing)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </Card>
      ))}
      {filtered.length > shown.length && (
        <div className="flex flex-col items-center gap-1 pt-2">
          <Button variant="outline" onClick={() => setShownCount((n) => n + PAGE)}>להציג עוד</Button>
          <span className="text-xs text-muted-foreground">מוצגות {shown.length} מתוך {filtered.length}</span>
        </div>
      )}

      <ListingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        listing={editing}
        onSaved={fetchListings}
      />
    </div>
  );
};
