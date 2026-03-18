import type { GatewayState, DeviceState } from "../../types/network";
import SectorCard from "./SectorCard";

interface Props {
  id: string;
  gateway: GatewayState;
  sectorDevices: Record<string, Record<string, DeviceState>>;
}

export default function GatewayCard({ id, gateway, sectorDevices }: Props) {
  const ping = gateway.ultimoPing;

  return (
    <div className="gw-section">
      {/* ── Gateway header ── */}
      <div className={`gw-card ${gateway.online ? "gw-online" : "gw-offline"}`}>
        <div className="gw-status-bar">
          <span className="gw-dot" />
          <span className="gw-status-label">
            {gateway.online ? "Online" : "Offline"}
          </span>
        </div>

        <div className="gw-main">
          <div className="gw-title-row">
            <span className="gw-icon">&#9670;</span>
            <h3 className="gw-name">Gateway {id}</h3>
          </div>
          <span className="gw-ip">{gateway.ip}</span>
        </div>

        <div className="gw-ping-stats">
          {ping.tiempoPromedio !== null ? (
            <div className="ping-stat">
              <span className="ping-value">{ping.tiempoPromedio}ms</span>
              <span className="ping-label">Latencia</span>
            </div>
          ) : (
            <div className="ping-stat">
              <span className="ping-value ping-timeout">Timeout</span>
              <span className="ping-label">Latencia</span>
            </div>
          )}
          <div className="ping-stat">
            <span className={`ping-value ${ping.porcentajePerdida > 0 ? "ping-loss" : ""}`}>
              {ping.porcentajePerdida}%
            </span>
            <span className="ping-label">Perdida</span>
          </div>
          <div className="ping-stat">
            <span className="ping-value">
              {ping.recibidos}/{ping.enviados}
            </span>
            <span className="ping-label">Paquetes</span>
          </div>
        </div>
      </div>

      {/* ── Vertical trunk line + sectors ── */}
      <div className="gw-trunk">
        {gateway.sectores.map((sector, i) => (
          <SectorCard
            key={sector}
            name={sector}
            devices={sectorDevices[sector] ?? {}}
            isLast={i === gateway.sectores.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
