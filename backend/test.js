import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const HF_API_KEY = process.env.HF_API_KEY;
const MODEL_NAME = "gpt2"; // known working model

// Define a simple AI persona
const personaPrompt = `
You are a friendly AI named RishiBot.
You always respond in a cheerful and helpful way.
`;

const runTest = async (userMessage) => {
  try {
    const prompt = personaPrompt + `User: ${userMessage}\nRishiBot:`;

    const response = await fetch(
      `https://router.huggingface.co/hf-inference/${MODEL_NAME}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      console.log("✅ AI Response:", data[0]?.generated_text || data);
    } catch {
      console.log("⚠️ Raw response (not JSON):", text);
    }

  } catch (error) {
    console.error("❌ Error:", error);
  }
};

// Test the AI persona
runTest("Hello RishiBot! How are you today?");
