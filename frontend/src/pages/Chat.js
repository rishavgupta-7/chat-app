import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import API from "../api";
import { useNavigate } from "react-router-dom";
import "./Chat.css";

export default function ChatApp({ user, setUser }) {
  const userId = user.id;

  const SOCKET_URL = "https://chat-app-hwvk.onrender.com"; 
  const [socket, setSocket] = useState(null);
  const [chatList, setChatList] = useState([]);
  const [searchPhone, setSearchPhone] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const messagesEndRef = useRef(null);
  const [typingUser, setTypingUser] = useState(null);

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  const pressTimer = useRef(null);
  const typingTimeout = useRef(null);
  const navigate = useNavigate();

  /* ---------------- MOBILE ---------------- */
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    setShowLeftPanel(true);
    setShowRightPanel(!isMobile);
  }, []);

  /* ---------------- SOCKET.IO ---------------- */
  useEffect(() => {
    console.log("🔌 Connecting socket to:", SOCKET_URL);

    const s = io(SOCKET_URL, {
      transports: ["websocket"],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 20000,
      auth: { token: localStorage.getItem("token") },
    });

    s.on("connect", () => {
      console.log("🟢 SOCKET CONNECTED:", s.id);
      setSocket(s);
    });

    s.on("disconnect", () => {
      console.log("🔴 SOCKET DISCONNECTED");
    });

    s.on("receiveMessage", (msg) => {
      console.log("⚡ SOCKET receiveMessage:", msg);
      if (!selectedUser) return;

      if (msg.senderId === selectedUser._id || msg.receiverId === selectedUser._id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    s.on("messageDeleted", (messageId) => {
      console.log("⚡ messageDeleted:", messageId);
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    });

    s.on("messageSeen", ({ messageIds }) => {
      console.log("⚡ messageSeen:", messageIds);
      setMessages((prev) =>
        prev.map((m) =>
          messageIds.includes(m._id) ? { ...m, seen: true } : m
        )
      );
    });

    s.on("messageDelivered", ({ messageId }) => {
      console.log("⚡ messageDelivered:", messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, delivered: true } : m
        )
      );
    });

    return () => {
      console.log("🔌 SOCKET CLEANUP DISCONNECT");
      s.disconnect();
    };
  }, [selectedUser]);

  /* ---------------- FETCH CHAT LIST ---------------- */
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const res = await API.get(`/api/chats/${userId}`);
        console.log("📥 /api/chats RESPONSE:", res.data);

        setChatList(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.log("❌ /api/chats ERROR:", err);
        setChatList([]);
      }
    };
    fetchChats();
  }, [userId]);

  /* ---------------- SCROLL ---------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---------------- START CHAT ---------------- */
  const startChat = async (phone) => {
    const target = (phone || searchPhone).trim();
    if (!target) return alert("Enter phone number");

    try {
      const res = await API.get(`/api/auth/findByPhone/${target}`);
      console.log("📥 /api/auth/findByPhone RESPONSE:", res.data);

      const u = res.data;
      setSelectedUser(u);

      if (!chatList.find((c) => c._id === u._id)) {
        setChatList((prev) => [u, ...prev]);
      }

      const msgs = await API.get(`/api/messages/${u._id}?currentUserId=${userId}`);
      console.log("📥 /api/messages RESPONSE:", msgs.data);
      console.log("📌 Is messages array?", Array.isArray(msgs.data));

      setMessages(Array.isArray(msgs.data) ? msgs.data : []);

      setSearchPhone("");

      socket?.emit("markSeen", {
        userId,
        otherUserId: u._id,
      });

      if (window.innerWidth <= 768) {
        setShowLeftPanel(false);
        setShowRightPanel(true);
      }
    } catch (err) {
      console.log("❌ startChat ERROR:", err);
      alert("User not found");
    }
  };

  /* ---------------- TYPING ---------------- */
  useEffect(() => {
    if (!socket) return;

    socket.on("typing", ({ senderId }) => {
      console.log("⌨ typing:", senderId);
      setTypingUser(senderId);
    });

    socket.on("stopTyping", () => {
      console.log("⌨ stopTyping");
      setTypingUser(null);
    });

    return () => {
      socket.off("typing");
      socket.off("stopTyping");
    };
  }, [socket]);

  const handleTyping = () => {
    if (!socket || !selectedUser) return;

    socket.emit("typing", {
      senderId: userId,
      receiverId: selectedUser._id,
    });

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit("stopTyping", {
        senderId: userId,
        receiverId: selectedUser._id,
      });
    }, 1000);
  };

  /* ---------------- SEND MESSAGE ---------------- */
  const sendMessage = () => {
    if (!text || !selectedUser || !socket) return;

    console.log("📤 Sending message:", text);

    socket.emit("sendMessage", {
      receiverPhone: selectedUser.phone,
      text,
      senderId: userId,
    });

    setText("");
    setTypingUser(null);
  };

  /* ---------------- DELETE MESSAGE ---------------- */
  const handlePressStart = (messageId, receiverId) => {
    pressTimer.current = setTimeout(() => {
      if (window.confirm("Delete this message?")) {
        deleteMessage(messageId, receiverId);
      }
    }, 600);
  };

  const handlePressEnd = () => clearTimeout(pressTimer.current);

  const deleteMessage = (messageId, receiverId) => {
    console.log("🗑 deleting:", messageId);
    socket?.emit("deleteMessage", { messageId, receiverId });
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  };

  /* ---------------- LOGOUT ---------------- */
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="chat-container">
      {console.log("🧪 FINAL messages:", messages)}

      {/* LEFT PANEL */}
      <div className={`left-panel ${showLeftPanel ? "show" : "hide"}`}>  

        <div className="search-box">
          <input
            type="text"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            placeholder="Search by phone..."
            className="search-input"
          />
          <button className="start-chat-btn" onClick={() => startChat()}>
            Start Chat
          </button>
        </div>

        <div className="chat-list">
          {chatList.map((c) => (
            <div
              key={c._id}
              className={`chat-item ${selectedUser?._id === c._id ? "active" : ""}`}
              onClick={() => startChat(c.phone)}
            >
              <span className={`status-dot ${c.socketId ? "online" : "offline"}`}></span>
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className={`right-panel ${showRightPanel ? "show" : "hide"}`}>

        <div className="messages-area">
          {messages.map((m) => (
            <div
              key={m._id}
              className={`message-row ${m.senderId === userId ? "sent" : "received"}`}
              onMouseDown={() => handlePressStart(m._id, m.receiverId)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={() => handlePressStart(m._id, m.receiverId)}
              onTouchEnd={handlePressEnd}
            >
              <span
                className={`message-bubble ${
                  m.senderId === userId ? "sent-bubble" : "received-bubble"
                }`}
              >
                {m.text}

                {m.senderId === userId && (
                  <div className="tick">
                    {!m.delivered && !m.seen && <span>✔</span>}
                    {m.delivered && !m.seen && <span>✔✔</span>}
                    {m.seen && <span className="seen">✔✔</span>}
                  </div>
                )}
              </span>
            </div>
          ))}

          {typingUser === selectedUser?._id && (
            <div className="typing-indicator">Typing...</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {selectedUser && (
          <div className="input-area">
            <input
              type="text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                handleTyping();
              }}
              placeholder="Type a message..."
              className="text-input"
            />
            <button className="send-btn" onClick={sendMessage}>
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
