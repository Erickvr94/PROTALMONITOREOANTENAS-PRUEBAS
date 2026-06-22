export interface DispositivoCaida {
  ip: string;
  ubicacion: string;
  caidasCount: number;
  totalMuestras: number;
  porcentajeCaida: number;
}

export interface GatewayCaida {
  ip: string;
  nombre?: string;
  sectores?: string[];
  caidasCount: number;
  totalMuestras: number;
  porcentajeCaida: number;
}

export interface CaidasResponse {
  fecha: string;
  totalRegistros: number;
  gateways: Record<string, GatewayCaida>;
  dispositivos: Record<string, Record<string, DispositivoCaida>>;
}

export interface CaidasDia {
  fecha: string;
  totalRegistros: number;
  gateways: Record<string, GatewayCaida>;
  dispositivos: Record<string, Record<string, DispositivoCaida>>;
}

export interface CaidasRangoResponse {
  fechaInicio: string;
  fechaFin: string;
  dias: CaidasDia[];
}
