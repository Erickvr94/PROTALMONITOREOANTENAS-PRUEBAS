import type { NetworkState } from "../../types/network";
import GatewayCard from "./GatewayCard";
import TopologyDiagram from "./TopologyDiagram";
import "./topology.css";

interface Props {
  state: NetworkState;
}

export default function NetworkTopology({ state }: Props) {
  const gwEntries = Object.entries(state.gateways ?? {});
  const hasGateways = gwEntries.length > 0;

  const allDevices = Object.values(state.dispositivos ?? {}).flatMap((sector) =>
    Object.values(sector ?? {}),
  );
  const totalDev = allDevices.length;
  const onlineDev = allDevices.filter((d) => d.online).length;

  if (!hasGateways && totalDev === 0) return null;

  const totalGw = gwEntries.length;
  const onlineGw = gwEntries.filter(([, g]) => g.online).length;

  return (
    <div className="topology">
      {/* ── Summary bar ── */}
      <div className="topo-summary">
        {hasGateways && (
          <>
            <div className="summary-stat">
              <span className="summary-value">
                {onlineGw}/{totalGw}
              </span>
              <span className="summary-label">Gateways</span>
            </div>
            <div className="summary-divider" />
          </>
        )}
        <div className="summary-stat">
          <span className="summary-value">
            {onlineDev}/{totalDev}
          </span>
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

      {/* ── Topology diagrams ── */}
      <div className="topo-diagrams">
        {hasGateways ? (
          gwEntries.every(([, g]) => (g.sectores?.length ?? 0) > 0) ? (
            // Modo normal (IPSP): un diagrama por gateway con árbol
            gwEntries.map(([id, gateway]) => (
              <TopologyDiagram
                key={id}
                gwId={id}
                gateway={gateway}
                sectorDevices={state.dispositivos ?? {}}
              />
            ))
          ) : (
            // Modo Naturisa: sección de gateways + sectores flat sin gateway
            <>
              <div className="topo-section">
                <h2 className="topo-section-title">Gateways</h2>
                <div className="topo-gateways-row">
                  {gwEntries.map(([id, gateway]) => (
                    <GatewayCard
                      key={id}
                      id={id}
                      gateway={gateway}
                      sectorDevices={{}}
                    />
                  ))}
                </div>
              </div>
              <TopologyDiagram sectorDevices={state.dispositivos ?? {}} />
            </>
          )
        ) : (
          <TopologyDiagram sectorDevices={state.dispositivos ?? {}} />
        )}
      </div>
    </div>
  );
}
