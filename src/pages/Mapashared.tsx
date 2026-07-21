/* ── Tipos y helpers compartidos entre MapaPage y exportaciones ── */

export interface EstadoAntena {
  online: boolean | null;
  potencia: number | null;
  fecha: string | null;
  reintentos?: number | null; // opcional: si el backend lo envía, sale en el Excel
}

export interface Antena {
  id: string;
  nombre: string;
  grupo: string;
  tipo: string; // "antena" | "HMI" | "PLC" | "Raspberry" | ...
  ip: string;
  ubicacion: string | null;
  coordenadas: { lat: number | null; lon: number | null };
  estado: EstadoAntena;
  error: string | null;
}

export type Caso = "ok" | "weak" | "nolink" | "down" | "nd" | "equipo";

export const COLORES: Record<Caso, string> = {
  ok: "#16a34a",
  weak: "#eab308",
  nolink: "#f97316",
  down: "#dc2626",
  nd: "#9ca3af",
  equipo: "#16a34a",
};

export function clasificar(a: Antena): Caso {
  if (a.tipo !== "antena") return "equipo";
  const e = a.estado;
  if (e.online === null) return "nd";
  if (!e.online) return "down";
  if (e.potencia === null) return "nolink";
  if (e.potencia <= -78) return "weak";
  return "ok";
}

/* Nivel de señal — misma escala que el mapa_live de la Raspberry */
export function nivelSenal(a: Antena): string {
  if (a.tipo !== "antena") return a.estado.online ? "EN LÍNEA" : a.estado.online === false ? "APAGADO" : "SIN DATOS";
  const e = a.estado;
  if (e.online === null) return "SIN DATOS";
  if (!e.online) return "SIN RED";
  const s = e.potencia;
  if (s === null) return "SIN ENLACE";
  if (s === 0) return "ANOMALIA";
  if (s <= -85) return "MUY DÉBIL";
  if (s <= -78) return "DÉBIL";
  if (s <= -75) return "MODERADO";
  return "BUENA";
}

export function fechaEC(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })
    : "—";
}

/* Timestamp para nombres de archivo: YYYYMMDD_HHMMSS */
export function tsFileName(): string {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
    "_" + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())
  );
}

export function descargarBlob(blob: Blob, fname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
