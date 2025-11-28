import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Chat.css";

export default function ChatApp({ user, setUser }) {
  // Use relative URL
  const BACKEND_URL = "";

  // Ensure user.id always exists
  const safeUser = user && user._id && !user.id ? { ...user, id: user._id } : user;

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

  // Detect mobile
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    setShowLeftPanel(true);
    setShowRightPanel(!isMobile);
  }, []);

  // ===========================
  // SOCKET.IO CONNECTION
  // ===========================
  useEffect(() => {
    const s = io("/", {
      transports: ["websocket", "polling"],
      auth: { token: localStorage.getItem("token") },
    });

    s.on("connect", () => setSocket(s));

    s.on("receiveMessage", (msg) => {
      if (
        selectedUser &&
        (msg.senderId === selectedUser._id ||
          msg.receiverId === selectedUser._id)
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    s.on("messageDeleted", (messageId) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    });

    s.on("messageSeen", ({ messageIds }) => {
      setMessages((prev) =>
        prev.map((m) =>
          messageIds.includes(m._id) ? { ...m, seen: true } : m
        )
      );
    });

    s.on("messageDelivered", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, delivered: true } : m
        )
      );
    });

    return () => s.disconnect();
  }, [selectedUser]);

  // ===========================
  // FETCH CHAT LIST
  // ===========================
  useEffect(() => {
    if (!safeUser?.id) return;

    const fetchChats = async () => {
      try {
        const res = await axios.get(`/api/chats/${safeUser.id}`);

        // Ensure array
        setChatList(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Fetch chat list error:", err);
        setChatList([]); // Prevent map crash
      }
    };

    fetchChats();
  }, [safeUser?.id]);

  // Scroll to bottom
  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(scrollToBottom, [messages]);

  // ===========================
  // START CHAT
  // ===========================
  const startChat = async (phone) => {
    const targetPhone = (phone || searchPhone).trim();
    if (!targetPhone) return alert("Enter phone number");

    try {
      const res = await axios.get(`/api/auth/findByPhone/${targetPhone}`);
      const u = res.data;

      setSelectedUser(u);

      if (!chatList.find((c) => c._id === u._id))
        setChatList((prev) => [u, ...prev]);

      const msgs = await axios.get(
        `/api/messages/${u._id}?currentUserId=${safeUser.id}`
      );

      setMessages(Array.isArray(msgs.data) ? msgs.data : []);
      setSearchPhone("");

      if (window.innerWidth <= 768) {
        setShowLeftPanel(false);
        setShowRightPanel(true);
      }

      socket.emit("markSeen", {
        userId: safeUser.id,
        otherUserId: u._id,
      });
    } catch {
      alert("User not found!");
    }
  };

  // ===========================
  // TYPING
  // ===========================
  useEffect(() => {
    if (!socket) return;

    socket.on("typing", ({ senderId }) => setTypingUser(senderId));
    socket.on("stopTyping", () => setTypingUser(null));

    return () => {
      socket.off("typing");
      socket.off("stopTyping");
    };
  }, [socket]);

  const handleTyping = () => {
    if (!socket || !selectedUser) return;

    socket.emit("typing", {
      senderId: safeUser.id,
      receiverId: selectedUser._id,
    });

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit("stopTyping", {
        senderId: safeUser.id,
        receiverId: selectedUser._id,
      });
    }, 1000);
  };

  // ===========================
  // SEND MESSAGE
  // ===========================
  const sendMessage = () => {
    if (!text || !selectedUser || !socket) return;

    socket.emit("sendMessage", {
      receiverPhone: selectedUser.phone,
      text,
      senderId: safeUser.id,
    });

    setText("");
    setTypingUser(null);
  };

  // ===========================
  // DELETE MESSAGE
  // ===========================
  const handlePressStart = (messageId, receiverId) => {
    pressTimer.current = setTimeout(() => {
      if (window.confirm("Delete this message?"))
        deleteMessage(messageId, receiverId);
    }, 600);
  };

  const handlePressEnd = () => clearTimeout(pressTimer.current);

  const deleteMessage = (messageId, receiverId) => {
    if (!socket) return;

    socket.emit("deleteMessage", { messageId, receiverId });
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  };

  // ===========================
  // LOGOUT
  // ===========================
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  // Mobile back button
  const goBack = () => {
    setShowLeftPanel(true);
    setShowRightPanel(false);
  };

  // ===========================
  // UI
  // ===========================
  return (
    <div className="chat-container">
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
          {Array.isArray(chatList) &&
            chatList.map((c) => (
              <div
                key={c._id}
                className={`chat-item ${
                  selectedUser?._id === c._id ? "active" : ""
                }`}
                onClick={() => startChat(c.phone)}
              >
                <span
                  className={`status-dot ${c.socketId ? "online" : "offline"}`}
                ></span>
                <span>{c.name}</span>
              </div>
            ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className={`right-panel ${showRightPanel ? "show" : "hide"}`}>
        {window.innerWidth <= 768 && selectedUser && (
          <button className="back-btn" onClick={goBack}>
            ← Back
          </button>
        )}

        <div className="messages-area">
          {Array.isArray(messages) &&
            messages.map((m) => (
              <div
                key={m._id}
                className={`message-row ${
                  m.senderId === safeUser.id ? "sent" : "received"
                }`}
                onMouseDown={() => handlePressStart(m._id, m.receiverId)}
                onMouseUp={handlePressEnd}
                onTouchStart={() => handlePressStart(m._id, m.receiverId)}
                onTouchEnd={handlePressEnd}
              >
                <span
                  className={`message-bubble ${
                    m.senderId === safeUser.id
                      ? "sent-bubble"
                      : "received-bubble"
                  }`}
                >
                  {m.text}

                  {m.senderId === safeUser.id && (
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
            <div className="typing-indicator">
              {selectedUser.name} is typing...
            </div>
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
