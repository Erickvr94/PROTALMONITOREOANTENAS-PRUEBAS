import { FINCAS } from "../config/fincas";
import { Link } from "react-router-dom";
import "./DashboardHome.css";

export default function DashboardHome() {
  return (
    <div className="dashboard-home">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Portal de Monitoreo de Antenas</p>

      <div className="finca-cards">
        {FINCAS.map((finca) => (
          <div key={finca.id} className="finca-card">
            <div className="finca-card-header">
              <h2 className="finca-card-name">{finca.name}</h2>
              <span
                className={`finca-status ${finca.wsUrl ? "status-active" : "status-pending"}`}
              >
                {finca.wsUrl ? "Conectado" : "Pendiente"}
              </span>
            </div>

            <div className="finca-card-body">
              {finca.wsUrl ? (
                <p className="finca-desc">
                  WebSocket activo — datos en tiempo real disponibles.
                </p>
              ) : (
                <p className="finca-desc">
                  Conexion en tiempo real no disponible aun.
                </p>
              )}
            </div>

            <div className="finca-card-actions">
              <Link
                to={`/dashboard/${finca.id}/realtime`}
                className={`finca-link ${!finca.wsUrl ? "finca-link-disabled" : ""}`}
              >
                Tiempo Real
              </Link>
              <Link
                to={`/dashboard/${finca.id}/historico`}
                className={`finca-link ${!finca.hasHistorico ? "finca-link-disabled" : ""}`}
              >
                Historico
              </Link>
              <Link
                to={`/dashboard/${finca.id}/tendencias`}
                className={`finca-link ${!finca.hasTendencias ? "finca-link-disabled" : ""}`}
              >
                Tendencias
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
