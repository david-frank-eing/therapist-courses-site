import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function toWhatsAppId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("05") && digits.length === 10) return `972${digits.slice(1)}@c.us`;
  if (digits.startsWith("972")) return `${digits}@c.us`;
  return `${digits}@c.us`;
}

function buildMessage(
  template: string,
  clientName: string,
  date: string,
  time: string | null
): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sessionDay = new Date(d);
  sessionDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((sessionDay.getTime() - today.getTime()) / 86400000);

  let when = d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
  if (diffDays === 0) when = "היום";
  if (diffDays === 1) when = "מחר";

  const timeStr = time ? time.slice(0, 5) : "";

  return template
    .replace("{שם}", clientName)
    .replace("{מתי}", when)
    .replace("{שעה}", timeStr);
}

export const useWhatsApp = () => {
  const { profile } = useAuth();
  const [sending, setSending] = useState(false);

  const isConfigured = !!(profile?.wa_instance_id && profile?.wa_api_token);

  const sendReminder = async (
    phone: string,
    clientName: string,
    date: string,
    sessionTime: string | null
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!profile?.wa_instance_id || !profile?.wa_api_token) {
      return { ok: false, error: "הגדרות WhatsApp חסרות — הכנס Instance ID ו-Token" };
    }
    if (!phone) {
      return { ok: false, error: "למטופל אין מספר טלפון" };
    }

    setSending(true);
    const template =
      profile.wa_reminder_template ??
      "שלום {שם}, תזכורת לפגישה שלנו {מתי} בשעה {שעה}. נתראה! 🙏";
    const message = buildMessage(template, clientName, date, sessionTime);
    const chatId = toWhatsAppId(phone);
    const url = `https://api.green-api.com/waInstance${profile.wa_instance_id}/sendMessage/${profile.wa_api_token}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message }),
      });
      const json = await res.json().catch(() => ({}));
      setSending(false);
      if (!res.ok) return { ok: false, error: json?.message ?? `שגיאה ${res.status}` };
      return { ok: true };
    } catch (e) {
      setSending(false);
      return { ok: false, error: "בעיית רשת — בדוק חיבור אינטרנט" };
    }
  };

  const saveSettings = async (instanceId: string, token: string, template: string) => {
    if (!profile) return { error: "לא מחובר" };
    const { error } = await supabase
      .from("profiles")
      .update({ wa_instance_id: instanceId, wa_api_token: token, wa_reminder_template: template })
      .eq("id", profile.id);
    return { error: error?.message ?? null };
  };

  return { sendReminder, saveSettings, isConfigured, sending };
};
