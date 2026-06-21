import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BookingProfile {
  user_id: string;
  name: string;
  title: string;
  bio: string;
  services: string[];
  location: string;
  photo_url?: string;
}

interface Slot {
  id: string;
  date: string;
  time: string;
  time_to: string;
  duration_min: number;
  booked: boolean;
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<BookingProfile | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", service: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: prof } = await supabase
        .from("booking_profiles")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (!prof) { setLoading(false); return; }
      setProfile(prof);

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
      const { data: slotData } = await supabase
        .from("availability_slots")
        .select("*")
        .eq("user_id", prof.user_id)
        .eq("booked", false)
        .gte("date", today)
        .order("date")
        .order("time");
      setSlots(slotData || []);
      setLoading(false);
    })();
  }, [slug]);

  const groupByDate = (slots: Slot[]) => {
    const m: Record<string, Slot[]> = {};
    for (const s of slots) {
      if (!m[s.date]) m[s.date] = [];
      m[s.date].push(s);
    }
    return m;
  };

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  const handleBook = async () => {
    if (!selectedSlot || !profile) return;
    if (!form.name || !form.phone) { setError("שם וטלפון הם שדות חובה"); return; }
    setSubmitting(true);
    setError("");

    const { error: apptErr } = await supabase.from("appointments").insert({
      user_id: profile.user_id,
      slot_id: selectedSlot.id,
      patient_name: form.name,
      patient_phone: form.phone,
      service: form.service || (profile.services?.[0] || ""),
      notes: form.notes,
      status: "confirmed",
      date: selectedSlot.date,
      time: selectedSlot.time,
    });

    if (apptErr) { setError("שגיאה בשמירת התור — נסה שוב"); setSubmitting(false); return; }

    await supabase.from("availability_slots").update({ booked: true, booked_at: new Date().toISOString() }).eq("id", selectedSlot.id);
    await supabase.from("booking_notifs").insert({
      user_id: profile.user_id,
      text: `תור חדש: ${form.name} — ${selectedSlot.date} ${selectedSlot.time}`,
      appt_data: { name: form.name, phone: form.phone, date: selectedSlot.date, time: selectedSlot.time, service: form.service },
      read: false,
    });

    setDone(true);
    setSubmitting(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-lg">טוען...</div>;
  if (!profile) return <div className="flex items-center justify-center min-h-screen text-lg">הדף לא נמצא</div>;

  if (done) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
      <div className="text-5xl">✅</div>
      <h1 className="text-2xl font-bold">התור נקבע בהצלחה!</h1>
      <p className="text-muted-foreground">{selectedSlot?.date} בשעה {selectedSlot?.time}</p>
      <p className="text-muted-foreground">נשמח לראות אותך, {form.name}</p>
    </div>
  );

  const grouped = groupByDate(slots);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
        {/* Profile header */}
        <div className="text-center mb-8">
          {profile.photo_url && (
            <img src={profile.photo_url} alt={profile.name} className="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
          )}
          <h1 className="text-2xl md:text-3xl font-bold">{profile.name}</h1>
          {profile.title && <p className="text-muted-foreground mt-1">{profile.title}</p>}
          {profile.location && <p className="text-sm text-muted-foreground mt-1">📍 {profile.location}</p>}
          {profile.bio && <p className="mt-4 text-foreground">{profile.bio}</p>}
        </div>

        {/* Slot selection */}
        {!selectedSlot ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">בחר תאריך ושעה</h2>
            {slots.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">אין זמנים פנויים כרגע</p>
            ) : (
              Object.entries(grouped).map(([date, daySlots]) => (
                <div key={date} className="mb-6">
                  <div className="font-medium text-foreground mb-2">{formatDate(date)}</div>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map(slot => (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                        className="px-4 py-2 border border-border rounded-lg hover:bg-accent hover:border-primary transition-colors text-sm"
                      >
                        {slot.time.slice(0, 5)}{slot.time_to ? `–${slot.time_to.slice(0, 5)}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => setSelectedSlot(null)} className="text-sm text-muted-foreground mb-4 flex items-center gap-1 hover:text-foreground">
              ← חזרה לבחירת שעה
            </button>
            <div className="bg-accent rounded-xl p-4 mb-6 text-center">
              <div className="font-semibold">{formatDate(selectedSlot.date)}</div>
              <div className="text-base md:text-lg font-bold text-primary">{selectedSlot.time.slice(0, 5)}</div>
            </div>

            <div className="flex flex-col gap-4">
              <Input placeholder="שם מלא *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="טלפון *" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              {profile.services && profile.services.length > 0 && (
                <select
                  className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground"
                  value={form.service}
                  onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                >
                  <option value="">בחר סוג טיפול</option>
                  {profile.services.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <Input placeholder="הערות (אופציונלי)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button onClick={handleBook} disabled={submitting} className="w-full text-lg py-6">
                {submitting ? "שומר..." : "קבע תור"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
