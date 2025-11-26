import { Link, useNavigate } from "react-router-dom";

export default function Navbar({ setUser }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  return (
    <div style={{
      width: "100%",
      padding: "12px 20px",
      background: "#333",
      color: "white",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      
      <div style={{ display: "flex", gap: "20px" }}>
        <Link to="/chat" style={{ color: "white", textDecoration: "none" }}>Chat</Link>
        <Link to="/aichat" style={{ color: "white", textDecoration: "none" }}>AI Chat</Link>
      </div>

      <button 
        onClick={logout}
        style={{
          background: "red",
          color: "white",
          padding: "6px 12px",
          border: "none",
          borderRadius: 4,
          cursor: "pointer"
        }}
      >
        Logout
      </button>
    </div>
  );
}
