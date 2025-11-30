// server.js (Render-Ready Full Version)
import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import User from "./models/User.js";
import Message from "./models/Message.js";
import aiRoutes from "./routes/aiRoutes.js";

dotenv.config();
connectDB();

// ----------------------
// FIX __dirname for ES Modules
// ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------
// EXPRESS APP
// ----------------------
const app = express();

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.use(express.json());

// API ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);

// ----------------------
// HTTP SERVER + SOCKET
// ----------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// ----------------------
// SOCKET AUTH
// ----------------------
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token provided"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    console.log("❌ Socket auth failed:", err.message);
    next(new Error("Authentication error"));
  }
});

// ----------------------
// SOCKET CONNECTION
// ----------------------
io.on("connection", async (socket) => {
  const userId = socket.userId;

  try {
    await User.findByIdAndUpdate(userId, { socketId: socket.id });
    console.log(`🟢 User ${userId} connected: ${socket.id}`);

    // Undelivered messages
    const undelivered = await Message.find({
      receiverId: userId,
      delivered: { $ne: true },
    });

    for (const msg of undelivered) {
      io.to(socket.id).emit("receiveMessage", msg);
      msg.delivered = true;
      await msg.save();

      const sender = await User.findById(msg.senderId);
      if (sender?.socketId) {
        io.to(sender.socketId).emit("messageDelivered", {
          messageId: msg._id.toString(),
        });
      }
    }
  } catch (err) {
    console.log("Socket update error:", err.message);
  }

  socket.on("typing", async ({ receiverId }) => {
    const receiver = await User.findById(receiverId);
    if (receiver?.socketId)
      io.to(receiver.socketId).emit("typing", { senderId: userId });
  });

  socket.on("stopTyping", async ({ receiverId }) => {
    const receiver = await User.findById(receiverId);
    if (receiver?.socketId)
      io.to(receiver.socketId).emit("stopTyping", { senderId: userId });
  });

  socket.on("sendMessage", async ({ receiverPhone, text }) => {
    try {
      const senderId = userId;
      const receiver = await User.findOne({ phone: receiverPhone });
      if (!receiver) return;

      const message = await Message.create({
        senderId,
        receiverId: receiver._id,
        text,
        delivered: !!receiver.socketId,
        seen: false,
      });

      const payload = {
        _id: message._id.toString(),
        senderId,
        receiverId: receiver._id.toString(),
        text,
        createdAt: message.createdAt,
        delivered: message.delivered,
        seen: message.seen,
      };

      if (receiver.socketId) {
        io.to(receiver.socketId).emit("receiveMessage", payload);
        io.to(socket.id).emit("messageDelivered", {
          messageId: payload._id,
        });
      }

      io.to(socket.id).emit("receiveMessage", payload);
    } catch (err) {
      console.log("Send message error:", err.message);
    }
  });

  socket.on("deleteMessage", async ({ messageId, receiverId }) => {
    try {
      await Message.findByIdAndDelete(messageId);

      const receiver = await User.findById(receiverId);
      if (receiver?.socketId)
        io.to(receiver.socketId).emit("messageDeleted", messageId);

      io.to(socket.id).emit("messageDeleted", messageId);
    } catch (err) {
      console.log("Delete message error:", err.message);
    }
  });

  socket.on("markSeen", async ({ userId, otherUserId }) => {
    try {
      const unseen = await Message.find({
        senderId: otherUserId,
        receiverId: userId,
        seen: false,
      });

      if (unseen.length === 0) return;

      const ids = unseen.map((m) => m._id.toString());
      await Message.updateMany({ _id: { $in: ids } }, { seen: true });

      const other = await User.findById(otherUserId);
      if (other?.socketId)
        io.to(other.socketId).emit("messageSeen", { messageIds: ids });
    } catch (err) {
      console.log("Mark seen error:", err.message);
    }
  });

  socket.on("disconnect", async () => {
    await User.findByIdAndUpdate(userId, { socketId: "" });
    console.log(`🔴 User ${userId} disconnected`);
  });
});

// --------------------------------------------------
// REST API ENDPOINTS
// --------------------------------------------------
app.post("/api/messages/mark-seen", async (req, res) => {
  const { userId, otherId } = req.body;

  try {
    const unseen = await Message.find({
      senderId: otherId,
      receiverId: userId,
      seen: false,
    });

    const ids = unseen.map((m) => m._id.toString());

    await Message.updateMany({ _id: { $in: ids } }, { seen: true });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// FETCH MESSAGES
app.get("/api/messages/:otherUserId", async (req, res) => {
  const currentUserId = req.query.currentUserId;
  const otherUserId = req.params.otherUserId;

  try {
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// FETCH CHAT LIST
app.get("/api/chats/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    const partnerIds = [
      ...new Set(
        messages.map((m) =>
          m.senderId == userId ? m.receiverId : m.senderId
        )
      ),
    ];

    const users = await User.find({ _id: { $in: partnerIds } }).select(
      "name phone socketId"
    );

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------------------------------
// SERVE FRONTEND BUILD (FIXED PATH)
// --------------------------------------------------

// ⭐⭐⭐ FIXED: correct build path
app.use(express.static(path.join(__dirname, "../frontend/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

// ----------------------
// START SERVER
// ----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
