import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const OnlineStatus = ({ user }) => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("token");

    // Connect with JWT token (required by backend)
    const socket = io("http://localhost:5000", {
      auth: { token },
    });

    socket.on("connect", () => {
      setIsOnline(true);
      console.log(`🟢 Connected: ${socket.id}`);
    });

    socket.on("disconnect", () => {
      setIsOnline(false);
      console.log(`🔴 Disconnected`);
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  return (
    <div style={{ marginTop: 30 }}>
      <h3>Welcome, {user?.name}!</h3>
      <p>
        Status:{" "}
        <span style={{ color: isOnline ? "green" : "red" }}>
          {isOnline ? "🟢 Online" : "🔴 Offline"}
        </span>
      </p>
    </div>
  );
};

export default OnlineStatus;
