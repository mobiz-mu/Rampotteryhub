import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  async function goHome() {
    const { data } = await supabase.auth.getSession();
    const loggedIn = !!data?.session;

    navigate(loggedIn ? "/dashboard" : "/auth", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center max-w-md">
        <h1 className="mb-2 text-5xl font-bold tracking-tight">404</h1>
        <p className="mb-6 text-muted-foreground text-lg">
          Sorry, the page you’re looking for doesn’t exist.
        </p>

        <Button
          className="gradient-primary shadow-glow"
          onClick={goHome}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
