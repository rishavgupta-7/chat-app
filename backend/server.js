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
import aiRoutes from "./routes/aiRoutes.js";
import User from "./models/User.js";
import Message from "./models/Message.js";

dotenv.config();
connectDB();

// ---------- PATH FIX FOR RENDER ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- ALLOWED ORIGINS ----------
const allowedOrigins = [
  process.env.CLIENT_URL,                 // Your Render frontend URL
  "https://chat-app-hwvk.onrender.com",   // Fallback
].filter(Boolean);

// ---------- EXPRESS ----------
const app = express();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());

// ---------- ROUTES ----------
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);

app.get("/api", (req, res) => res.send("API running ✔"));

// ---------- SERVE FRONTEND ----------
const frontendPath = path.join(__dirname, "../frontend/build");
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ---------- HTTP + SOCKET.IO ----------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// ---------- SOCKET AUTH ----------
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) return next(new Error("Invalid token"));

    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Authentication failed"));
  }
});

// ---------- SOCKET CONNECTION ----------
io.on("connection", async (socket) => {
  const userId = socket.userId;
  console.log(`🟢 Connected: socket=${socket.id} user=${userId}`);

  if (mongoose.Types.ObjectId.isValid(userId)) {
    await User.findByIdAndUpdate(userId, { socketId: socket.id });
  }

  // ---------- SEND MESSAGE ----------
  socket.on("sendMessage", async ({ receiverPhone, text }) => {
    try {
      const senderId = socket.userId;
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
        senderId: senderId.toString(),
        receiverId: receiver._id.toString(),
        text,
        createdAt: message.createdAt,
        delivered: message.delivered,
        seen: message.seen,
      };

      // Send to receiver (if online)
      if (receiver.socketId) {
        io.to(receiver.socketId).emit("receiveMessage", payload);
        io.to(socket.id).emit("messageDelivered", { messageId: payload._id });
      }

      // Always send to sender
      io.to(socket.id).emit("receiveMessage", payload);
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  // ---------- DELETE MESSAGE ----------
  socket.on("deleteMessage", async ({ messageId, receiverId }) => {
    try {
      await Message.findByIdAndDelete(messageId);

      // notify receiver
      if (receiverId) {
        const receiver = await User.findById(receiverId);
        if (receiver?.socketId)
          io.to(receiver.socketId).emit("messageDeleted", messageId);
      }

      // notify sender
      io.to(socket.id).emit("messageDeleted", messageId);
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });

  // ---------- MARK SEEN ----------
  socket.on("markSeen", async ({ userId: currentUserId, otherUserId }) => {
    try {
      const unseen = await Message.find({
        senderId: otherUserId,
        receiverId: currentUserId,
        seen: false,
      });

      if (unseen.length === 0) return;

      const ids = unseen.map((m) => m._id.toString());

      await Message.updateMany(
        { _id: { $in: ids } },
        { $set: { seen: true } }
      );

      const other = await User.findById(otherUserId);
      if (other?.socketId)
        io.to(other.socketId).emit("messageSeen", { messageIds: ids });
    } catch (err) {
      console.error("Mark seen error:", err);
    }
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", async () => {
    try {
      await User.findByIdAndUpdate(socket.userId, { socketId: "" });
      console.log(`🔴 Disconnected user ${socket.userId}`);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
});

// ---------- SAFE GET MESSAGES ----------
app.get("/api/messages/:otherUserId", async (req, res) => {
  const { currentUserId } = req.query;
  const otherUserId = req.params.otherUserId;

  if (
    !mongoose.Types.ObjectId.isValid(otherUserId) ||
    !mongoose.Types.ObjectId.isValid(currentUserId)
  ) {
    return res.json([]);
  }

  try {
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.json([]);
  }
});

// ---------- SAFE CHAT LIST ----------
app.get("/api/chats/:userId", async (req, res) => {
  const userId = req.params.userId;

  if (!mongoose.Types.ObjectId.isValid(userId)) return res.json([]);

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

    const users = await User.find({ _id: { $in: partnerIds } })
      .select("name phone socketId");

    res.json(users);
  } catch {
    res.json([]);
  }
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
