import { useParams, Navigate, Link } from "react-router-dom";
import { getEmpresa } from "../config/empresas";
import "./DashboardHome.css";

export default function EmpresaPage() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const empresa = getEmpresa(empresaId ?? "");

  if (!empresa) return <Navigate to="/dashboard" replace />;

  return (
    <div className="dashboard-home">
      <h1 className="page-title">{empresa.name}</h1>
      <p className="page-subtitle">Fincas de la empresa</p>

      <div className="empresa-cards">
        <div className="empresa-card">
          <div className="empresa-card-header">
            <h2 className="empresa-card-name">{empresa.name}</h2>
            <span className="empresa-finca-count">
              {empresa.fincas.length}{" "}
              {empresa.fincas.length === 1 ? "finca" : "fincas"}
            </span>
          </div>

          {empresa.fincas.length === 0 ? (
            <div className="empresa-card-empty">
              Sin fincas configuradas aun.
            </div>
          ) : (
            <div className="finca-list">
              {empresa.fincas.map((finca) => (
                <div key={finca.id} className="finca-row">
                  <div className="finca-row-info">
                    <span className="finca-row-name">{finca.name}</span>
                    <span
                      className={`finca-status ${finca.wsUrl ? "status-active" : "status-pending"}`}
                    >
                      {finca.wsUrl ? "Conectado" : "Pendiente"}
                    </span>
                  </div>
                  <div className="finca-row-actions">
                    <Link
                      to={`/dashboard/${empresa.id}/${finca.id}/realtime`}
                      className={`finca-link ${!finca.wsUrl ? "finca-link-disabled" : ""}`}
                    >
                      Tiempo Real
                    </Link>
                    <Link
                      to={`/dashboard/${empresa.id}/${finca.id}/historico`}
                      className={`finca-link ${!finca.hasHistorico ? "finca-link-disabled" : ""}`}
                    >
                      Historico
                    </Link>
                    <Link
                      to={`/dashboard/${empresa.id}/${finca.id}/tendencias`}
                      className={`finca-link ${!finca.hasTendencias ? "finca-link-disabled" : ""}`}
                    >
                      Tendencias
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
