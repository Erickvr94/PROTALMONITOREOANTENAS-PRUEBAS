import { useState } from "react";
import { NavLink } from "react-router-dom";
import { EMPRESAS } from "../../config/empresas";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/logomelacorp.png";
import "./Sidebar.css";

interface SidebarProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
  const { user, logout } = useAuth();

  const [empresasAbiertas, setEmpresasAbiertas] = useState<Set<string>>(
    () => new Set(EMPRESAS.map((e) => e.id)),
  );
  const [fincasAbiertas, setFincasAbiertas] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleEmpresa(id: string) {
    setEmpresasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFinca(key: string) {
    setFincasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <aside className={`sidebar ${isMobileOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <img src={logo} alt="Melacorp" className="sidebar-logo" />
          <button
            type="button"
            className="mobile-close"
            onClick={() => onClose?.()}
            aria-label="Cerrar menú"
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className="nav-link" onClick={onClose}>
            <span className="nav-icon">&#9632;</span>
            Dashboard
          </NavLink>

          <div className="nav-section-label">Empresas</div>

          {EMPRESAS.map((empresa) => {
            const empresaAbierta = empresasAbiertas.has(empresa.id);
            return (
              <div key={empresa.id} className="nav-empresa">
                <button
                  className="nav-empresa-btn"
                  onClick={() => toggleEmpresa(empresa.id)}
                >
                  <span className="nav-empresa-arrow">
                    {empresaAbierta ? "▾" : "▸"}
                  </span>
                  {empresa.name}
                  {empresa.fincas.length === 0 && (
                    <span className="badge-soon">Sin fincas</span>
                  )}
                </button>

                {empresaAbierta && (
                  <div className="nav-fincas">
                    {empresa.fincas.length === 0 ? (
                      <span className="nav-empty">Sin fincas configuradas</span>
                    ) : (
                      empresa.fincas.map((finca) => {
                        const fincaKey = `${empresa.id}/${finca.id}`;
                        const fincaAbierta = fincasAbiertas.has(fincaKey);
                        return (
                          <div key={finca.id} className="nav-finca">
                            <button
                              className="nav-finca-btn"
                              onClick={() => toggleFinca(fincaKey)}
                            >
                              <span className="nav-finca-arrow">
                                {fincaAbierta ? "▾" : "▸"}
                              </span>
                              {finca.name}
                            </button>

                            {fincaAbierta && (
                              <div className="nav-finca-links">
                                <NavLink
                                  to={`/dashboard/${empresa.id}/${finca.id}/realtime`}
                                  className="nav-link nav-link-sub"
                                  onClick={onClose}
                                >
                                  <span className="nav-icon">&#9673;</span>
                                  Tiempo Real
                                  {!finca.wsUrl && (
                                    <span className="badge-soon">Pronto</span>
                                  )}
                                </NavLink>
                                <NavLink
                                  to={`/dashboard/${empresa.id}/${finca.id}/mapa`}
                                  className="nav-link nav-link-sub"
                                  onClick={onClose}
                                >
                                  <span className="nav-icon">&#9737;</span>
                                  Mapa
                                  {!finca.wsUrl && (
                                    <span className="badge-soon">Pronto</span>
                                  )}
                                </NavLink>
                                <NavLink
                                  to={`/dashboard/${empresa.id}/${finca.id}/historico`}
                                  className="nav-link nav-link-sub"
                                  onClick={onClose}
                                >
                                  <span className="nav-icon">&#9776;</span>
                                  Historico
                                  {!finca.hasHistorico && (
                                    <span className="badge-soon">Pronto</span>
                                  )}
                                </NavLink>
                                <NavLink
                                  to={`/dashboard/${empresa.id}/${finca.id}/tendencias`}
                                  className="nav-link nav-link-sub"
                                  onClick={onClose}
                                >
                                  <span className="nav-icon">&#9650;</span>
                                  Tendencias
                                  {!finca.hasTendencias && (
                                    <span className="badge-soon">Pronto</span>
                                  )}
                                </NavLink>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="user-avatar">
            {user?.name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name ?? user?.username}</span>
            <span className="user-role">{user?.role}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={() => { logout(); onClose?.(); }}>
          Salir
        </button>
      </div>
    </aside>
  );
}
