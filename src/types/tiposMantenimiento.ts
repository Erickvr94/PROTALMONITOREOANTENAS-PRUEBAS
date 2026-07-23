/* ─────────────────────────────────────────────────────────────────────────
   Modelo de datos del modo mantenimiento.

   Tres entidades separadas a propósito:

     CronogramaItem  → el PLAN. Qué equipo toca, en qué día planificado.
     OrdenTrabajo    → la ORDEN emitida desde la app móvil. Asigna un grupo
                       a una jornada. Puede haber N grupos, no un set fijo.
     Ejecucion       → lo que REALMENTE se hizo. Cuelga de una orden y es la
                       única fuente de la fecha de trabajo y del grupo real.

   El mapa filtra por Ejecucion.fechaTrabajo (día trabajado), nunca por
   CronogramaItem.fecha (día planificado), porque la planificación se corre.
   ───────────────────────────────────────────────────────────────────────── */

export type EstadoMant = "Pendiente" | "En Proceso" | "Terminado";
export type TipoMant = "Preventivo" | "Correctivo" | null;
export type EstadoOrden = "Abierta" | "En Proceso" | "Cerrada";

/** Fila del plan maestro (Excel → tabla cronograma_mant). */
export interface CronogramaItem {
  /** Clave estable del equipo. En Exporcambrit = IP de la antena. */
  id: string;
  nombre: string;
  tag: string | null;
  /** Grupo PLANIFICADO. Referencial: el real lo define la orden. */
  grupoPlan: string;
  diaPlan: number;
  /** Fecha planificada, YYYY-MM-DD. Referencial. */
  fechaPlan: string;
  orden: number;
  ubicacion: string | null;
  lat: number | null;
  lon: number | null;
  mantenimiento: TipoMant;
}

/** Orden de trabajo creada desde la aplicación móvil. */
export interface OrdenTrabajo {
  id: string;
  /** Número visible para el técnico, ej. "OT-2026-0031". */
  numero: string;
  /** Grupo de campo. Texto libre: puede haber cualquier cantidad. */
  grupo: string;
  /** Jornada a la que corresponde la orden, YYYY-MM-DD. */
  fecha: string;
  estado: EstadoOrden;
  responsable: string | null;
  observaciones: string;
  origen: "movil" | "portal";
  creadaEn: string;
}

/** Avance real de un equipo dentro de una orden. */
export interface Ejecucion {
  /** Clave: `${ordenId}:${equipoId}`. */
  id: string;
  ordenId: string;
  equipoId: string;
  estado: EstadoMant;
  /** Día efectivamente trabajado, YYYY-MM-DD. Base del filtro por día. */
  fechaTrabajo: string;
  observaciones: string;
  ejecutadoPor: string | null;
  actualizadoEn: string;
}

/** Todo lo que el proveedor entrega al mapa de una sola vez. */
export interface EstadoMantenimiento {
  finca: string;
  plan: CronogramaItem[];
  ordenes: OrdenTrabajo[];
  ejecuciones: Ejecucion[];
  cargadoEn: string;
}

/** Vista combinada de un equipo: lo que el popup y el icono necesitan. */
export interface EquipoMant {
  plan: CronogramaItem | null;
  ejecucion: Ejecucion | null;
  orden: OrdenTrabajo | null;
  /** Grupo efectivo: el de la orden si se ejecutó, si no el planificado. */
  grupo: string;
  estado: EstadoMant;
  /** Día trabajado si existe; null si aún no se toca. */
  fechaTrabajo: string | null;
}

/** Lo mínimo que el mapa entrega para sembrar datos de prueba locales. */
export interface SemillaEquipo {
  id: string;
  nombre: string;
  tipo: string;
  ubicacion: string | null;
  lat: number | null;
  lon: number | null;
}

/** Payload de un avance marcado desde el mapa. */
export interface CambioEstado {
  equipoId: string;
  ordenId: string;
  estado: EstadoMant;
  observaciones?: string;
  marcadoEn: string;
}

export interface MantenimientoProvider {
  nombre: string;
  /** `semilla` solo la usa el proveedor local. */
  cargar(finca: string, semilla: SemillaEquipo[]): Promise<EstadoMantenimiento>;
  marcar(finca: string, cambio: CambioEstado): Promise<Ejecucion>;
  /** Notifica cambios externos (otra orden desde el móvil). Devuelve el cancelador. */
  suscribir(finca: string, alCambiar: () => void): () => void;
}