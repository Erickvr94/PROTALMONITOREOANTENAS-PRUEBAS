import type { NetworkState } from "../../types/network";
import TopologyDiagram from "./TopologyDiagram";
import "./topology.css";

interface Props {
  state: NetworkState;
}

export default function NetworkTopology({ state }: Props) {
  const gwEntries = Object.entries(state.gateways);

  if (gwEntries.length === 0) return null;

  // Count totals
  const totalGw = gwEntries.length;
  const onlineGw = gwEntries.filter(([, g]) => g.online).length;

  const allDevices = Object.values(state.dispositivos).flatMap((sector) =>
    Object.values(sector),
  );
  const totalDev = allDevices.length;
  const onlineDev = allDevices.filter((d) => d.online).length;

  return (
    <div className="topology">
      {/* ── Summary bar ── */}
      <div className="topo-summary">
        <div className="summary-stat">
          <span className="summary-value">{onlineGw}/{totalGw}</span>
          <span className="summary-label">Gateways</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-value">{onlineDev}/{totalDev}</span>
          <span className="summary-label">Dispositivos</span>
        </div>
        {state.timestamp && (
          <>
            <div className="summary-divider" />
            <div className="summary-stat">
              <span className="summary-value summary-time">
                {new Date(state.timestamp).toLocaleTimeString()}
              </span>
              <span className="summary-label">Actualizado</span>
            </div>
          </>
        )}
      </div>

      {/* ── Topology diagrams (one per gateway) ── */}
      <div className="topo-diagrams">
        {gwEntries.map(([id, gateway]) => (
          <TopologyDiagram
            key={id}
            gwId={id}
            gateway={gateway}
            sectorDevices={state.dispositivos}
          />
        ))}
      </div>
    </div>
  );
}
