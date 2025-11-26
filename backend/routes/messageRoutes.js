import express from "express";
import Message from "../models/Message.js";

const router = express.Router();

// Get chat between two users
router.get("/:userId/:contactId", async (req, res) => {
  const { userId, contactId } = req.params;
  const messages = await Message.find({
    $or: [
      { senderId: userId, receiverId: contactId },
      { senderId: contactId, receiverId: userId },
    ],
  }).sort({ createdAt: 1 });

  res.json(messages);
});

export default router;
