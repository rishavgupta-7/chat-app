import React, { useState } from "react";
import API from "../api";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";

const Login = ({ setUser }) => {
  const [formData, setFormData] = useState({
    gmail: "",
    password: "",
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await API.post("/auth/login", formData);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      navigate("/chat"); // Redirect to protected page
    } catch (err) {
      setError(err.response?.data?.message || "Invalid credentials");
    }
  };

  return (
    <div className="main-container">
      <div className="left-container">
       <h2 className="title">Chat-App With AI-Persona</h2>
       <p className="discription">“A social chat platform that lets users message friends and switch instantly to AI personas with unique behaviors and communication styles.”</p>
       <h4 className="developer-name">Developed BY Rishav Gupta</h4>
      </div>

    <div className="right-container">
      <div className="auth-container">
      <h2>Login</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          name="gmail" // ✅ match backend
          placeholder="Email"
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          onChange={handleChange}
          required
        />
        <button type="submit">Login</button>
      </form>

      {/* Link to Register page */}
      <p>
        Don't have an account?{" "}
        <Link to="/register" style={{ color: "blue", textDecoration: "underline" }}>
          Register
        </Link>
      </p>
      </div>
    </div>
    </div>
  );
};

export default Login;
