import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORY_LABELS, TIER_LABELS } from "@/lib/constants";
import { CourseFormDialog, type Course } from "@/components/admin/CourseFormDialog";
import { ResourceManagerDialog } from "@/components/admin/ResourceManagerDialog";
import { UsersManager } from "@/components/admin/UsersManager";
import { Loader2, Plus, Pencil, Trash2, FileText, ShieldAlert } from "lucide-react";

const Admin = () => {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [resourceCourse, setResourceCourse] = useState<Course | null>(null);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);

  const fetchCourses = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .order("order_index", { ascending: true });
    if (!error && data) setCourses(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchCourses();
  }, [isAdmin]);

  const openCreate = () => {
    setEditingCourse(null);
    setFormOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditingCourse(course);
    setFormOpen(true);
  };

  const openResources = (course: Course) => {
    setResourceCourse(course);
    setResourceDialogOpen(true);
  };

  const handleDelete = async (course: Course) => {
    if (!confirm(`למחוק את הקורס "${course.title}"? כל הסרטונים והמשאבים המשויכים יימחקו גם הם.`))
      return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הקורס נמחק" });
    fetchCourses();
  };

  // --- Access guards ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20">
          <div className="max-w-md mx-auto text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">אין הרשאת גישה</h1>
            <p className="text-muted-foreground mb-6">
              {user
                ? "החשבון שלך אינו מוגדר כמנהל. פנה למנהל המערכת."
                : "יש להתחבר עם חשבון מנהל כדי לגשת לאזור הניהול."}
            </p>
            <Button asChild>
              <Link to={user ? "/" : "/auth"}>{user ? "חזרה לדף הבית" : "להתחברות"}</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-10 md:py-16">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">אזור ניהול</h1>

        <Tabs defaultValue="courses" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="courses">קורסים</TabsTrigger>
            <TabsTrigger value="users">משתמשים</TabsTrigger>
          </TabsList>

          <TabsContent value="courses">
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                הוספה, עריכה, סרטונים ומשאבים של הקורסים.
              </p>
              <Button onClick={openCreate} className="gap-1">
                <Plus size={18} />
                קורס חדש
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : courses.length === 0 ? (
              <Card className="p-10 text-center">
                <p className="text-muted-foreground mb-4">עדיין אין קורסים. צור את הראשון!</p>
                <Button onClick={openCreate} className="gap-1">
                  <Plus size={18} />
                  קורס חדש
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {courses.map((course) => (
                  <Card
                    key={course.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{course.title}</span>
                        <Badge variant="secondary">{CATEGORY_LABELS[course.category]}</Badge>
                        <Badge variant="outline">מנוי: {TIER_LABELS[course.min_tier]}</Badge>
                        {course.is_published ? (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                            מפורסם
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            טיוטה
                          </Badge>
                        )}
                      </div>
                      {course.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                          {course.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => openResources(course)}
                      >
                        <FileText size={16} />
                        תוכן ומשאבים
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(course)}>
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(course)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="users">
            <UsersManager />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />

      <CourseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        course={editingCourse}
        onSaved={fetchCourses}
      />
      <ResourceManagerDialog
        open={resourceDialogOpen}
        onOpenChange={setResourceDialogOpen}
        course={resourceCourse}
      />
    </div>
  );
};

export default Admin;
