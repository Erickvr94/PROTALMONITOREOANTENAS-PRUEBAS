/* ─────────────────────────────────────────────────────────────────────────
   Lectura de un cronograma en Excel/CSV para la vista PLAN.

   Deliberadamente tolerante: los encabezados cambian de una empresa a otra
   ("Tablero" vs "Equipo", "IP Antena" vs "IP", "Piscina" vs "Ubicacion"),
   asi que se normalizan y se buscan por diccionario de alias en lugar de
   exigir un formato exacto.

   Esta capa NO escribe nada. El plan es una propuesta previa al ingreso; la
   ejecucion real vive en Supabase y la maneja el modo mantenimiento.
   ───────────────────────────────────────────────────────────────────────── */

import * as XLSX from "xlsx";

export interface ParadaPlan {
  /** Clave estable: IP si existe, si no nombre + hoja. */
  id: string;
  nombre: string;
  ubicacion: string | null;
  ip: string | null;
  tipo: string | null;
  grupo: string;
  dia: number;
  fecha: string | null;
  orden: number;
  lat: number;
  lon: number;
  mantenimiento: string | null;
  /** Hoja de origen: sirve como "Fase". */
  hoja: string;
}

export interface PlanCargado {
  archivo: string;
  paradas: ParadaPlan[];
  grupos: string[];
  dias: { dia: number; fecha: string | null; paradas: number }[];
  /** Avisos legibles: filas descartadas, hojas ignoradas, columnas faltantes. */
  avisos: string[];
}

/* ── Reconocimiento de columnas ─────────────────────────────────────────── */

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ALIAS: Record<string, string[]> = {
  nombre: ["tablero", "equipo", "nombre", "descripcion", "activo", "punto"],
  ubicacion: ["piscina", "ubicacion", "area", "sector", "zona", "lugar"],
  ip: ["ipantena", "ip", "direccionip", "ipequipo"],
  tipo: ["tipo", "ap", "modelo", "tipoequipo"],
  grupo: ["grupo", "cuadrilla", "brigada", "equipotrabajo"],
  dia: ["dia", "jornada", "nrodia", "numerodia"],
  fecha: ["fecha", "fechaplan", "fechaplanificada", "fechaprogramada"],
  orden: ["orden", "secuencia", "sec", "n", "num", "numero", "item"],
  lat: ["lat", "latitud", "latitude", "y"],
  lon: ["lon", "lng", "long", "longitud", "longitude", "x"],
  mantenimiento: ["mantenimiento", "tipomantenimiento", "clase"],
};

/** Mapea indice de columna → campo logico. */
function mapearColumnas(cabecera: unknown[]): Record<string, number> {
  const m: Record<string, number> = {};
  cabecera.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (m[campo] !== undefined) continue;
      if (alias.includes(n)) m[campo] = i;
    }
  });
  return m;
}

/* ── Conversion de valores ──────────────────────────────────────────────── */

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Acepta coma decimal ("-2,506212") y espacios.
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function aFechaISO(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Serial de Excel (base 1899-12-30).
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

/* ── Parseo principal ───────────────────────────────────────────────────── */

export async function leerCronograma(archivo: File): Promise<PlanCargado> {
  const buf = await archivo.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });

  const paradas: ParadaPlan[] = [];
  const avisos: string[] = [];
  let descartadasSinCoord = 0;
  let descartadasSinNombre = 0;

  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
      header: 1,
      blankrows: false,
    });
    if (filas.length < 2) continue;

    // La cabecera no siempre esta en la fila 1 (hay hojas con titulo arriba):
    // se toma la primera fila que reconozca al menos nombre + una coordenada.
    let idxCab = -1;
    let cols: Record<string, number> = {};
    for (let i = 0; i < Math.min(filas.length, 12); i++) {
      const c = mapearColumnas(filas[i]);
      if (c.nombre !== undefined && c.lat !== undefined && c.lon !== undefined) {
        idxCab = i;
        cols = c;
        break;
      }
    }
    if (idxCab === -1) {
      avisos.push(`Hoja "${hoja}": ignorada, no se encontraron columnas de nombre y coordenadas.`);
      continue;
    }

    const faltantes = ["grupo", "dia", "orden"].filter((k) => cols[k] === undefined);
    if (faltantes.length) {
      avisos.push(`Hoja "${hoja}": sin columna ${faltantes.join(", ")}. Se rellena por defecto.`);
    }

    const val = (f: unknown[], campo: string): unknown =>
      cols[campo] === undefined ? null : f[cols[campo]];

    let consecutivo = 0;
    for (const f of filas.slice(idxCab + 1)) {
      if (!f || f.every((c) => c === null || c === undefined || c === "")) continue;

      const nombre = String(val(f, "nombre") ?? "").trim();
      if (!nombre) {
        descartadasSinNombre++;
        continue;
      }
      const lat = aNumero(val(f, "lat"));
      const lon = aNumero(val(f, "lon"));
      if (lat === null || lon === null) {
        descartadasSinCoord++;
        continue;
      }

      consecutivo++;
      const ip = String(val(f, "ip") ?? "").trim() || null;
      const ubicacion = String(val(f, "ubicacion") ?? "").trim() || null;

      paradas.push({
        id: ip ?? `${hoja}:${nombre}:${consecutivo}`,
        nombre,
        ubicacion,
        ip,
        tipo: String(val(f, "tipo") ?? "").trim() || null,
        grupo: String(val(f, "grupo") ?? "Sin grupo").trim() || "Sin grupo",
        dia: aNumero(val(f, "dia")) ?? 0,
        fecha: aFechaISO(val(f, "fecha")),
        orden: aNumero(val(f, "orden")) ?? consecutivo,
        lat,
        lon,
        mantenimiento: String(val(f, "mantenimiento") ?? "").trim() || null,
        hoja,
      });
    }
  }

  if (descartadasSinCoord) {
    avisos.push(`${descartadasSinCoord} fila(s) descartada(s) por no tener latitud/longitud validas.`);
  }
  if (descartadasSinNombre) {
    avisos.push(`${descartadasSinNombre} fila(s) descartada(s) por no tener nombre de equipo.`);
  }

  // Si el archivo trae fecha pero no numero de dia, se deduce ordenando fechas.
  const sinDia = paradas.filter((p) => !p.dia);
  if (sinDia.length && sinDia.some((p) => p.fecha)) {
    const fechas = [...new Set(sinDia.map((p) => p.fecha).filter(Boolean))].sort() as string[];
    for (const p of sinDia) {
      if (p.fecha) p.dia = fechas.indexOf(p.fecha) + 1;
    }
    avisos.push("Numero de dia deducido a partir de las fechas del archivo.");
  }

  const grupos = [...new Set(paradas.map((p) => p.grupo))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );

  const mapaDias = new Map<number, { dia: number; fecha: string | null; paradas: number }>();
  for (const p of paradas) {
    const e = mapaDias.get(p.dia);
    if (e) e.paradas++;
    else mapaDias.set(p.dia, { dia: p.dia, fecha: p.fecha, paradas: 1 });
  }

  return {
    archivo: archivo.name,
    paradas,
    grupos,
    dias: [...mapaDias.values()].sort((a, b) => a.dia - b.dia),
    avisos,
  };
}

/* ── Utilidades de ruta ─────────────────────────────────────────────────── */

/** Distancia en km entre dos puntos (haversine). */
export function distanciaKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Recorrido total de una secuencia de paradas, en km. */
export function largoRuta(paradas: ParadaPlan[]): number {
  let t = 0;
  for (let i = 1; i < paradas.length; i++) {
    t += distanciaKm([paradas[i - 1].lat, paradas[i - 1].lon], [paradas[i].lat, paradas[i].lon]);
  }
  return t;
}