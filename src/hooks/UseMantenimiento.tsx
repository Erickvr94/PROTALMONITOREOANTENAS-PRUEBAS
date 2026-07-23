import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  colaAgregar,
  colaEscribir,
  colaLeer,
  mantProvider,
  reiniciarLocal,
} from "../services/mantenimiento";
import type {
  CambioEstado,
  CronogramaItem,
  Ejecucion,
  EquipoMant,
  EstadoMant,
  EstadoMantenimiento,
  OrdenTrabajo,
  SemillaEquipo,
} from "../types/tiposMantenimiento";

/** Índice para emparejar un dispositivo del mapa con su fila del plan. */
interface Indice {
  porId: Map<string, CronogramaItem>;
  porNombre: Map<string, CronogramaItem>;
  porTA: Map<number, CronogramaItem>;
}

function construirIndice(plan: CronogramaItem[]): Indice {
  const porId = new Map<string, CronogramaItem>();
  const porNombre = new Map<string, CronogramaItem>();
  const porTA = new Map<number, CronogramaItem>();
  for (const it of plan) {
    porId.set(it.id, it);
    porNombre.set(it.nombre.toUpperCase(), it);
    if (it.tag) porNombre.set(it.tag.toUpperCase(), it);
    const m = (it.tag ?? it.nombre).toUpperCase().match(/TA[_\s-]?0*(\d+)/);
    if (m) porTA.set(Number(m[1]), it);
  }
  return { porId, porNombre, porTA };
}

export interface UseMantenimiento {
  datos: EstadoMantenimiento | null;
  disponible: boolean;
  cargando: boolean;
  error: string | null;
  pendientesEnCola: number;
  /** Grupos existentes, deducidos de las órdenes y del plan. Cantidad libre. */
  grupos: string[];
  /** Días efectivamente trabajados (de las ejecuciones), más recientes primero. */
  diasTrabajados: string[];
  ordenes: OrdenTrabajo[];
  /** Vista combinada de un equipo del mapa. */
  ver(id: string, nombre: string): EquipoMant | null;
  marcar(equipoId: string, ordenId: string, estado: EstadoMant, obs?: string): Promise<void>;
  sembrar(semilla: SemillaEquipo[]): void;
  reiniciar(): void;
}

export function useMantenimiento(fincaKey: string | null): UseMantenimiento {
  const [datos, setDatos] = useState<EstadoMantenimiento | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendientesEnCola, setPendientes] = useState(0);
  const semillaRef = useRef<SemillaEquipo[]>([]);

  const indice = useMemo(() => (datos ? construirIndice(datos.plan) : null), [datos]);

  const porEquipo = useMemo(() => {
    const m = new Map<string, Ejecucion>();
    if (!datos) return m;
    // Si un equipo tiene varias ejecuciones (varias órdenes), gana la más reciente.
    for (const e of datos.ejecuciones) {
      const prev = m.get(e.equipoId);
      if (!prev || e.actualizadoEn > prev.actualizadoEn) m.set(e.equipoId, e);
    }
    return m;
  }, [datos]);

  const ordenesPorId = useMemo(() => {
    const m = new Map<string, OrdenTrabajo>();
    for (const o of datos?.ordenes ?? []) m.set(o.id, o);
    return m;
  }, [datos]);

  const recargar = useCallback(() => {
    if (!fincaKey) return;
    setCargando(true);
    setError(null);
    mantProvider
      .cargar(fincaKey, semillaRef.current)
      .then((d) => {
        setDatos(d);
        setPendientes(colaLeer(fincaKey).length);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [fincaKey]);

  const sembrar = useCallback(
    (semilla: SemillaEquipo[]) => {
      if (!fincaKey || !semilla.length) return;
      semillaRef.current = semilla;
      recargar();
    },
    [fincaKey, recargar],
  );

  /* Cambios externos: otra orden emitida desde el móvil, u otra pestaña. */
  useEffect(() => {
    if (!fincaKey || !datos) return;
    return mantProvider.suscribir(fincaKey, recargar);
  }, [fincaKey, datos, recargar]);

  const ver = useCallback(
    (id: string, nombre: string): EquipoMant | null => {
      if (!indice) return null;
      let plan = indice.porId.get(id) ?? indice.porNombre.get(nombre.toUpperCase()) ?? null;
      if (!plan) {
        const m = nombre.toUpperCase().match(/TA[_\s-]?0*(\d+)/);
        if (m) plan = indice.porTA.get(Number(m[1])) ?? null;
      }
      const ejecucion = porEquipo.get(plan?.id ?? id) ?? null;
      if (!plan && !ejecucion) return null;
      const orden = ejecucion ? (ordenesPorId.get(ejecucion.ordenId) ?? null) : null;
      return {
        plan,
        ejecucion,
        orden,
        grupo: plan?.grupoPlan || orden?.grupo || "—",
        estado: ejecucion?.estado ?? "Pendiente",
        fechaTrabajo: ejecucion?.fechaTrabajo ?? null,
      };
    },
    [indice, porEquipo, ordenesPorId],
  );

  const marcar = useCallback(
    async (equipoId: string, ordenId: string, estado: EstadoMant, obs?: string) => {
      if (!fincaKey) return;
      const cambio: CambioEstado = {
        equipoId,
        ordenId,
        estado,
        observaciones: obs,
        marcadoEn: new Date().toISOString(),
      };
      const id = `${ordenId}:${equipoId}`;

      // Optimista: el mapa se repinta antes de que responda el backend.
      setDatos((prev) => {
        if (!prev) return prev;
        const previa = prev.ejecuciones.find((e) => e.id === id);
        const nueva: Ejecucion = {
          id,
          ordenId,
          equipoId,
          estado,
          fechaTrabajo: previa?.fechaTrabajo ?? cambio.marcadoEn.slice(0, 10),
          observaciones: obs ?? previa?.observaciones ?? "",
          ejecutadoPor: previa?.ejecutadoPor ?? null,
          actualizadoEn: new Date().toISOString(),
        };
        return { ...prev, ejecuciones: [...prev.ejecuciones.filter((e) => e.id !== id), nueva] };
      });

      try {
        await mantProvider.marcar(fincaKey, cambio);
      } catch {
        setPendientes(colaAgregar(fincaKey, cambio));
      }
    },
    [fincaKey],
  );

  /* Reintento de la cola al recuperar conexión. */
  useEffect(() => {
    if (!fincaKey) return;
    const vaciar = async () => {
      const cola = colaLeer(fincaKey);
      if (!cola.length) return;
      const quedan: CambioEstado[] = [];
      for (const c of cola) {
        try {
          await mantProvider.marcar(fincaKey, c);
        } catch {
          quedan.push(c);
        }
      }
      colaEscribir(fincaKey, quedan);
      setPendientes(quedan.length);
    };
    vaciar();
    window.addEventListener("online", vaciar);
    return () => window.removeEventListener("online", vaciar);
  }, [fincaKey]);

  const grupos = useMemo(() => {
    const s = new Set<string>();
    for (const o of datos?.ordenes ?? []) if (o.grupo) s.add(o.grupo);
    for (const p of datos?.plan ?? []) if (p.grupoPlan) s.add(p.grupoPlan);
    return [...s].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [datos]);

  const diasTrabajados = useMemo(() => {
    const s = new Set<string>();
    for (const e of datos?.ejecuciones ?? []) s.add(e.fechaTrabajo);
    return [...s].sort().reverse();
  }, [datos]);

  const reiniciar = useCallback(() => {
    if (!fincaKey) return;
    reiniciarLocal(fincaKey);
    setPendientes(0);
    recargar();
  }, [fincaKey, recargar]);

  return {
    datos,
    disponible: !!datos && datos.plan.length > 0,
    cargando,
    error,
    pendientesEnCola,
    grupos,
    diasTrabajados,
    ordenes: datos?.ordenes ?? [],
    ver,
    marcar,
    sembrar,
    reiniciar,
  };
}