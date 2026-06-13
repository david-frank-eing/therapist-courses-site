import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListingFormDialog } from "@/components/board/ListingFormDialog";
import { LISTING_CATEGORY_LABELS } from "@/lib/constants";
import { Loader2, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

type Listing = Database["public"]["Tables"]["listings"]["Row"];

const BUCKET = "listing-images";

export const ListingsManager = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  const fetchListings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setListings(data);
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
      {listings.map((listing) => (
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

      <ListingFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        listing={editing}
        onSaved={fetchListings}
      />
    </div>
  );
};
