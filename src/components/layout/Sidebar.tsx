import { NavLink } from "react-router-dom";
import { FINCAS } from "../../config/fincas";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/logomelacorp.png";
import "./Sidebar.css";

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <img src={logo} alt="Melacorp" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className="nav-link">
            <span className="nav-icon">&#9632;</span>
            Dashboard
          </NavLink>

          <div className="nav-section-label">Fincas</div>

          {FINCAS.map((finca) => (
            <div key={finca.id} className="nav-group">
              <div className="nav-group-title">{finca.name}</div>
              <NavLink
                to={`/dashboard/${finca.id}/realtime`}
                className="nav-link nav-link-sub"
              >
                <span className="nav-icon">&#9673;</span>
                Tiempo Real
                {!finca.wsUrl && <span className="badge-soon">Pronto</span>}
              </NavLink>
              <NavLink
                to={`/dashboard/${finca.id}/historico`}
                className="nav-link nav-link-sub"
              >
                <span className="nav-icon">&#9776;</span>
                Historico
              </NavLink>
            </div>
          ))}
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
        <button className="logout-btn" onClick={logout}>
          Salir
        </button>
      </div>
    </aside>
  );
}
