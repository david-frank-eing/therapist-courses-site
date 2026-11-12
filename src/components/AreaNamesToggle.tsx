import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

// "הצג שמות" — admin only. Sticks a small label (K3 · רשימת הקורסים) on every named area of the
// page, so a change request can point at an exact place. The engine and the registry are plain
// files in /public, shared with the Carlos dashboard: /areas-engine.js + /areas-courses.json.
// Areas are marked in the components with data-area="K…".

type Engine = {
  use: (url: string) => Engine;
  toggle: (value?: boolean) => Promise<boolean>;
  isOn: () => boolean;
};

declare global {
  interface Window {
    CarlosAreas?: Engine;
  }
}

const loadEngine = () =>
  new Promise<Engine>((resolve, reject) => {
    if (window.CarlosAreas) return resolve(window.CarlosAreas);
    const s = document.createElement("script");
    s.src = "/areas-engine.js";
    s.onload = () => (window.CarlosAreas ? resolve(window.CarlosAreas) : reject(new Error("engine missing")));
    s.onerror = () => reject(new Error("engine failed to load"));
    document.head.appendChild(s);
  });

export const AreaNamesToggle = () => {
  const { isAdmin } = useAuth();
  const [on, setOn] = useState(false);
  if (!isAdmin) return null;

  const toggle = async () => {
    try {
      const engine = await loadEngine();
      engine.use("/areas-courses.json");
      setOn(await engine.toggle());
    } catch {
      setOn(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title="מציג על כל אזור את הקוד והשם שלו. לחיצה על תווית מעתיקה אותה. Esc מכבה"
      className={`fixed bottom-4 left-4 z-[60] rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md ${
        on ? "border-amber-400 bg-amber-400 text-black" : "border-border bg-background text-foreground"
      }`}
    >
      🏷 {on ? "הסתר שמות" : "הצג שמות"}
    </button>
  );
};
