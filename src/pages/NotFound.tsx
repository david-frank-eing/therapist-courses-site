import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const NotFound = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container flex-1 py-20 text-center">
        <div className="text-6xl mb-4">🧭</div>
        <h1 className="text-3xl font-bold mb-3">הדף לא נמצא</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          ייתכן שהקישור ישן או שנפלה טעות בכתובת. אפשר לחזור לדף הבית או לעבור לקורסים.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild><Link to={user ? "/home" : "/"}>לדף הבית</Link></Button>
          <Button variant="outline" asChild><Link to="/courses">לכל הקורסים</Link></Button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
