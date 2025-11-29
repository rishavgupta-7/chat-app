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

// PATH
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS origins (filter falsey)
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://chat-app-hwvk.onrender.com",
  "http://localhost:3000",
].filter(Boolean);

const app = express();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);

app.get("/api", (req, res) => res.send("API running ✔"));

// Serve frontend
const frontendPath = path.join(__dirname, "../frontend/build");
app.use(express.static(frontendPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// HTTP + Socket.io
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket auth middleware — added logging
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      console.warn("Socket auth failed: no token provided");
      return next(new Error("No token"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) {
      console.warn("Socket auth failed: token doesn't contain id");
      return next(new Error("Invalid token"));
    }

    socket.userId = decoded.id;
    return next();
  } catch (err) {
    console.warn("Socket auth exception:", err.message);
    return next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.userId;
  console.log(`Socket connected: ${socket.id} (userId: ${userId})`);

  if (mongoose.Types.ObjectId.isValid(userId)) {
    try {
      // store socket id
      await User.findByIdAndUpdate(userId, { socketId: socket.id });
    } catch (err) {
      console.error("Error updating user socketId:", err);
    }
  } else {
    console.warn("Connected socket has invalid userId:", userId);
  }

  // SEND MESSAGE handler — defensive checks + logs
  socket.on("sendMessage", async ({ receiverPhone, text }) => {
    try {
      if (!socket.userId) {
        console.warn("sendMessage: missing socket.userId (unauthenticated)");
        return;
      }
      if (!receiverPhone) {
        console.warn("sendMessage: missing receiverPhone");
        return;
      }

      const senderId = socket.userId;
      const receiver = await User.findOne({ phone: receiverPhone });

      if (!receiver) {
        console.warn("sendMessage: receiver not found for phone", receiverPhone);
        return;
      }

      // create message
      const message = await Message.create({
        senderId,
        receiverId: receiver._id,
        text,
        delivered: !!receiver.socketId,
        seen: false,
      });

      // normalized payload (strings)
      const payload = {
        _id: message._id.toString(),
        senderId: String(senderId),
        receiverId: String(receiver._id),
        text,
        createdAt: message.createdAt,
        delivered: !!message.delivered,
        seen: !!message.seen,
      };

      // emit to receiver if online
      if (receiver.socketId) {
        io.to(receiver.socketId).emit("receiveMessage", payload);
      }

      // emit back to sender's socket (so sender sees the message immediately)
      io.to(socket.id).emit("receiveMessage", payload);

      // If receiver was offline, you may later mark delivered when they connect (your connection code already sets socketId)
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  // DELETE MESSAGE
  socket.on("deleteMessage", async ({ messageId, receiverId }) => {
    try {
      if (!messageId) return;
      await Message.findByIdAndDelete(messageId);

      if (receiverId) {
        const receiver = await User.findById(receiverId);
        if (receiver?.socketId) {
          io.to(receiver.socketId).emit("messageDeleted", messageId);
        }
      }

      io.to(socket.id).emit("messageDeleted", messageId);
    } catch (err) {
      console.error("Delete error:", err);
    }
  });

  // MARK SEEN
  socket.on("markSeen", async ({ userId: currentUserId, otherUserId }) => {
    try {
      if (!currentUserId || !otherUserId) return;

      const unseen = await Message.find({
        senderId: otherUserId,
        receiverId: currentUserId,
        seen: false,
      });

      if (!unseen.length) return;

      const ids = unseen.map((m) => m._id.toString());
      await Message.updateMany({ _id: { $in: ids } }, { $set: { seen: true } });

      const other = await User.findById(otherUserId);
      if (other?.socketId) {
        io.to(other.socketId).emit("messageSeen", { messageIds: ids });
      }
    } catch (err) {
      console.error("Mark seen error:", err);
    }
  });

  // DISCONNECT
  socket.on("disconnect", async (reason) => {
    try {
      if (socket.userId && mongoose.Types.ObjectId.isValid(socket.userId)) {
        await User.findByIdAndUpdate(socket.userId, { socketId: "" });
      }
      console.log(`Socket disconnected: ${socket.id} reason: ${reason}`);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
});

// API — GET MESSAGES
app.get("/api/messages/:otherUserId", async (req, res) => {
  const currentUserId = req.query.currentUserId;
  const otherUserId = req.params.otherUserId;

  if (!mongoose.Types.ObjectId.isValid(otherUserId) || !mongoose.Types.ObjectId.isValid(currentUserId)) {
    return res.status(400).json([]);
  }

  try {
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    }).sort({ createdAt: 1 });

    return res.json(messages);
  } catch (err) {
    console.error("GET /api/messages error:", err);
    return res.status(500).json([]);
  }
});

// API — CHAT LIST (fixed comparison using toString)
app.get("/api/chats/:userId", async (req, res) => {
  const userId = req.params.userId;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json([]);
  }

  try {
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    const partnerIds = [
      ...new Set(
        messages
          .map((m) =>
            String(m.senderId) === String(userId) ? String(m.receiverId) : String(m.senderId)
          )
          .filter(Boolean)
      ),
    ];

    // If no partnerIds found, return users (but limit results)
    if (partnerIds.length === 0) {
      const users = await User.find({ _id: { $ne: userId } })
        .select("name phone socketId")
        .limit(10);
      return res.json(users);
    }

    const users = await User.find({ _id: { $in: partnerIds } }).select("name phone socketId");
    return res.json(users);
  } catch (err) {
    console.error("GET /api/chats error:", err);
    return res.status(500).json([]);
  }
});

// START
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
