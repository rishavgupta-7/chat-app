// aiRoutes.js
import express from "express";
import fetch from "node-fetch";
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

  // Build final message list without modifying input
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b:free",
        messages: finalMessages,
        reasoning: { enabled: true }
      })
    });

    const data = await response.json();

    // Defensive check
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
    res.status(500).json({ error: "AI request failed", details: err.message });
  }
});

export default router;
