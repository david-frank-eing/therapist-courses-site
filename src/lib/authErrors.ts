// Supabase answers in English. The common messages, in plain Hebrew; anything else gets a general line
// (the English text is kept in the console for debugging, not shown to the therapist).

const KNOWN: [RegExp, string][] = [
  [/invalid login credentials/i, "האימייל או הסיסמה לא נכונים."],
  [/email not confirmed/i, "צריך לאשר את האימייל לפני הכניסה. בדקו את תיבת הדואר (גם בקידומי מכירות ובספאם)."],
  [/user already registered|already been registered|already exists/i, "כבר יש חשבון עם האימייל הזה. אפשר להתחבר, או לבחור \"שכחתי סיסמה\"."],
  [/password should be at least (\d+)/i, "הסיסמה קצרה מדי. צריך לפחות $1 תווים."],
  [/password.*(weak|pwned|compromised|known)/i, "הסיסמה הזו חלשה מדי או ידועה מדליפות. בחרו סיסמה אחרת."],
  [/new password should be different/i, "הסיסמה החדשה צריכה להיות שונה מהקודמת."],
  [/unable to validate email|invalid email|email address .* is invalid/i, "כתובת האימייל לא תקינה."],
  [/(rate limit|too many requests|security purposes.*after (\d+) seconds)/i, "יותר מדי ניסיונות. נסו שוב בעוד דקה."],
  [/(expired|invalid).*(token|link|otp)|token.*(expired|invalid)/i, "הקישור פג תוקף או כבר נוצל. בקשו קישור חדש."],
  [/auth session missing|session.*(not found|expired)/i, "החיבור פג. התחברו מחדש."],
  [/signups? not allowed|signup is disabled/i, "ההרשמה סגורה כרגע."],
  [/failed to fetch|network/i, "אין חיבור לאינטרנט, או שהשרת לא זמין. נסו שוב."],
];

export const authErrorHe = (err: { message?: string } | string | null | undefined): string => {
  const msg = typeof err === "string" ? err : err?.message ?? "";
  for (const [re, he] of KNOWN) {
    const m = msg.match(re);
    if (m) return he.replace("$1", m[1] ?? "");
  }
  if (msg) console.warn("[auth]", msg);
  return "משהו השתבש. נסו שוב, ואם זה חוזר פנו אלינו.";
};
