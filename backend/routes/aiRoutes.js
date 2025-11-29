// aiRoutes.js
import express from "express";
// ❌ REMOVE THIS → Node 18+ already includes fetch
// import fetch from "node-fetch";              // 🔥 UPDATED (removed)
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// Persona prompts
const personaPrompts = {
  friendly: "You are a friendly, helpful AI who talks politely.Only give clean, simple,short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting.",
  sarcastic: "You are a sarcastic AI with witty replies.Only give clean, simple,short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting.",
  coder: "You are a senior software engineer. Answer like a pro coder.Only give clean, simple,short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting.",
  romantic: "You are a sweet, loving AI that talks romantically.Only give clean, simple,short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting."
};

// CHAT ROUTE
router.post("/chat", async (req, res) => {
  let { messages, persona } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  // Build final message list
  const finalMessages = [
    {
      role: "system",
      content: personaPrompts[persona] || personaPrompts.friendly,
    },
    ...messages
  ];

  try {
    // 🔥 UPDATED: using native fetch (NO node-fetch)
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {   // 🔥 UPDATED
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b:free",
        messages: finalMessages,
        reasoning: { enabled: true }
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
    console.error("AI Chat Error:", err.message);
    
    // 🔥 UPDATED: better structured error response
    res.status(500).json({
      error: "AI request failed",
      details: err.message
    });
  }
});

export default router;
