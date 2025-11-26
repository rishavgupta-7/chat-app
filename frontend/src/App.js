import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import OnlineStatus from "./components/OnlineStatus";
import Chat from "./pages/Chat";
import AIChat from "./pages/AIChat";
import './index.css';
import Navbar from "./components/Navbar";

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  console.log("USER IN APP.JS =", user);

  return (
    <BrowserRouter>
      <Routes>
        
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" />} />
 
        {/* Auth Routes */}
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login setUser={setUser} />} />

        {/* Protected Routes */}
        <Route
          path="/online"
          element={user ? <OnlineStatus user={user}setUser={setUser}  /> : <Navigate to="/login" />}
        />

        <Route
          path="/Chat"
          element={user ? (<><Navbar setUser={setUser} /> <Chat user={user} setUser={setUser} /> </>): <Navigate to="/login" />}
        />
        <Route
          path="/aichat"
          element={user ? (<><Navbar setUser={setUser} /> <AIChat user={user} setUser={setUser} /></> ): <Navigate to="/login" />}
        />


      </Routes>
    </BrowserRouter>
  );
}

export default App;
