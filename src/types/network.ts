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

export function reduceNetwork(
  state: NetworkState,
  msg: WsMessage,
): NetworkState {
  if (msg.tipo === "estado_completo") {
    return {
      gateways: msg.gateways,
      dispositivos: msg.dispositivos,
      timestamp: msg.timestamp,
    };
  }

  if (msg.tipo === "gateway_update") {
    return {
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
  }

  return state;
}
