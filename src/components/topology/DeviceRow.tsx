import type { DeviceState } from "../../types/network";

interface Props {
  name: string;
  device: DeviceState;
}

export default function DeviceRow({ name, device }: Props) {
  const isAP = name.startsWith("AP");
  const isPTP = name.startsWith("PTP");

  return (
    <div className={`device-row ${device.online ? "dev-online" : "dev-offline"}`}>
      <span className="dev-status-dot" />
      <div className="dev-info">
        <div className="dev-name-line">
          <span className={`dev-type-badge ${isAP ? "badge-ap" : isPTP ? "badge-ptp" : "badge-other"}`}>
            {isAP ? "AP" : isPTP ? "PTP" : "DEV"}
          </span>
          <span className="dev-name">{name}</span>
          <span className="dev-ip">{device.ip}</span>
        </div>
        <div className="dev-detail-line">
          <span className="dev-ubicacion">{device.ubicacion}</span>
          {device.uptime && (
            <span className="dev-uptime">Up: {device.uptime}</span>
          )}
          {device.error && (
            <span className="dev-error">{device.error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
