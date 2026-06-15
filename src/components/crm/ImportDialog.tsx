import { useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { ClientStatus } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface PreviewRow {
  full_name: string;
  phone: string;
  email: string;
  status: ClientStatus;
  notes: string;
  error?: string;
}

const STATUS_MAP: Record<string, ClientStatus> = {
  פעיל: "active",
  active: "active",
  ליד: "lead",
  lead: "lead",
  "לא פעיל": "inactive",
  inactive: "inactive",
};

function parseStatus(raw: string): ClientStatus {
  return STATUS_MAP[raw?.trim()] ?? "active";
}

function validateRow(row: PreviewRow): string | undefined {
  if (!row.full_name?.trim()) return "חסר שם";
  return undefined;
}

export const ImportDialog = ({ open, onOpenChange, onImported }: ImportDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [done, setDone] = useState<{ ok: number; failed: number } | null>(null);

  const reset = () => {
    setPreview([]);
    setFileName("");
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setDone(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: PreviewRow[] = results.data.map((raw) => {
          // Support Hebrew column names (from our export) or English
          const row: PreviewRow = {
            full_name: raw["שם"] ?? raw["full_name"] ?? raw["name"] ?? "",
            phone: raw["טלפון"] ?? raw["phone"] ?? "",
            email: raw["אימייל"] ?? raw["email"] ?? "",
            status: parseStatus(raw["סטטוס"] ?? raw["status"] ?? ""),
            notes: raw["הערות"] ?? raw["notes"] ?? "",
          };
          row.error = validateRow(row);
          return row;
        });
        setPreview(rows);
      },
    });
  };

  const validRows = preview.filter((r) => !r.error);
  const invalidRows = preview.filter((r) => r.error);

  const handleImport = async () => {
    if (!user || validRows.length === 0) return;
    setIsImporting(true);

    const payload = validRows.map((r) => ({
      user_id: user.id,
      full_name: r.full_name.trim(),
      phone: r.phone.trim() || null,
      email: r.email.trim() || null,
      status: r.status,
      notes: r.notes.trim() || null,
    }));

    // Insert in batches of 50
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < payload.length; i += 50) {
      const batch = payload.slice(i, i + 50);
      const { error } = await supabase.from("clients").insert(batch);
      if (error) failed += batch.length;
      else ok += batch.length;
    }

    setIsImporting(false);
    setDone({ ok, failed });

    if (ok > 0) {
      toast({ title: `יובאו ${ok} מטופלים בהצלחה` });
      onImported();
    }
    if (failed > 0) {
      toast({ title: `${failed} שורות נכשלו`, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>ייבוא מטופלים מ-CSV</DialogTitle>
        </DialogHeader>

        {/* Instructions */}
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">פורמט הקובץ (עמודות נדרשות):</p>
          <p>
            <span className="font-mono bg-muted px-1 rounded">שם</span> (חובה) ·{" "}
            <span className="font-mono bg-muted px-1 rounded">טלפון</span> ·{" "}
            <span className="font-mono bg-muted px-1 rounded">אימייל</span> ·{" "}
            <span className="font-mono bg-muted px-1 rounded">סטטוס</span> (פעיל/ליד/לא פעיל) ·{" "}
            <span className="font-mono bg-muted px-1 rounded">הערות</span>
          </p>
          <p className="text-xs">קובץ שיוצא מהמערכת תואם אוטומטית לפורמט הזה.</p>
        </div>

        {/* File picker */}
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {fileName ? fileName : "לחץ לבחירת קובץ CSV"}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && !done && (
          <div>
            <div className="flex items-center gap-3 mb-3 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 size={15} />
                {validRows.length} תקינים
              </span>
              {invalidRows.length > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle size={15} />
                  {invalidRows.length} עם שגיאה
                </span>
              )}
            </div>

            <div className="max-h-52 overflow-y-auto border rounded-lg divide-y text-sm">
              {preview.slice(0, 100).map((row, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2 ${row.error ? "bg-destructive/5" : ""}`}
                >
                  {row.error ? (
                    <XCircle size={14} className="text-destructive shrink-0" />
                  ) : (
                    <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                  )}
                  <span className="font-medium min-w-0 truncate">{row.full_name || "—"}</span>
                  {row.phone && <span className="text-muted-foreground dir-ltr">{row.phone}</span>}
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {row.status === "active" ? "פעיל" : row.status === "lead" ? "ליד" : "לא פעיל"}
                  </Badge>
                  {row.error && (
                    <span className="text-destructive text-xs mr-auto">{row.error}</span>
                  )}
                </div>
              ))}
              {preview.length > 100 && (
                <div className="px-3 py-2 text-muted-foreground text-center">
                  ועוד {preview.length - 100} שורות...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Done state */}
        {done && (
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="font-medium">
              יובאו {done.ok} מטופלים
              {done.failed > 0 && ` · ${done.failed} נכשלו`}
            </p>
            {invalidRows.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <AlertCircle size={12} />
                {invalidRows.length} שורות דולגו — חסר שם
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleClose(false)}>
            {done ? "סגור" : "ביטול"}
          </Button>
          {validRows.length > 0 && !done && (
            <Button onClick={handleImport} disabled={isImporting} className="gap-1">
              {isImporting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              ייבוא {validRows.length} מטופלים
            </Button>
          )}
          {done && (
            <Button variant="outline" onClick={reset} className="gap-1">
              <Upload size={15} />
              ייבוא נוסף
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
