import { useMemo, useState, useCallback, type ReactNode } from "react";
import type { GatewayState, DeviceState } from "../../types/network";

/* ═══════════════════════════════════════
   Layout constants
   ═══════════════════════════════════════ */
const SLOT_W = 140;
const SECTOR_GAP = 48;
const PAD_X = 56;

const GW_Y = 100;
const SECTOR_Y = 340;
const DEVICE_Y = 575;

const MID_GW = 220;
const MID_SECTOR = 458;

const SVG_H = 720;

const LINE_COLOR = "rgba(79, 110, 247, 0.25)";
const LINE_W = 2;

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */
interface SectorLayout {
  name: string;
  centerX: number;
  devices: { name: string; dev: DeviceState; x: number }[];
  onlineCount: number;
}

interface TooltipData {
  x: number;
  y: number;
  content: ReactNode;
}

interface Props {
  gwId: string;
  gateway: GatewayState;
  sectorDevices: Record<string, Record<string, DeviceState>>;
}

/* ═══════════════════════════════════════
   Layout calculation
   ═══════════════════════════════════════ */
function useLayout(
  gateway: GatewayState,
  sectorDevices: Record<string, Record<string, DeviceState>>,
) {
  return useMemo(() => {
    let cursor = PAD_X;
    const sectors: SectorLayout[] = [];

    for (const sName of gateway.sectores) {
      const devEntries = Object.entries(sectorDevices[sName] ?? {});
      const numSlots = Math.max(devEntries.length, 1);
      const groupW = numSlots * SLOT_W;

      const devices = devEntries.map(([name, dev], i) => ({
        name,
        dev,
        x: cursor + i * SLOT_W + SLOT_W / 2,
      }));

      sectors.push({
        name: sName,
        centerX: cursor + groupW / 2,
        devices,
        onlineCount: devEntries.filter(([, d]) => d.online).length,
      });

      cursor += groupW + SECTOR_GAP;
    }

    const contentW = cursor - SECTOR_GAP + PAD_X;
    const gwX = contentW / 2;

    return { svgW: Math.max(contentW, 500), gwX, sectors };
  }, [gateway, sectorDevices]);
}

/* ═══════════════════════════════════════
   Tree connector lines
   ═══════════════════════════════════════ */
function TreeLines({
  parentX,
  parentBottomY,
  midY,
  childXs,
  childTopY,
}: {
  parentX: number;
  parentBottomY: number;
  midY: number;
  childXs: number[];
  childTopY: number;
}) {
  if (childXs.length === 0) return null;
  const minX = Math.min(...childXs);
  const maxX = Math.max(...childXs);

  return (
    <g stroke={LINE_COLOR} strokeWidth={LINE_W} fill="none">
      <line x1={parentX} y1={parentBottomY} x2={parentX} y2={midY} />
      {childXs.length > 1 && (
        <line x1={minX} y1={midY} x2={maxX} y2={midY} />
      )}
      {childXs.map((cx, i) => (
        <line key={i} x1={cx} y1={midY} x2={cx} y2={childTopY} />
      ))}
    </g>
  );
}

/* ═══════════════════════════════════════
   SVG Icons
   ═══════════════════════════════════════ */

function GatewayIcon({
  x,
  y,
  online,
  id,
  ip,
  gateway,
  onHover,
  onLeave,
}: {
  x: number;
  y: number;
  online: boolean;
  id: string;
  ip: string;
  gateway: GatewayState;
  onHover: (e: React.PointerEvent, content: ReactNode) => void;
  onLeave: () => void;
}) {
  const fill = online ? "#0f2118" : "#211215";
  const stroke = online ? "#3cc77a" : "#e05050";
  const glow = online
    ? "drop-shadow(0 0 10px rgba(60,199,122,0.35))"
    : "drop-shadow(0 0 10px rgba(224,80,80,0.3))";

  const p = gateway.ultimoPing;
  const sectores = gateway.sectores.join(", ");

  const tip = (
    <div>
      <div className="tt-title">Gateway {id} — {online ? "Online" : "Offline"}</div>
      <div className="tt-row"><span className="tt-label">IP</span>{ip}</div>
      <div className="tt-row"><span className="tt-label">Sectores</span>{sectores}</div>
      <div className="tt-sep" />
      <div className="tt-row"><span className="tt-label">Paquetes</span>{p.recibidos}/{p.enviados} recibidos</div>
      <div className="tt-row"><span className="tt-label">Perdida</span>{p.porcentajePerdida}%</div>
      <div className="tt-row"><span className="tt-label">Latencia</span>{p.tiempoPromedio !== null ? `${p.tiempoPromedio}ms` : "Timeout"}</div>
      <div className="tt-sep" />
      <div className="tt-time">{fmtTime(gateway.ultimaActualizacion)}</div>
    </div>
  );

  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ filter: glow }}
      className="topo-node"
      onPointerEnter={(e) => onHover(e, tip)}
      onPointerLeave={onLeave}
    >
      {/* Body */}
      <rect x={-48} y={-26} width={96} height={52} rx={10} fill={fill} stroke={stroke} strokeWidth={2} />
      {/* Antennas */}
      <line x1={-16} y1={-26} x2={-26} y2={-56} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={16} y1={-26} x2={26} y2={-56} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={-26} cy={-58} r={4} fill={stroke} />
      <circle cx={26} cy={-58} r={4} fill={stroke} />
      {/* Signal arcs */}
      <path d="M-7,-62 A 11,11 0 0,1 7,-62" fill="none" stroke={stroke} strokeWidth={1.8} opacity={0.6} />
      <path d="M-14,-68 A 20,20 0 0,1 14,-68" fill="none" stroke={stroke} strokeWidth={1.8} opacity={0.35} />
      {/* Port LEDs */}
      {[-24, -12, 0, 12, 24].map((px) => (
        <rect key={px} x={px - 3.5} y={7} width={7} height={10} rx={2} fill={stroke} opacity={online ? 0.6 : 0.2} />
      ))}
      {/* Status LED */}
      <circle cx={0} cy={-5} r={5} fill={stroke} opacity={0.85} />
      {/* Labels */}
      <text y={46} textAnchor="middle" fill="#c0c7da" fontSize={18} fontWeight={700}>
        Gateway {id}
      </text>
      <text y={66} textAnchor="middle" fill="#6b8af7" fontSize={15} fontFamily="monospace">
        {ip}
      </text>
      <text y={84} textAnchor="middle" fill={online ? "#3cc77a" : "#e05050"} fontSize={13} fontWeight={600}>
        {online ? "Online" : "Offline"}
        <tspan fill="#4a5068" fontWeight={400}>
          {" · "}
          {p.tiempoPromedio !== null ? `${p.tiempoPromedio}ms` : "Timeout"}
          {" · "}
          {p.porcentajePerdida}% loss
        </tspan>
      </text>
    </g>
  );
}

function SectorIcon({
  x,
  y,
  name,
  onlineCount,
  totalCount,
  sectorDevices,
  onHover,
  onLeave,
}: {
  x: number;
  y: number;
  name: string;
  onlineCount: number;
  totalCount: number;
  sectorDevices: Record<string, DeviceState>;
  onHover: (e: React.PointerEvent, content: ReactNode) => void;
  onLeave: () => void;
}) {
  const hasOnline = onlineCount > 0;
  const accent = hasOnline ? "#3cc77a" : "rgba(79,110,247,0.5)";

  const tip = (
    <div>
      <div className="tt-title">Sector: {name}</div>
      <div className="tt-row">
        <span className="tt-label">Dispositivos</span>
        {onlineCount}/{totalCount} online
      </div>
      <div className="tt-sep" />
      {Object.entries(sectorDevices).map(([dName, d]) => (
        <div key={dName} className="tt-dev-row">
          <span className={`tt-dot ${d.online ? "tt-dot-on" : "tt-dot-off"}`} />
          <span className="tt-dev-name">{dName}</span>
          <span className="tt-dev-ip">{d.ip}</span>
        </div>
      ))}
    </div>
  );

  return (
    <g
      transform={`translate(${x},${y})`}
      className="topo-node"
      onPointerEnter={(e) => onHover(e, tip)}
      onPointerLeave={onLeave}
    >
      {/* Body */}
      <rect x={-56} y={-22} width={112} height={44} rx={7} fill="#141826" stroke="rgba(79,110,247,0.25)" strokeWidth={1.5} />
      {/* Antenna */}
      <line x1={0} y1={-22} x2={0} y2={-42} stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <circle cx={0} cy={-44} r={3.5} fill={accent} />
      {/* Signal arcs */}
      <path d="M-6,-48 A 8,8 0 0,1 6,-48" fill="none" stroke={accent} strokeWidth={1.2} opacity={0.5} />
      {/* Port dots */}
      {[-32, -16, 0, 16, 32].map((px) => (
        <circle key={px} cx={px} cy={3} r={3.5} fill={accent} opacity={0.4} />
      ))}
      {/* LED */}
      <circle cx={46} cy={-10} r={4} fill={hasOnline ? "#3cc77a" : "#e05050"} opacity={0.75} />
      {/* Labels */}
      <text y={40} textAnchor="middle" fill="#c0c7da" fontSize={16} fontWeight={600}>
        {name}
      </text>
      <text y={58} textAnchor="middle" fontSize={13}>
        <tspan fill={hasOnline ? "#3cc77a" : "#e05050"} fontWeight={600}>{onlineCount}</tspan>
        <tspan fill="#4a5068">/{totalCount} dispositivos</tspan>
      </text>
    </g>
  );
}

function DeviceIcon({
  x,
  y,
  name,
  device,
  onHover,
  onLeave,
}: {
  x: number;
  y: number;
  name: string;
  device: DeviceState;
  onHover: (e: React.PointerEvent, content: ReactNode) => void;
  onLeave: () => void;
}) {
  const online = device.online;
  const fill = online ? "#0f2118" : "#1a1318";
  const stroke = online ? "#3cc77a" : "rgba(224,80,80,0.4)";
  const isAP = name.startsWith("AP");
  const isPTP = name.startsWith("PTP");

  const tip = (
    <div>
      <div className="tt-title">{name} — {online ? "Online" : "Offline"}</div>
      <div className="tt-row"><span className="tt-label">IP</span>{device.ip}</div>
      <div className="tt-row"><span className="tt-label">Ubicacion</span>{device.ubicacion}</div>
      <div className="tt-row"><span className="tt-label">Tipo</span>{isAP ? "Access Point" : isPTP ? "Point-to-Point" : "Dispositivo"}</div>
      {device.uptime && (
        <div className="tt-row"><span className="tt-label">Uptime</span>{device.uptime}</div>
      )}
      {device.error && (
        <div className="tt-row tt-error"><span className="tt-label">Error</span>{device.error}</div>
      )}
      <div className="tt-sep" />
      <div className="tt-time">{fmtTime(device.ultimaActualizacion)}</div>
    </div>
  );

  return (
    <g
      transform={`translate(${x},${y})`}
      className="topo-node"
      onPointerEnter={(e) => onHover(e, tip)}
      onPointerLeave={onLeave}
    >
      {/* Body */}
      <rect x={-30} y={-20} width={60} height={40} rx={7} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {/* Antenna */}
      <line x1={0} y1={-20} x2={0} y2={-36} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <circle cx={0} cy={-38} r={3} fill={stroke} />
      {/* Type badge */}
      <text y={4} textAnchor="middle" fill={isAP ? "#6b8af7" : isPTP ? "#b080f0" : "#7a839e"} fontSize={13} fontWeight={700}>
        {isAP ? "AP" : isPTP ? "PTP" : "DEV"}
      </text>
      {/* Status LED */}
      <circle cx={21} cy={-11} r={3.5} fill={online ? "#3cc77a" : "#e05050"} opacity={online ? 0.9 : 0.5} />
      {/* Name */}
      <text y={34} textAnchor="middle" fill="#c0c7da" fontSize={12} fontWeight={600}>
        {truncate(name, 18)}
      </text>
      {/* IP */}
      <text y={50} textAnchor="middle" fill="#6b8af7" fontSize={11} fontFamily="monospace">
        {device.ip}
      </text>
      {/* Location */}
      <text y={65} textAnchor="middle" fill="#4a5068" fontSize={10}>
        {truncate(device.ubicacion, 20)}
      </text>
      {/* Status text */}
      <text y={79} textAnchor="middle" fill={online ? "#3cc77a" : "#e05050"} fontSize={10} fontWeight={500} opacity={0.8}>
        {online ? "Online" : "Offline"}
      </text>
    </g>
  );
}

/* ═══════════════════════════════════════
   Main component
   ═══════════════════════════════════════ */
export default function TopologyDiagram({ gwId, gateway, sectorDevices }: Props) {
  const { svgW, gwX, sectors } = useLayout(gateway, sectorDevices);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handleHover = useCallback(
    (e: React.PointerEvent, content: ReactNode) => {
      setTooltip({ x: e.clientX, y: e.clientY, content });
    },
    [],
  );

  const handleLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="diagram-wrapper">
      <div className="diagram-scroll">
        <svg
          width={svgW}
          height={SVG_H}
          viewBox={`0 0 ${svgW} ${SVG_H}`}
          className="topology-svg"
          onPointerMove={(e) => {
            if (tooltip) setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null);
          }}
        >
          {/* ── Lines: Gateway → Sectors ── */}
          <TreeLines
            parentX={gwX}
            parentBottomY={GW_Y + 32}
            midY={MID_GW}
            childXs={sectors.map((s) => s.centerX)}
            childTopY={SECTOR_Y - 48}
          />

          {/* ── Lines: Sectors → Devices ── */}
          {sectors.map((s) => (
            <TreeLines
              key={s.name}
              parentX={s.centerX}
              parentBottomY={SECTOR_Y + 26}
              midY={MID_SECTOR}
              childXs={s.devices.map((d) => d.x)}
              childTopY={DEVICE_Y - 42}
            />
          ))}

          {/* ── Gateway ── */}
          <GatewayIcon
            x={gwX}
            y={GW_Y}
            online={gateway.online}
            id={gwId}
            ip={gateway.ip}
            gateway={gateway}
            onHover={handleHover}
            onLeave={handleLeave}
          />

          {/* ── Sectors ── */}
          {sectors.map((s) => (
            <SectorIcon
              key={s.name}
              x={s.centerX}
              y={SECTOR_Y}
              name={s.name}
              onlineCount={s.onlineCount}
              totalCount={s.devices.length}
              sectorDevices={sectorDevices[s.name] ?? {}}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          ))}

          {/* ── Devices ── */}
          {sectors.flatMap((s) =>
            s.devices.map((d) => (
              <DeviceIcon
                key={`${s.name}-${d.name}`}
                x={d.x}
                y={DEVICE_Y}
                name={d.name}
                device={d.dev}
                onHover={handleHover}
                onLeave={handleLeave}
              />
            )),
          )}
        </svg>
      </div>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          className="topo-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */
function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
