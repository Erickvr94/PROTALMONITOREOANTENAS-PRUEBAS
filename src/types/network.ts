export interface PingResult {
  exitoso: boolean;
  enviados: number;
  perdidos: number;
  recibidos: number;
  porcentajePerdida: number;
  tiempoPromedio: number | null;
}

export interface GatewayState {
  ip: string;
  sectores: string[];
  online: boolean;
  ultimoPing: PingResult;
  ultimaActualizacion: string;
}

export interface DeviceState {
  ip: string;
  ubicacion: string;
  online: boolean;
  uptime: string | null;
  error: string | null;
  ultimaActualizacion: string;
}

export interface NetworkState {
  gateways: Record<string, GatewayState>;
  dispositivos: Record<string, Record<string, DeviceState>>;
  timestamp: string | null;
}

/* ── WS message types ── */

export interface EstadoCompletoMsg {
  tipo: "estado_completo";
  timestamp: string;
  gateways: Record<string, GatewayState>;
  dispositivos: Record<string, Record<string, DeviceState>>;
}

export interface GatewayUpdateMsg {
  tipo: "gateway_update";
  id: string;
  ip: string;
  sectores: string[];
  online: boolean;
  ultimoPing: PingResult;
  ultimaActualizacion: string;
}

export type WsMessage = EstadoCompletoMsg | GatewayUpdateMsg;

/* ── State reducer ── */

export const EMPTY_STATE: NetworkState = {
  gateways: {},
  dispositivos: {},
  timestamp: null,
};

/**
 * If a gateway is offline, force all devices in its sectors to offline too.
 * This overrides potentially contradictory SNMP data from the backend.
 */
function enforceGatewayOffline(next: NetworkState): NetworkState {
  let patched = false;
  const dispositivos = { ...next.dispositivos };

  for (const gw of Object.values(next.gateways)) {
    if (gw.online) continue;

    for (const sector of gw.sectores) {
      const devices = dispositivos[sector];
      if (!devices) continue;

      for (const [name, dev] of Object.entries(devices)) {
        if (dev.online) {
          if (!patched) {
            patched = true;
          }
          dispositivos[sector] = {
            ...dispositivos[sector],
            [name]: { ...dev, online: false },
          };
        }
      }
    }
  }

  return patched ? { ...next, dispositivos } : next;
}

export function reduceNetwork(
  state: NetworkState,
  msg: WsMessage,
): NetworkState {
  let next: NetworkState;

  if (msg.tipo === "estado_completo") {
    next = {
      gateways: msg.gateways,
      dispositivos: msg.dispositivos,
      timestamp: msg.timestamp,
    };
  } else if (msg.tipo === "gateway_update") {
    next = {
      ...state,
      gateways: {
        ...state.gateways,
        [msg.id]: {
          ip: msg.ip,
          sectores: msg.sectores,
          online: msg.online,
          ultimoPing: msg.ultimoPing,
          ultimaActualizacion: msg.ultimaActualizacion,
        },
      },
    };
  } else {
    return state;
  }

  return enforceGatewayOffline(next);
}
