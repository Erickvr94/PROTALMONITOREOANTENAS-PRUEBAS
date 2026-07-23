/* ─────────────────────────────────────────────────────────────────────────
   Lectura del modo mantenimiento contra el Supabase real.

   Resuelve dos cosas que el esquema no da servidas:

   1) LA LETRA DEL GRUPO. `avances` no guarda el grupo. Se deduce:
        avances.usuario_id -> grupo_miembros.usuario_id
                           -> grupos_trabajo (mismo orden_id) -> .letra

   2) LA UBICACIÓN DEL MAPA. Una ubicación del mapa puede corresponder a
      varias filas de `tableros` (un PLC y una antena con el mismo nombre).
      Se agrupan por una CLAVE DE UBICACIÓN normalizada y el estado del
      marcador es la consolidación de los avances de todos sus tableros.

   Este archivo solo LEE. La escritura de avances viene en el siguiente paso.
   ───────────────────────────────────────────────────────────────────────── */

import { supabase } from "../conexionbasedatos";

/* ── Filas crudas ─────────────────────────────────────────────────────── */

export interface TableroDB {
  id: string;
  finca_id: string | null;
  nombre: string;
  ubicacion: string | null;
  descripcion: string | null;
  tipo: string | null;
  direccion_ip: string | null;
  direccion_mac: string | null;
}

export interface OrdenDB {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string | null;
  finca_id: string | null;
  coordinador_id: string | null;
  created_at: string;
  finalizada_at: string | null;
}

export interface AvanceDB {
  id: string;
  orden_id: string;
  tablero_id: string;
  usuario_id: string | null;
  area: string | null;
  observaciones: string | null;
  estado: string | null;
  mantenimiento: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ── Normalizadores de enums ──────────────────────────────────────────────
   Los enums de Postgres (avance_estado, area_trabajo, avance_mantenimiento)
   pueden venir como 'pendiente', 'EN_PROCESO', 'En Proceso'… Se normaliza
   por prefijo para no depender de la ortografía exacta.                    */

export type EstadoMant = "Pendiente" | "En Proceso" | "Terminado";

export const COLOR_ESTADO: Record<EstadoMant, string> = {
  Pendiente: "#9aa4b2", // gris
  "En Proceso": "#f5a524", // ámbar
  Terminado: "#17c964", // verde
};

export function normalizarEstado(v: string | null | undefined): EstadoMant {
  const s = (v ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (/^(termin|finaliz|complet|cerrad)/.test(s)) return "Terminado";
  if (/^(en_proceso|proceso|ejecu|iniciad|curso)/.test(s)) return "En Proceso";
  return "Pendiente";
}

/** 'raspberry_pi' -> 'Raspberry Pi'. Solo cosmético. */
export function etiqueta(v: string | null | undefined): string {
  if (!v) return "—";
  const s = v.replace(/_/g, " ").trim();
  if (/^(plc|hmi|ip|ap|rb)$/i.test(s)) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Clave de ubicación ───────────────────────────────────────────────────
   PUNTO DE AJUSTE. Si tus nombres no calzan, este es el único lugar que se
   toca. Regla actual:
     · se limpia a MAYÚSCULAS y guiones bajos      ("VAN_PS06-5" → "VAN_PS06_5")
     · clave principal = ubicacion si existe, si no el nombre
     · clave secundaria = raíz, quitando el sufijo "_<dígitos>" final
       ("VAN_PS06_5" → "VAN_PS06"), solo si la raíz tiene 3+ caracteres.
   La raíz nunca pisa una clave principal ya existente.                     */

export function limpiar(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function raizDe(clave: string): string | null {
  const r = clave.replace(/_\d{1,3}$/, "");
  return r.length >= 3 && r !== clave ? r : null;
}

/* ── Modelo consolidado que consume el mapa ───────────────────────────── */

export interface AvanceVista {
  id: string;
  ordenId: string;
  ordenNumero: number;
  /** Área intervenida: PLC, HMI, Raspberry… */
  area: string;
  estado: EstadoMant;
  /** Preventivo / Correctivo. */
  mantenimiento: string;
  observaciones: string;
  /** Fecha y hora de la intervención (updated_at, o created_at si no hay). */
  fecha: string;
  /** Letra del grupo que trabajó. "—" si el técnico no está en ningún grupo. */
  grupo: string;
  tecnico: string;
  tableroId: string;
  tableroNombre: string;
  tableroTipo: string;
}

export interface UbicacionMant {
  clave: string;
  /** Nombre a mostrar: el `ubicacion` del tablero, o el nombre más corto. */
  nombre: string;
  tableros: TableroDB[];
  avances: AvanceVista[];
  /** Consolidado de todos los avances de la ubicación. */
  estado: EstadoMant;
  /** Grupos que intervinieron, ej. ["A"] o ["A","B"]. */
  grupos: string[];
  /** Fecha del avance más reciente. null si nadie la tocó. */
  ultimaFecha: string | null;
}

export interface DatosMantenimiento {
  fincaId: string;
  ordenes: OrdenDB[];
  ubicaciones: Map<string, UbicacionMant>;
  /** Clave de ubicación por cada alias reconocido (nombre, ubicación, raíz). */
  indice: Map<string, string>;
  /** Para verificar que los joins funcionaron. */
  diagnostico: {
    tableros: number;
    avances: number;
    avancesSinGrupo: number;
    estadosCrudos: string[];
    areasCrudas: string[];
    mantenimientosCrudos: string[];
  };
  cargadoEn: string;
}

/** Estado del marcador: verde solo si TODO lo intervenido está terminado. */
function consolidar(avances: AvanceVista[]): EstadoMant {
  if (!avances.length) return "Pendiente";
  if (avances.every((a) => a.estado === "Terminado")) return "Terminado";
  if (avances.some((a) => a.estado !== "Pendiente")) return "En Proceso";
  return "Pendiente";
}

/* ── Carga ────────────────────────────────────────────────────────────── */

export async function cargarMantenimientoFinca(
  fincaId: string,
  opciones: { ordenId?: string } = {},
): Promise<DatosMantenimiento> {
  /* 1. Tableros y órdenes de la finca. */
  const [rTableros, rOrdenes] = await Promise.all([
    supabase.from("tableros").select("*").eq("finca_id", fincaId).limit(5000),
    supabase
      .from("ordenes_trabajo")
      .select("*")
      .eq("finca_id", fincaId)
      .order("numero", { ascending: false }),
  ]);
  if (rTableros.error) throw rTableros.error;
  if (rOrdenes.error) throw rOrdenes.error;

  const tableros = (rTableros.data ?? []) as TableroDB[];
  const ordenes = (rOrdenes.data ?? []) as OrdenDB[];
  const ordenesFiltradas = opciones.ordenId
    ? ordenes.filter((o) => o.id === opciones.ordenId)
    : ordenes;
  const ordenIds = ordenesFiltradas.map((o) => o.id);

  /* 2. Avances y grupos de esas órdenes. */
  const [rAvances, rGrupos] = await Promise.all([
    ordenIds.length
      ? supabase.from("avances").select("*").in("orden_id", ordenIds).limit(10000)
      : Promise.resolve({ data: [], error: null }),
    ordenIds.length
      ? supabase.from("grupos_trabajo").select("id, letra, orden_id").in("orden_id", ordenIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rAvances.error) throw rAvances.error;
  if (rGrupos.error) throw rGrupos.error;

  const avances = (rAvances.data ?? []) as AvanceDB[];
  const grupos = (rGrupos.data ?? []) as { id: string; letra: string; orden_id: string }[];

  /* 3. Miembros de esos grupos + nombres de los técnicos. */
  const grupoIds = grupos.map((g) => g.id);
  const usuarioIds = [...new Set(avances.map((a) => a.usuario_id).filter(Boolean))] as string[];

  const [rMiembros, rPerfiles] = await Promise.all([
    grupoIds.length
      ? supabase.from("grupo_miembros").select("grupo_id, usuario_id").in("grupo_id", grupoIds)
      : Promise.resolve({ data: [], error: null }),
    usuarioIds.length
      ? supabase.from("profiles").select("id, nombres, apellidos").in("id", usuarioIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rMiembros.error) throw rMiembros.error;
  if (rPerfiles.error) throw rPerfiles.error;

  const miembros = (rMiembros.data ?? []) as { grupo_id: string; usuario_id: string }[];
  const perfiles = (rPerfiles.data ?? []) as {
    id: string;
    nombres: string | null;
    apellidos: string | null;
  }[];

  /* 4. Índices auxiliares. */
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  // clave `${ordenId}:${usuarioId}` -> letra
  const letraPorUsuarioOrden = new Map<string, string>();
  for (const m of miembros) {
    const g = grupoPorId.get(m.grupo_id);
    if (g) letraPorUsuarioOrden.set(`${g.orden_id}:${m.usuario_id}`, g.letra);
  }
  const nombrePorUsuario = new Map(
    perfiles.map((p) => [p.id, `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || "—"]),
  );
  const numeroPorOrden = new Map(ordenes.map((o) => [o.id, o.numero]));

  /* 5. Agrupar tableros por clave de ubicación y armar el índice de alias. */
  const ubicaciones = new Map<string, UbicacionMant>();
  const indice = new Map<string, string>();
  const clavePorTablero = new Map<string, string>();
  const raicesPendientes: [string, string][] = [];

  for (const t of tableros) {
    const base = t.ubicacion?.trim() || t.nombre;
    const clave = limpiar(base);
    if (!clave) continue;
    clavePorTablero.set(t.id, clave);

    let u = ubicaciones.get(clave);
    if (!u) {
      u = {
        clave,
        nombre: base.trim(),
        tableros: [],
        avances: [],
        estado: "Pendiente",
        grupos: [],
        ultimaFecha: null,
      };
      ubicaciones.set(clave, u);
    }
    u.tableros.push(t);

    // Alias directos: la clave misma y el nombre del tablero.
    indice.set(clave, clave);
    const kNombre = limpiar(t.nombre);
    if (kNombre) indice.set(kNombre, clave);
    // La raíz se registra al final, para no pisar claves reales.
    for (const k of [clave, kNombre]) {
      const r = k ? raizDe(k) : null;
      if (r) raicesPendientes.push([r, clave]);
    }
  }
  for (const [raiz, clave] of raicesPendientes) {
    if (!indice.has(raiz)) indice.set(raiz, clave);
  }

  /* 6. Repartir los avances en sus ubicaciones. */
  const estadosCrudos = new Set<string>();
  const areasCrudas = new Set<string>();
  const mantenimientosCrudos = new Set<string>();
  let avancesSinGrupo = 0;

  for (const a of avances) {
    if (a.estado) estadosCrudos.add(a.estado);
    if (a.area) areasCrudas.add(a.area);
    if (a.mantenimiento) mantenimientosCrudos.add(a.mantenimiento);

    const clave = clavePorTablero.get(a.tablero_id);
    if (!clave) continue; // avance de un tablero de otra finca
    const u = ubicaciones.get(clave);
    if (!u) continue;

    const tablero = u.tableros.find((t) => t.id === a.tablero_id);
    const grupo = a.usuario_id
      ? (letraPorUsuarioOrden.get(`${a.orden_id}:${a.usuario_id}`) ?? "—")
      : "—";
    if (grupo === "—") avancesSinGrupo++;

    u.avances.push({
      id: a.id,
      ordenId: a.orden_id,
      ordenNumero: numeroPorOrden.get(a.orden_id) ?? 0,
      area: etiqueta(a.area),
      estado: normalizarEstado(a.estado),
      mantenimiento: etiqueta(a.mantenimiento),
      observaciones: a.observaciones ?? "",
      fecha: a.updated_at ?? a.created_at,
      grupo,
      tecnico: a.usuario_id ? (nombrePorUsuario.get(a.usuario_id) ?? "—") : "—",
      tableroId: a.tablero_id,
      tableroNombre: tablero?.nombre ?? "—",
      tableroTipo: etiqueta(tablero?.tipo),
    });
  }

  /* 7. Consolidar cada ubicación. */
  for (const u of ubicaciones.values()) {
    u.avances.sort((x, y) => y.fecha.localeCompare(x.fecha));
    u.estado = consolidar(u.avances);
    u.grupos = [...new Set(u.avances.map((a) => a.grupo).filter((g) => g !== "—"))].sort();
    u.ultimaFecha = u.avances[0]?.fecha ?? null;
  }

  return {
    fincaId,
    ordenes,
    ubicaciones,
    indice,
    diagnostico: {
      tableros: tableros.length,
      avances: avances.length,
      avancesSinGrupo,
      estadosCrudos: [...estadosCrudos],
      areasCrudas: [...areasCrudas],
      mantenimientosCrudos: [...mantenimientosCrudos],
    },
    cargadoEn: new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" }),
  };
}

/* ── Resolución desde el mapa ─────────────────────────────────────────────
   El marcador del mapa conoce su `nombre` y su `ubicacion` (del SNMP).
   Ej.: nombre "VAN_PS06-5", ubicacion "VAN_PS06".                          */

export function resolverUbicacion(
  datos: DatosMantenimiento,
  nombre: string,
  ubicacion?: string | null,
): UbicacionMant | null {
  const candidatos = [ubicacion ? limpiar(ubicacion) : null, limpiar(nombre)].filter(
    Boolean,
  ) as string[];
  for (const c of candidatos) {
    const clave = datos.indice.get(c);
    if (clave) return datos.ubicaciones.get(clave) ?? null;
  }
  // Último recurso: la raíz del nombre del marcador.
  for (const c of candidatos) {
    const r = raizDe(c);
    const clave = r ? datos.indice.get(r) : null;
    if (clave) return datos.ubicaciones.get(clave) ?? null;
  }
  return null;
}

/** Formato corto para el popup: "22/07/2026, 17:25". */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "short",
    timeStyle: "short",
  });
}