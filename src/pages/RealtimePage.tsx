import { useParams, Navigate } from "react-router-dom";
import { getFinca } from "../config/fincas";
import { useWebSocket, type WsStatus } from "../hooks/useWebSocket";
import "./RealtimePage.css";

const STATUS_LABELS: Record<WsStatus, string> = {
  connecting: "Conectando...",
  connected: "Conectado",
  disconnected: "Desconectado",
};

export default function RealtimePage() {
  const { fincaId } = useParams<{ fincaId: string }>();
  const finca = getFinca(fincaId ?? "");

  if (!finca) return <Navigate to="/dashboard" replace />;

  const { status, messages, lastMessage, clearMessages } = useWebSocket(
    finca.wsUrl,
  );

  return (
    <div className="realtime-page">
      <div className="realtime-header">
        <div>
          <h1 className="page-title">{finca.name} — Tiempo Real</h1>
          <p className="page-subtitle">Topologia de antenas en tiempo real</p>
        </div>
        <div className="realtime-controls">
          <span className={`ws-status ws-${status}`}>
            <span className="ws-dot" />
            {STATUS_LABELS[status]}
          </span>
          {messages.length > 0 && (
            <button className="clear-btn" onClick={clearMessages}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {!finca.wsUrl ? (
        <div className="realtime-empty">
          <p>Conexion WebSocket no configurada para {finca.name}.</p>
        </div>
      ) : (
        <>
          {/* ── Topology preview ── */}
          <div className="topology-section">
            <h2 className="section-title">Topologia</h2>
            {lastMessage ? (
              <div className="topology-container">
                <TopologyPreview data={lastMessage} />
              </div>
            ) : (
              <div className="topology-placeholder">
                {status === "connected"
                  ? "Esperando datos..."
                  : "Conectando al WebSocket..."}
              </div>
            )}
          </div>

          {/* ── Message log ── */}
          <div className="messages-section">
            <h2 className="section-title">
              Mensajes
              <span className="message-count">{messages.length}</span>
            </h2>
            <div className="message-log">
              {messages.length === 0 ? (
                <p className="log-empty">Sin mensajes aun.</p>
              ) : (
                [...messages].reverse().map((msg, i) => (
                  <div key={i} className="log-entry">
                    <pre>{JSON.stringify(msg, null, 2)}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders a visual preview based on the WS data structure */
function TopologyPreview({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return <pre className="topology-raw">{JSON.stringify(data, null, 2)}</pre>;
  }

  const obj = data as Record<string, unknown>;

  // Try to detect arrays of gateways/devices
  const entries = Object.entries(obj);

  return (
    <div className="topology-tree">
      {entries.map(([key, value]) => (
        <div key={key} className="topology-node">
          <div className="topology-node-header">
            <span className="topology-node-key">{key}</span>
            {typeof value === "string" || typeof value === "number" ? (
              <span className="topology-node-value">{String(value)}</span>
            ) : null}
          </div>
          {Array.isArray(value) ? (
            <div className="topology-children">
              {value.map((item, i) => (
                <div key={i} className="topology-child">
                  {typeof item === "object" && item !== null ? (
                    <div className="topology-device">
                      {Object.entries(item as Record<string, unknown>).map(
                        ([k, v]) => (
                          <span key={k} className="device-field">
                            <span className="field-key">{k}:</span>{" "}
                            {String(v)}
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <span>{String(item)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : typeof value === "object" && value !== null ? (
            <div className="topology-children">
              <TopologyPreview data={value} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
