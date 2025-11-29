// aiRoutes.js
import express from "express";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// ⭐ Use global fetch (Node 20+)
const fetch = globalThis.fetch;

// Persona prompts
const personaPrompts = {
  friendly:
    "You are a friendly, helpful AI who talks politely. Only give clean, simple, short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting.",
  sarcastic:
    "You are a sarcastic AI with witty replies. Only give clean, simple, short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting.",
  coder:
    "You are a senior software engineer. Answer like a pro coder. Only give clean, simple, short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting.",
  romantic:
    "You are a sweet, loving AI that talks romantically. Only give clean, simple, short organized text. Do NOT use markdown tables, pipes (|), code blocks, or complex formatting."
};

// =======================================================================================
// CHAT ROUTE
// =======================================================================================
router.post("/chat", async (req, res) => {
  const { messages, persona } = req.body;

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

  // ⭐ DEBUG LOG: Print request body
  console.log("\n===== AI CHAT REQUEST BODY =====");
  console.log("Persona:", persona);
  console.log("Messages:", JSON.stringify(messages, null, 2));

  try {
    // API Payload
    const payload = {
      model: "openai/gpt-oss-20b:free",
      messages: finalMessages
    };

    // ⭐ DEBUG LOG: Show the API payload
    console.log("\n===== SENDING TO OPENROUTER =====");
    console.log("Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",

        // Required by OpenRouter
        "HTTP-Referer": "https://chat-app-hwvk.onrender.com",
        "X-Title": "ChatApp AI Persona"
      },
      body: JSON.stringify(payload)
    });

    // ⭐ DEBUG LOG: Status and headers
    console.log("\n===== OPENROUTER RESPONSE STATUS =====");
    console.log("Status:", response.status);
    console.log("StatusText:", response.statusText);

    const data = await response.json();

    // ⭐ DEBUG LOG: Show full API response
    console.log("\n===== OPENROUTER RAW RESPONSE =====");
    console.log(JSON.stringify(data, null, 2));

    // If no choices returned → backend error
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      console.log("❌ NO CHOICES RETURNED FROM OPENROUTER!");
      return res.status(500).json({
        error: "AI returned no choices",
        raw: data
      });
    }

    const assistantMessage = data.choices[0].message;

    return res.json({
      assistantMessage,
      fullConversation: [...finalMessages, assistantMessage]
    });

  } catch (err) {
    // ⭐ DEBUG LOG: Print full error
    console.log("\n===== AI CHAT ERROR CAUGHT =====");
    console.error(err);

    return res.status(500).json({
      error: "AI request failed",
      details: err.message
    });
  }
});

export default router;
