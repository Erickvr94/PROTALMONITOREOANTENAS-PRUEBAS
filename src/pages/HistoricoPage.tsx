import { useParams, Navigate } from "react-router-dom";
import { getFinca } from "../config/fincas";
import "./HistoricoPage.css";

export default function HistoricoPage() {
  const { fincaId } = useParams<{ fincaId: string }>();
  const finca = getFinca(fincaId ?? "");

  if (!finca) return <Navigate to="/dashboard" replace />;

  return (
    <div className="historico-page">
      <h1 className="page-title">{finca.name} — Historico</h1>
      <p className="page-subtitle">Datos historicos de la red de antenas</p>

      <div className="historico-placeholder">
        <div className="placeholder-icon">&#9776;</div>
        <p>Los datos historicos de {finca.name} se mostraran aqui.</p>
        <p className="placeholder-hint">
          Graficas, tablas y reportes de rendimiento de la red.
        </p>
      </div>
    </div>
  );
}
