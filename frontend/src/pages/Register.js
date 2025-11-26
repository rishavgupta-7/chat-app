import React, { useState } from "react";
import API from "../api";
import { useNavigate, Link } from "react-router-dom";
import "./Register.css";
const Register = () => {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
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
      await API.post("/auth/register", formData);
      alert("Registration successful!");
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
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
      <h2>Register</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          name="name"
          placeholder="Full Name"
          onChange={handleChange}
          required
        />
        <input
          name="phone"  // ✅ match backend field
          placeholder="Phone"
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="gmail"  // ✅ match backend field
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
        <button type="submit">Register</button>
      </form>

      {/* Link to Login page */}
      <p>
        Already have an account?{" "}
        <Link to="/login" style={{ color: "blue", textDecoration: "underline" }}>
          Login
        </Link>
      </p>
    </div>
    </div>
    </div>
  );
};

export default Register;
