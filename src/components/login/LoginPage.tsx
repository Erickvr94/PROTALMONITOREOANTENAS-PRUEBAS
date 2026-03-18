import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import logo from "../../assets/logomelacorp.png";
import "./LoginPage.css";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!usuario.trim() || !contrasena) {
      setError("Completa todos los campos.");
      return;
    }

    setSubmitting(true);
    try {
      await login(usuario.trim(), contrasena);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error({ err });
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("No se pudo conectar al servidor.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-glow" />

      <div className="login-container">
        <div className="login-header">
          <img src={logo} alt="Melacorp" className="login-logo" />
          <h1 className="login-title">Portal de monitoreo</h1>
        </div>

        <div className="login-card">
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="usuario">Usuario</label>
              <input
                id="usuario"
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Ingresa tu usuario"
                autoComplete="username"
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="contrasena">Contrasena</label>
              <input
                id="contrasena"
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Ingresa tu contrasena"
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>

        <p className="login-footer">
          Melacorp &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
