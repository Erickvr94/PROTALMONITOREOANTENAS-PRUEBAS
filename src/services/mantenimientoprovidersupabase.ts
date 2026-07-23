/* ─────────────────────────────────────────────────────────────────────────
   Provider de mantenimiento respaldado por Supabase.

   Implementa MantenimientoProvider, así que MapaPage y useMantenimiento no
   se enteran de dónde salen los datos.

   La idea central: el mapa llama a `sembrar()` con SUS equipos (los que ve
   por SNMP, con id, nombre, ubicación y coordenada). Este provider recorre
   esa semilla y a cada equipo le cuelga lo que encuentre en Supabase. Así el
   mapa manda en qué se dibuja, y Supabase solo aporta el estado.

   Lectura solamente. La escritura de avances viene en el Paso 3: `marcar`
   lanza error a propósito, y el hook encola el cambio sin perderlo.
   ───────────────────────────────────────────────────────────────────────── */

import { supabase } from "../conexionbasedatos";
import {
  cargarMantenimientoFinca,
  limpiar,
  resolverUbicacion,
  type AvanceVista,
  type DatosMantenimiento,
} from "./mantenimientodatabase";
import type {
  CambioEstado,
  CronogramaItem,
  Ejecucion,
  EstadoMantenimiento,
  MantenimientoProvider,
  OrdenTrabajo,
  SemillaEquipo,
  TipoMant,
} from "../types/tiposMantenimiento";

/* ── Resolución de finca ──────────────────────────────────────────────────
   MapaPage arma fincaKey como `${empresaId}:${fincaId}`, ej.
   "GrupoBrito:vanecubri". En Supabase la finca se llama "Vanecubri" y la
   empresa "Grupo Brito". Se comparan normalizados sin espacios ni acentos.  */

function clave(s: string): string {
  return limpiar(s).replace(/_/g, "");
}

const cacheFincas = new Map<string, string | null>();

async function resolverFincaId(fincaKey: string): Promise<string | null> {
  if (cacheFincas.has(fincaKey)) return cacheFincas.get(fincaKey)!;

  const [empresaKey = "", fincaSlug = ""] = fincaKey.split(":");
  const { data, error } = await supabase.from("fincas").select("id, nombre, empresa_id, empresas(nombre)");
  if (error) throw error;

  const objetivoFinca = clave(fincaSlug);
  const objetivoEmpresa = clave(empresaKey);

  const candidatas = (data ?? []).filter((f: any) => clave(f.nombre) === objetivoFinca);
  // Si el nombre de finca se repite entre empresas, desempata la empresa.
  const elegida =
    candidatas.find((f: any) => clave(f.empresas?.nombre ?? "") === objetivoEmpresa) ??
    candidatas[0] ??
    null;

  const id = elegida?.id ?? null;
  cacheFincas.set(fincaKey, id);
  if (!id) {
    console.warn(
      `[mantSupabase] No hay finca en Supabase que coincida con "${fincaSlug}". ` +
        `Nombres disponibles: ${(data ?? []).map((f: any) => f.nombre).join(", ")}`,
    );
  }
  return id;
}

/* ── Traducción al modelo que consume el mapa ─────────────────────────── */

function tipoMantDe(avances: AvanceVista[]): TipoMant {
  const m = avances[0]?.mantenimiento;
  if (m === "Preventivo" || m === "Correctivo") return m;
  return null;
}

function vacio(fincaKey: string): EstadoMantenimiento {
  return {
    finca: fincaKey,
    plan: [],
    ordenes: [],
    ejecuciones: [],
    cargadoEn: new Date().toISOString(),
  };
}

function construir(
  fincaKey: string,
  datos: DatosMantenimiento,
  semilla: SemillaEquipo[],
): EstadoMantenimiento {
  const plan: CronogramaItem[] = [];
  const ejecuciones: Ejecucion[] = [];
  let emparejados = 0;

  semilla.forEach((s, i) => {
    const u = resolverUbicacion(datos, s.nombre, s.ubicacion);
    if (u) emparejados++;

    // El grupo del equipo sale de sus propios avances, no de la orden:
    // una orden puede tener varios grupos trabajando en sitios distintos.
    const grupoEquipo = u?.grupos[0] ?? "";

    plan.push({
      id: s.id,
      nombre: s.nombre,
      tag: u?.nombre ?? null,
      grupoPlan: grupoEquipo,
      diaPlan: 0,
      fechaPlan: "",
      orden: i,
      ubicacion: s.ubicacion,
      lat: s.lat,
      lon: s.lon,
      mantenimiento: tipoMantDe(u?.avances ?? []),
    });

    if (!u || u.avances.length === 0) return; // sin avances: el mapa lo deja neutro

    const ultimo = u.avances[0]; // ya vienen ordenados, el más reciente primero
    ejecuciones.push({
      id: `${ultimo.ordenId}:${s.id}`,
      ordenId: ultimo.ordenId,
      equipoId: s.id,
      estado: u.estado, // consolidado de TODOS los avances de la ubicación
      fechaTrabajo: ultimo.fecha.slice(0, 10),
      observaciones: u.avances
        .map((a) => `${a.area}: ${a.observaciones || "sin observaciones"}`)
        .join(" · "),
      ejecutadoPor: ultimo.tecnico,
      actualizadoEn: ultimo.fecha,
      // Detalle completo para el popup: un renglón por área intervenida.
      avances: u.avances,
    });
  });

  const ordenes: OrdenTrabajo[] = datos.ordenes.map((o) => ({
    id: o.id,
    numero: `OT-${o.numero}`,
    // Vacío a propósito: el grupo es por equipo, no por orden.
    grupo: "",
    fecha: (o.finalizada_at ?? o.created_at).slice(0, 10),
    estado: o.finalizada_at ? "Cerrada" : "Abierta",
    responsable: null,
    observaciones: o.titulo,
    origen: "movil",
    creadaEn: o.created_at,
  }));

  console.info(
    `[mantSupabase] ${semilla.length} equipos del mapa · ${emparejados} emparejados ` +
      `con Supabase · ${ejecuciones.length} con avances · ${datos.ubicaciones.size} ubicaciones en BD`,
  );
  if (emparejados === 0 && semilla.length) {
    console.warn(
      "[mantSupabase] Ningún equipo emparejó. Compara estas claves:",
      "\n  mapa:", semilla.slice(0, 5).map((s) => limpiar(s.ubicacion ?? s.nombre)),
      "\n  Supabase:", [...datos.ubicaciones.keys()].slice(0, 5),
    );
  }

  return {
    finca: fincaKey,
    plan,
    ordenes,
    ejecuciones,
    cargadoEn: new Date().toISOString(),
  };
}

/* ── Provider ─────────────────────────────────────────────────────────── */

export const supabaseProvider: MantenimientoProvider = {
  nombre: "supabase",

  async cargar(fincaKey: string, semilla: SemillaEquipo[]): Promise<EstadoMantenimiento> {
    // Sin semilla el mapa todavía no cargó sus equipos; no hay nada que emparejar.
    if (!semilla.length) return vacio(fincaKey);

    const fincaId = await resolverFincaId(fincaKey);
    if (!fincaId) return vacio(fincaKey);

    const datos = await cargarMantenimientoFinca(fincaId);
    return construir(fincaKey, datos, semilla);
  },

  async marcar(_fincaKey: string, _cambio: CambioEstado): Promise<Ejecucion> {
    // Paso 3. Escribir un avance exige saber QUÉ usuario de Supabase lo hizo,
    // y el portal se autentica contra tu API propia, no contra Supabase.
    throw new Error(
      "Escritura de avances aún no implementada. El cambio quedó en la cola local.",
    );
  },

  suscribir(fincaKey: string, alCambiar: () => void): () => void {
    // Realtime exige habilitar la réplica de `avances` en Supabase. Mientras
    // tanto, un sondeo suave alcanza: la app móvil no registra cada segundo.
    let vivo = true;
    const canal = supabase
      .channel(`avances:${fincaKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "avances" }, () => {
        if (vivo) alCambiar();
      })
      .subscribe();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") alCambiar();
    }, 60_000);

    return () => {
      vivo = false;
      window.clearInterval(timer);
      supabase.removeChannel(canal);
    };
  },
};