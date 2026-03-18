import { useRef, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getFinca } from "../config/fincas";
import { useWebSocket, type WsStatus } from "../hooks/useWebSocket";
import NetworkTopology from "../components/topology/NetworkTopology";
import {
  type NetworkState,
  type WsMessage,
  EMPTY_STATE,
  reduceNetwork,
} from "../types/network";
import "./RealtimePage.css";

const STATUS_LABELS: Record<WsStatus, string> = {
  connecting: "Conectando...",
  connected: "Conectado",
  disconnected: "Desconectado",
};

export default function RealtimePage() {
  const { fincaId } = useParams<{ fincaId: string }>();
  const finca = getFinca(fincaId ?? "");
  const networkRef = useRef<NetworkState>(EMPTY_STATE);

  const onMessage = useCallback((raw: unknown) => {
    const msg = raw as WsMessage;
    if (msg && typeof msg === "object" && "tipo" in msg) {
      networkRef.current = reduceNetwork(networkRef.current, msg);
    }
  }, []);

  const { status } = useWebSocket(finca?.wsUrl ?? null, onMessage);

  if (!finca) return <Navigate to="/dashboard" replace />;

  const network = networkRef.current;
  const hasData = Object.keys(network.gateways).length > 0;

  return (
    <div className="realtime-page">
      <div className="realtime-header">
        <div>
          <h1 className="page-title">{finca.name} — Tiempo Real</h1>
          <p className="page-subtitle">Topologia de antenas en tiempo real</p>
        </div>
        <span className={`ws-status ws-${status}`}>
          <span className="ws-dot" />
          {STATUS_LABELS[status]}
        </span>
      </div>

      {!finca.wsUrl ? (
        <div className="realtime-empty">
          <p>Conexion WebSocket no configurada para {finca.name}.</p>
        </div>
      ) : hasData ? (
        <NetworkTopology state={network} />
      ) : (
        <div className="realtime-empty">
          <p>
            {status === "connected"
              ? "Esperando datos del servidor..."
              : "Conectando al WebSocket..."}
          </p>
        </div>
      )}
    </div>
  );
}
