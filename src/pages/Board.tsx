import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database, ListingCategory } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListingFormDialog } from "@/components/board/ListingFormDialog";
import { LISTING_CATEGORY_OPTIONS, LISTING_CATEGORY_LABELS } from "@/lib/constants";
import { Loader2, Plus, MapPin, Tag, ImageIcon } from "lucide-react";

type Listing = Database["public"]["Tables"]["listings"]["Row"];
// Public list never reads contact columns (hidden from anon at the DB level)
type PublicListing = Pick<
  Listing,
  | "id"
  | "user_id"
  | "title"
  | "description"
  | "category"
  | "price"
  | "city"
  | "image_path"
  | "is_active"
  | "created_at"
>;

const BUCKET = "listing-images";
const PUBLIC_COLS =
  "id,user_id,title,description,category,price,city,image_path,is_active,created_at";

export const imageUrl = (path: string | null): string | null =>
  path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;

const Board = () => {
  const { user } = useAuth();
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [category, setCategory] = useState<ListingCategory | "all">("all");
  const [formOpen, setFormOpen] = useState(false);

  const fetchListings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("listings")
      .select(PUBLIC_COLS)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (!error && data) setListings(data as PublicListing[]);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const filtered =
    category === "all" ? listings : listings.filter((l) => l.category === category);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-10 md:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">לוח מודעות</h1>
            <p className="text-muted-foreground">
              השכרת חדרים, דרושים, סדנאות וציוד — לקהילת המטפלים.
            </p>
          </div>
          {user ? (
            <Button className="gap-1 shrink-0" onClick={() => setFormOpen(true)}>
              <Plus size={18} />
              פרסם מודעה
            </Button>
          ) : (
            <Button className="gap-1 shrink-0" asChild>
              <Link to="/auth">התחבר כדי לפרסם</Link>
            </Button>
          )}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setCategory("all")}
            className={`px-4 py-2 rounded-full text-sm transition-smooth ${
              category === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-muted-foreground hover:text-foreground"
            }`}
          >
            הכל
          </button>
          {LISTING_CATEGORY_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setCategory(o.value)}
              className={`px-4 py-2 rounded-full text-sm transition-smooth ${
                category === o.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              {listings.length === 0
                ? "עדיין אין מודעות. היה הראשון לפרסם!"
                : "אין מודעות בקטגוריה זו"}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((listing) => {
              const img = imageUrl(listing.image_path);
              return (
                <Link key={listing.id} to={`/board/${listing.id}`}>
                  <Card className="overflow-hidden h-full hover:shadow-md transition-smooth flex flex-col">
                    <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                      {img ? (
                        <img
                          src={img}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon className="text-muted-foreground" size={32} />
                      )}
                    </div>
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <Badge variant="secondary" className="w-fit">
                        {LISTING_CATEGORY_LABELS[listing.category]}
                      </Badge>
                      <h3 className="font-semibold text-foreground line-clamp-1">
                        {listing.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                        {listing.description}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1">
                        {listing.price && (
                          <span className="flex items-center gap-1">
                            <Tag size={14} />
                            {listing.price}
                          </span>
                        )}
                        {listing.city && (
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            {listing.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <Footer />

      <ListingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        listing={null}
        onSaved={fetchListings}
      />
    </div>
  );
};

export default Board;
