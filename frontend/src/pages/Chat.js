import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Chat.css";

export default function ChatApp({ user, setUser }) {

  // ========================
  // FIX USER.id ALWAYS EXISTS
  // ========================
  const safeUser =
    user && user._id && !user.id ? { ...user, id: user._id } : user;

  const [socket, setSocket] = useState(null);

  // ========================
  // RESTORE SELECTED USER
  // ========================
  const [selectedUser, setSelectedUser] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("selectedUser"));
      return saved || null;
    } catch {
      return null;
    }
  });

  const [chatList, setChatList] = useState([]);

  // ========================
  // RESTORE CACHED MESSAGES
  // ========================
  const [messages, setMessages] = useState(() => {
    try {
      if (!selectedUser) return [];
      const saved = JSON.parse(localStorage.getItem(`chat_${selectedUser._id}`));
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  const [searchPhone, setSearchPhone] = useState("");
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const pressTimer = useRef(null);
  const navigate = useNavigate();

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // ========================
  // DETECT MOBILE
  // ========================
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    setShowRightPanel(!isMobile);
  }, []);

  // ========================
  // SAVE SELECTED USER
  // ========================
  useEffect(() => {
    if (selectedUser)
      localStorage.setItem("selectedUser", JSON.stringify(selectedUser));
  }, [selectedUser]);

  // ========================
  // SAVE MESSAGES
  // ========================
  useEffect(() => {
    if (selectedUser)
      localStorage.setItem(
        `chat_${selectedUser._id}`,
        JSON.stringify(messages)
      );
  }, [messages, selectedUser]);

  // ========================
  // SOCKET CONNECTION
  // ========================
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

    s.on("messageDeleted", (id) =>
      setMessages((prev) => prev.filter((m) => m._id !== id))
    );

    s.on("messageSeen", ({ messageIds }) =>
      setMessages((prev) =>
        prev.map((m) =>
          messageIds.includes(m._id) ? { ...m, seen: true } : m
        )
      )
    );

    s.on("messageDelivered", ({ messageId }) =>
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, delivered: true } : m
        )
      )
    );

    return () => s.disconnect();
  }, [selectedUser]);

  // ========================
  // FETCH CHAT LIST (SAFE)
  // ========================
  useEffect(() => {
    if (!safeUser?.id) return;

    const fetchChats = async () => {
      try {
        const res = await axios.get(`/api/chats/${safeUser.id}`);
        const data = res.data;

        if (Array.isArray(data)) setChatList(data);
        else if (Array.isArray(data?.chats)) setChatList(data.chats);
      } catch (err) {
        console.log("Chat list fetch failed:", err);
      }
    };

    fetchChats();
  }, [safeUser?.id]);

  // ========================
  // LOAD MESSAGES AFTER REFRESH (SAFE)
  // ========================
  useEffect(() => {
    if (!selectedUser) return;
    if (!safeUser?.id) return;

    const loadMessages = async () => {
      try {
        const res = await axios.get(
          `/api/messages/${selectedUser._id}?currentUserId=${safeUser.id}`
        );

        const data = res.data;

        if (Array.isArray(data)) setMessages(data);
        else if (Array.isArray(data?.messages)) setMessages(data.messages);
      } catch (err) {
        console.log("Messages refresh failed:", err);
      }
    };

    loadMessages();
  }, [selectedUser, safeUser?.id]);

  // ========================
  // SCROLL BOTTOM
  // ========================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ========================
  // START CHAT
  // ========================
  const startChat = async (phone) => {
    const target = (phone || searchPhone).trim();
    if (!target) return alert("Enter phone number");

    try {
      const res = await axios.get(`/api/auth/findByPhone/${target}`);
      const u = res.data;

      setSelectedUser(u);

      if (!chatList.some((c) => c._id === u._id))
        setChatList((prev) => [u, ...prev]);

      const msgRes = await axios.get(
        `/api/messages/${u._id}?currentUserId=${safeUser.id}`
      );

      const data = msgRes.data;
      setMessages(Array.isArray(data) ? data : data.messages || []);

      setSearchPhone("");

      socket?.emit("markSeen", {
        userId: safeUser.id,
        otherUserId: u._id,
      });
    } catch {
      alert("User not found!");
    }
  };

  // ========================
  // TYPING INDICATOR
  // ========================
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

  // ========================
  // SEND MESSAGE
  // ========================
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

  // ========================
  // DELETE MESSAGE
  // ========================
  const handlePressStart = (id, receiverId) => {
    pressTimer.current = setTimeout(() => {
      if (window.confirm("Delete this message?"))
        deleteMessage(id, receiverId);
    }, 600);
  };

  const handlePressEnd = () => clearTimeout(pressTimer.current);

  const deleteMessage = (id, receiverId) => {
    if (!socket) return;

    socket.emit("deleteMessage", { messageId: id, receiverId });
    setMessages((prev) => prev.filter((m) => m._id !== id));
  };

  // ========================
  // LOGOUT
  // ========================
  const logout = () => {
    localStorage.clear();
    setUser(null);
    navigate("/login");
  };

  const goBack = () => {
    setShowLeftPanel(true);
    setShowRightPanel(false);
  };

  // ========================
  // UI
  // ========================
  return (
    <div className="chat-container">
      
      {/* LEFT PANEL */}
      <div className={`left-panel ${showLeftPanel ? "show" : "hide"}`}>
        <div className="search-box">
          <input
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
                  className={`status-dot ${
                    c.socketId ? "online" : "offline"
                  }`}
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
              {selectedUser?.name} is typing...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {selectedUser && (
          <div className="input-area">
            <input
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
