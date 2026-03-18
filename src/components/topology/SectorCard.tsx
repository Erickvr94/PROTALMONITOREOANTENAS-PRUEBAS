import { useState } from "react";
import type { DeviceState } from "../../types/network";
import DeviceRow from "./DeviceRow";

interface Props {
  name: string;
  devices: Record<string, DeviceState>;
  isLast: boolean;
}

export default function SectorCard({ name, devices, isLast }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const entries = Object.entries(devices);
  const onlineCount = entries.filter(([, d]) => d.online).length;

  return (
    <div className={`sector-node ${isLast ? "sector-last" : ""}`}>
      <div className="sector-connector">
        <div className="connector-h" />
      </div>
      <div className="sector-card">
        <button
          className="sector-header"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="sector-title-row">
            <span className="sector-icon">&#9681;</span>
            <span className="sector-name">{name}</span>
            <span className="sector-stats">
              <span className={onlineCount > 0 ? "stat-ok" : "stat-down"}>
                {onlineCount}
              </span>
              /{entries.length}
            </span>
          </div>
          <span className={`sector-chevron ${collapsed ? "" : "chevron-open"}`}>
            &#9656;
          </span>
        </button>

        {!collapsed && (
          <div className="sector-devices">
            {entries.map(([devName, device]) => (
              <DeviceRow key={devName} name={devName} device={device} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
