// aiRoutes.js
import express from "express";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// REMOVE node-fetch ❌
// import fetch from "node-fetch"; // ❌ breaks on Render

// Use native fetch ✔ (Node 18+)
const fetch = global.fetch;

// Persona prompts...
const personaPrompts = { ... };

// CHAT ROUTE
router.post("/chat", async (req, res) => {
  let { messages, persona } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  const finalMessages = [
    {
      role: "system",
      content: personaPrompts[persona] || personaPrompts.friendly,
    },
    ...messages
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",

        // ⭐ REQUIRED FOR PRODUCTION / Render
        "HTTP-Referer": "https://chat-app-hwvk.onrender.com",
        "X-Title": "ChatApp AI Persona"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b:free",
        messages: finalMessages,

        // ❌ REMOVE reasoning — not supported in free models
        // reasoning: { enabled: true }
      })
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({
        error: "AI returned no choices",
        raw: data
      });
    }

    const assistantMessage = data.choices[0].message;

    res.json({
      assistantMessage,
      fullConversation: [...finalMessages, assistantMessage]
    });

  } catch (err) {
    console.error("AI Chat Error:", err);
    res.status(500).json({ error: "AI request failed", details: err.message });
  }
});

export default router;
