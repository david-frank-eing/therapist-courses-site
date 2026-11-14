import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// "Are you sure?" in the site's own design, instead of the browser's grey confirm() box.
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "למחוק את הקורס?", text: "...", danger: true }))) return;

interface Ask {
  title: string;
  text?: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
}

type ConfirmFn = (ask: Ask) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((a) => {
    resolver.current?.(false);
    setAsk(a);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);

  const done = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setAsk(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!ask} onOpenChange={(o) => { if (!o) done(false); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            {ask?.text && <AlertDialogDescription className="whitespace-pre-line">{ask.text}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => done(false)}>{ask?.cancel ?? "ביטול"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => done(true)}
              className={ask?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {ask?.ok ?? (ask?.danger ? "מחיקה" : "אישור")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const c = useContext(Ctx);
  // outside the provider (should not happen) fall back to the browser box rather than break the action
  return c ?? (async (a) => window.confirm(a.text ? `${a.title}\n\n${a.text}` : a.title));
};
