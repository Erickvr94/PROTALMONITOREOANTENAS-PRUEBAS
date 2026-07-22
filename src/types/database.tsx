export interface Tablero {
  id: string
  finca_id?: string
  nombre: string
  ubicacion?: string
  descripcion?: string
  created_at: string
  tipo?: string
  direccion_ip?: string
  direccion_mac?: string
}

export interface OrdenTrabajo {
  id: string
  numero: number
  titulo: string
  descripcion?: string
  finca_id?: string
  creado_por?: string
  coordinador_id?: string
  created_at: string
  finalizada_at?: string
  finalizada_por?: string
}

export interface Finca {
  id: string
  empresa_id?: string
  nombre: string
  created_at: string
}