/* ─────────────────────────────────────────────────────────────────────────
   Capa de datos del modo mantenimiento.

   PROVEEDOR LOCAL   → localStorage. Simula órdenes creadas desde el móvil y
                       permite probar todo el flujo sin backend.
   PROVEEDOR SUPABASE→ esqueleto listo más abajo. Al conectarlo NO cambia ni
                       MapaPage ni el hook: solo la constante mantProvider.

     VITE_MANT_PROVIDER=local | supabase     (por defecto: local)
   ───────────────────────────────────────────────────────────────────────── */

import type {
  CambioEstado,
  CronogramaItem,
  Ejecucion,
  MantenimientoProvider,
  OrdenTrabajo,
  SemillaEquipo,
} from "../types/tiposMantenimiento";

/* Parámetros de la siembra local */
const EQUIPOS_POR_DIA = 25;
const GRUPOS_SIMULADOS = ["A", "B", "C"];

const kPlan = (f: string) => `mant:plan:${f}`;
const kOrdenes = (f: string) => `mant:ordenes:${f}`;
const kEjec = (f: string) => `mant:ejecuciones:${f}`;
const kCola = (f: string) => `mant:cola:${f}`;

export const hoyISO = (): string => new Date().toISOString().slice(0, 10);

export function ahoraEC(): string {
  return new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
}

function leerLS<T>(clave: string, porDefecto: T): T {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribirLS(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* cuota llena: se pierde la persistencia, no el estado en memoria */
  }
}

/** Días hábiles L-V desde hoy, saltando feriados. */
function diasHabiles(cantidad: number, feriados = new Set<string>()): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (out.length < cantidad) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !feriados.has(iso)) out.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ── Proveedor LOCAL ───────────────────────────────────────────────────── */

/** Plan de prueba a partir de los equipos que ya trae el mapa. */
function sembrarPlan(semilla: SemillaEquipo[]): CronogramaItem[] {
  const equipos = semilla
    .filter((e) => e.lat != null && e.lon != null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));

  const porGrupo = Math.ceil(equipos.length / 2);
  const fechas = diasHabiles(Math.max(1, Math.ceil(porGrupo / EQUIPOS_POR_DIA)));

  return equipos.map((e, idx) => {
    const grupoPlan = idx < porGrupo ? "A" : "B";
    const i = idx < porGrupo ? idx : idx - porGrupo;
    const diaPlan = Math.floor(i / EQUIPOS_POR_DIA) + 1;
    return {
      id: e.id,
      nombre: e.nombre,
      tag: e.nombre.match(/TA[_\s-]?0*\d+/i)?.[0]?.toUpperCase() ?? null,
      grupoPlan,
      diaPlan,
      fechaPlan: fechas[diaPlan - 1] ?? fechas[fechas.length - 1],
      orden: (i % EQUIPOS_POR_DIA) + 1,
      ubicacion: e.ubicacion,
      lat: e.lat,
      lon: e.lon,
      mantenimiento: "Preventivo",
    };
  });
}

/** Órdenes de prueba: una por grupo para hoy, como las emitiría el móvil. */
function sembrarOrdenes(): OrdenTrabajo[] {
  const hoy = hoyISO();
  return GRUPOS_SIMULADOS.map((g, i) => ({
    id: `ot-local-${g}-${hoy}`,
    numero: `OT-${hoy.replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`,
    grupo: g,
    fecha: hoy,
    estado: "Abierta" as const,
    responsable: null,
    observaciones: "Orden simulada para pruebas locales",
    origen: "movil" as const,
    creadaEn: ahoraEC(),
  }));
}

/** Aviso entre pestañas: simula el realtime de Supabase en pruebas locales. */
const CANAL = "mant-cambios";

export const localProvider: MantenimientoProvider = {
  nombre: "local",

  async cargar(finca, semilla) {
    let plan = leerLS<CronogramaItem[]>(kPlan(finca), []);
    if (!plan.length && semilla.length) {
      plan = sembrarPlan(semilla);
      escribirLS(kPlan(finca), plan);
    }
    let ordenes = leerLS<OrdenTrabajo[]>(kOrdenes(finca), []);
    if (!ordenes.length) {
      ordenes = sembrarOrdenes();
      escribirLS(kOrdenes(finca), ordenes);
    }
    return {
      finca,
      plan,
      ordenes,
      ejecuciones: leerLS<Ejecucion[]>(kEjec(finca), []),
      cargadoEn: ahoraEC(),
    };
  },

  async marcar(finca, cambio) {
    const ejecs = leerLS<Ejecucion[]>(kEjec(finca), []);
    const id = `${cambio.ordenId}:${cambio.equipoId}`;
    const previa = ejecs.find((e) => e.id === id);
    const ejec: Ejecucion = {
      id,
      ordenId: cambio.ordenId,
      equipoId: cambio.equipoId,
      estado: cambio.estado,
      // La fecha de trabajo se fija en el primer avance y ya no se mueve.
      fechaTrabajo: previa?.fechaTrabajo ?? cambio.marcadoEn.slice(0, 10),
      observaciones: cambio.observaciones ?? previa?.observaciones ?? "",
      ejecutadoPor: previa?.ejecutadoPor ?? null,
      actualizadoEn: ahoraEC(),
    };
    escribirLS(kEjec(finca), [...ejecs.filter((e) => e.id !== id), ejec]);
    try {
      new BroadcastChannel(CANAL).postMessage(finca);
    } catch {
      /* navegador sin BroadcastChannel */
    }
    return ejec;
  },

  suscribir(finca, alCambiar) {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(CANAL);
      ch.onmessage = (ev) => {
        if (ev.data === finca) alCambiar();
      };
    } catch {
      /* ignorar */
    }
    // Otra pestaña escribiendo en localStorage también dispara refresco.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === kEjec(finca) || ev.key === kOrdenes(finca)) alCambiar();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      ch?.close();
      window.removeEventListener("storage", onStorage);
    };
  },
};

/* ── Proveedor SUPABASE ───────────────────────────────────────────────────

   Esquema (SQL editor de Supabase):

   create table cronograma_mant (
     id text not null, finca text not null, nombre text not null, tag text,
     grupo_plan text, dia_plan int, fecha_plan date, orden int,
     ubicacion text, lat double precision, lon double precision,
     mantenimiento text,
     primary key (finca, id)
   );

   create table ordenes_mant (
     id uuid primary key default gen_random_uuid(),
     finca text not null, numero text not null, grupo text not null,
     fecha date not null, estado text not null default 'Abierta',
     responsable text, observaciones text default '',
     origen text default 'movil', creada_en timestamptz default now()
   );
   create index on ordenes_mant (finca, fecha);

   create table ejecuciones_mant (
     id text primary key,                      -- orden_id:equipo_id
     orden_id uuid not null references ordenes_mant(id) on delete cascade,
     finca text not null, equipo_id text not null,
     estado text not null default 'Pendiente',
     fecha_trabajo date not null,              -- día realmente trabajado
     observaciones text default '', ejecutado_por text,
     actualizado_en timestamptz default now()
   );
   create index on ejecuciones_mant (finca, fecha_trabajo);

   alter publication supabase_realtime add table ordenes_mant, ejecuciones_mant;

   Implementación (tras `npm i @supabase/supabase-js`):

   import { createClient } from "@supabase/supabase-js";
   const sb = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY,
   );

   export const supabaseProvider: MantenimientoProvider = {
     nombre: "supabase",
     async cargar(finca) {
       const [p, o, e] = await Promise.all([
         sb.from("cronograma_mant").select("*").eq("finca", finca),
         sb.from("ordenes_mant").select("*").eq("finca", finca).order("fecha", { ascending: false }),
         sb.from("ejecuciones_mant").select("*").eq("finca", finca),
       ]);
       if (p.error || o.error || e.error) throw (p.error ?? o.error ?? e.error);
       return {
         finca,
         plan: (p.data ?? []).map(filaAPlan),
         ordenes: (o.data ?? []).map(filaAOrden),
         ejecuciones: (e.data ?? []).map(filaAEjecucion),
         cargadoEn: ahoraEC(),
       };
     },
     async marcar(finca, cambio) {
       const { data, error } = await sb.from("ejecuciones_mant").upsert({
         id: `${cambio.ordenId}:${cambio.equipoId}`,
         orden_id: cambio.ordenId, finca, equipo_id: cambio.equipoId,
         estado: cambio.estado,
         fecha_trabajo: cambio.marcadoEn.slice(0, 10),
         observaciones: cambio.observaciones ?? "",
         actualizado_en: new Date().toISOString(),
       }, { onConflict: "id", ignoreDuplicates: false }).select().single();
       if (error) throw error;
       return filaAEjecucion(data);
     },
     suscribir(finca, alCambiar) {
       const canal = sb.channel(`mant:${finca}`)
         .on("postgres_changes",
             { event: "*", schema: "public", table: "ejecuciones_mant", filter: `finca=eq.${finca}` },
             alCambiar)
         .on("postgres_changes",
             { event: "*", schema: "public", table: "ordenes_mant", filter: `finca=eq.${finca}` },
             alCambiar)
         .subscribe();
       return () => { sb.removeChannel(canal); };
     },
   };

   OJO con `marcar`: el upsert respeta fecha_trabajo del primer avance solo si
   añades `on conflict do update set fecha_trabajo = ejecuciones_mant.fecha_trabajo`
   mediante una función RPC, o si lees la fila previa antes del upsert. Con el
   upsert plano de arriba, la fecha se reescribe en cada edición.
   ───────────────────────────────────────────────────────────────────────── */

const PROVIDER_ID = import.meta.env.VITE_MANT_PROVIDER ?? "local";

export function colaLeer(finca: string): CambioEstado[] {
  return leerLS<CambioEstado[]>(kCola(finca), []);
}

export function colaEscribir(finca: string, cola: CambioEstado[]): void {
  escribirLS(kCola(finca), cola);
}

export function colaAgregar(finca: string, cambio: CambioEstado): number {
  const cola = colaLeer(finca).filter(
    (c) => !(c.equipoId === cambio.equipoId && c.ordenId === cambio.ordenId),
  );
  cola.push(cambio);
  colaEscribir(finca, cola);
  return cola.length;
}

/** Borra los datos de prueba de esta finca en este navegador. */
export function reiniciarLocal(finca: string): void {
  for (const k of [kPlan(finca), kOrdenes(finca), kEjec(finca), kCola(finca)]) {
    localStorage.removeItem(k);
  }
}

import { supabaseProvider } from "./mantenimientoprovidersupabase";
export const mantProvider: MantenimientoProvider = supabaseProvider;