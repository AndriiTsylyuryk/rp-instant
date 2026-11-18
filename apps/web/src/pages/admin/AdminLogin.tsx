import { Navigate, useNavigate } from "react-router-dom";
import { LoginForm } from "../../components/LoginForm";
import { useAuth } from "../../auth/useAuth";

export default function AdminLogin() {
  const { viewer } = useAuth();
  const navigate = useNavigate();

  if (viewer?.kind === "manager") return <Navigate to="/admin" replace />;

  return (
    <div className="page">
      <LoginForm
        collection="managers"
        allowOAuth
        onDone={() => navigate("/admin", { replace: true })}
      />
    </div>
  );
}
