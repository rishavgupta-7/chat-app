import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import "./AIChat.css";

// PERSONAS
const personas = [
  { id: "friendly", name: "Friendly AI", description: "Polite & helpful" },
  { id: "sarcastic", name: "Sarcastic AI", description: "Funny & witty" },
  { id: "coder", name: "Coder AI", description: "Expert developer" },
  { id: "romantic", name: "Romantic AI", description: "Loving & sweet" },
];

// ❌ REMOVE LOCALHOST
// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
// ✅ USE RELATIVE API BASE PATH INSTEAD
const BACKEND_URL = "";

// -------------------------
// LOCALSTORAGE FUNCTIONS
// -------------------------
const saveChat = (persona, messages) => {
  localStorage.setItem(`aiChat_${persona}`, JSON.stringify(messages));
};

const loadChat = (persona) => {
  const data = localStorage.getItem(`aiChat_${persona}`);
  return data ? JSON.parse(data) : [];
};

export default function AIChat({ user, setUser }) {
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // AUTO SCROLL
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // LOAD PREVIOUS CHAT
  useEffect(() => {
    if (selectedPersona) {
      const oldChat = loadChat(selectedPersona);
      setMessages(oldChat);
    }
  }, [selectedPersona]);

  // -----------------------------
  // SEND MESSAGE TO BACKEND
  // -----------------------------
  const sendMessage = async () => {
    if (!input.trim() || !selectedPersona) return;

    const userMsg = {
      sender: "user",
      text: input,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveChat(selectedPersona, newMessages);

    setInput("");
    setLoading(true);

    try {
      const formatted = newMessages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      }));

      // ⭐ FIX: NO LOCALHOST
      const res = await axios.post(`/api/ai/chat`, {
        messages: formatted,
        persona: selectedPersona,
      });

      const aiText = res.data.assistantMessage.content;

      const aiMsg = {
        sender: "ai",
        text: aiText,
        timestamp: new Date(),
      };

      const updated = [...newMessages, aiMsg];
      setMessages(updated);
      saveChat(selectedPersona, updated);
    } catch (err) {
      const errorMsg = {
        sender: "ai",
        text: "AI Error. Please try again.",
        timestamp: new Date(),
      };
      const updated = [...newMessages, errorMsg];
      setMessages(updated);
      saveChat(selectedPersona, updated);
    }

    setLoading(false);
  };

  const formatTime = (date) => {
    const d = new Date(date);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="ai-chat-container">
      {/* LEFT PANEL */}
      <div className="ai-chat-left">
        <h2>AI Personas</h2>

        {personas.map((p) => (
          <motion.div
            whileHover={{ scale: 1.02 }}
            key={p.id}
            onClick={() => setSelectedPersona(p.id)}
            className={`ai-persona ${selectedPersona === p.id ? "selected" : ""}`}
          >
            <h3>{p.name}</h3>
            <p>{p.description}</p>
          </motion.div>
        ))}
      </div>

      {/* MOBILE MENU */}
      <div className="mobile-persona-btn-wrapper">
        <button
          className="mobile-persona-btn"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {selectedPersona ? "Change AI Persona" : "Choose AI Persona"}
        </button>

        {isMenuOpen && (
          <div className="mobile-persona-dropdown">
            {personas.map((p) => (
              <motion.div
                key={p.id}
                whileHover={{ scale: 1.02 }}
                onClick={() => {
                  setSelectedPersona(p.id);
                  setIsMenuOpen(false);
                }}
                className={`ai-persona ${selectedPersona === p.id ? "selected" : ""}`}
              >
                <h3>{p.name}</h3>
                <p>{p.description}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="ai-chat-right">
        <div className="ai-messages">
          {selectedPersona ? (
            messages.map((msg, idx) => (
              <div key={idx} className={`ai-message ${msg.sender}`}>
                {msg.text}
                <span className="timestamp">{formatTime(msg.timestamp)}</span>
              </div>
            ))
          ) : (
            <div className="ai-no-persona">Select a persona to start chatting</div>
          )}

          <div ref={messagesEndRef}></div>
        </div>

        {/* INPUT BAR */}
        {selectedPersona && (
          <div className="ai-input-bar">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage} disabled={loading}>
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
