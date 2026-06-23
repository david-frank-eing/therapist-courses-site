import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Courses from "./pages/Courses";
import CoursePage from "./pages/CoursePage";
import Board from "./pages/Board";
import ListingPage from "./pages/ListingPage";
import CRM from "./pages/CRM";
import ClientDetail from "./pages/ClientDetail";
import Admin from "./pages/Admin";
import BookingPage from "./pages/BookingPage";
import ComingSoon from "./pages/ComingSoon";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// flip to false when the site is ready to launch
const MAINTENANCE_MODE = true;

function AppRoutes() {
  const { isAdmin } = useAuth();
  const location = useLocation();

  const isPublicRoute =
    location.pathname === "/auth" ||
    location.pathname === "/reset-password" ||
    location.pathname.startsWith("/book/");

  if (MAINTENANCE_MODE && !isAdmin && !isPublicRoute) {
    return <ComingSoon />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/courses" element={<Courses />} />
      <Route path="/course/:id" element={<CoursePage />} />
      <Route path="/board" element={<Board />} />
      <Route path="/board/:id" element={<ListingPage />} />
      <Route path="/crm" element={<CRM />} />
      <Route path="/crm/:id" element={<ClientDetail />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/book/:slug" element={<BookingPage />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
