import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LoginForm } from "../components/LoginForm";
import { useAuth } from "../auth/useAuth";

export default function Login() {
  const { viewer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const from = (location.state as { from?: string } | null)?.from ?? "/me";

  if (viewer?.kind === "fan") return <Navigate to={from} replace />;
  if (viewer?.kind === "manager") return <Navigate to="/admin" replace />;

  return (
    <LoginForm
      collection="fans"
      initialMode={params.get("mode") === "signup" ? "signup" : "login"}
      onDone={() => navigate(from, { replace: true })}
    />
  );
}
