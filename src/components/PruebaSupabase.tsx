import React, { useEffect, useState } from 'react'

export const PruebaSupabase = () => {
  const [tableros, setTableros] = useState<any[]>([])
  const [avances, setAvances] = useState<any[]>([])
  const [cargando, setCargando] = useState<boolean>(true)

  useEffect(() => {
    const obtenerDatos = async () => {
      try {
        // Peticiones paralelas al backend de Express
        const [resTableros, resAvances] = await Promise.all([
          fetch('http://localhost:3001/api/tableros'),
          fetch('http://localhost:3001/api/avances')
        ])

        const dataTableros = await resTableros.json()
        const dataAvances = await resAvances.json()

        console.log('✅ Tableros recibidos:', dataTableros)
        console.log('✅ Avances recibidos:', dataAvances)

        setTableros(dataTableros)
        setAvances(dataAvances)
      } catch (error) {
        console.error('❌ Error al obtener datos desde Express:', error)
      } finally {
        setCargando(false)
      }
    }

    obtenerDatos()
  }, [])

  if (cargando) return <div style={{ color: '#fff', padding: '20px' }}>Cargando datos...</div>

  return (
    <div style={{ padding: '20px', color: '#fff', background: '#121212' }}>
      <h2>📊 Datos de la Base de Datos (vía Express)</h2>

      <h3>Tableros ({tableros.length})</h3>
      <pre style={{ background: '#1e1e1e', padding: '10px', borderRadius: '5px' }}>
        {JSON.stringify(tableros, null, 2)}
      </pre>

      <h3>Avances ({avances.length})</h3>
      <pre style={{ background: '#1e1e1e', padding: '10px', borderRadius: '5px' }}>
        {JSON.stringify(avances, null, 2)}
      </pre>
    </div>
  )
}

export default PruebaSupabase