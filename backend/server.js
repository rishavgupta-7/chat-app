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

// ⭐ REQUIRED FOR SERVING FRONTEND BUILD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- CORS ORIGINS ----
const allowedOrigins = [
  process.env.CLIENT_URL || "*", // ⭐ NO localhost, dynamic for Render
];

// --- EXPRESS APP ---
const app = express();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);

app.get("/api", (req, res) => res.send("API running ✔"));

// ⭐⭐⭐ SERVE FRONTEND BUILD (IMPORTANT) ⭐⭐⭐
const frontendPath = path.join(__dirname, "../frontend/build");
app.use(express.static(frontendPath));

// ⭐ FIX for Express v5 — regex catch-all
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// --- HTTP SERVER ---
const server = http.createServer(app);

// --- SOCKET.IO ---
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// --- SOCKET AUTH ---
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

// --- SOCKET CONNECTION ---
io.on("connection", async (socket) => {
  const userId = socket.userId;

  try {
    await User.findByIdAndUpdate(userId, { socketId: socket.id });
    console.log(`🟢 User ${userId} connected (socket: ${socket.id})`);

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
    console.error("Socket update error:", err.message);
  }

  // --- TYPING EVENTS ---
  socket.on("typing", async ({ receiverId }) => {
    try {
      const receiver = await User.findById(receiverId);
      if (receiver?.socketId) {
        io.to(receiver.socketId).emit("typing", { senderId: socket.userId });
      }
    } catch (err) {
      console.error("Typing error:", err.message);
    }
  });

  socket.on("stopTyping", async ({ receiverId }) => {
    try {
      const receiver = await User.findById(receiverId);
      if (receiver?.socketId) {
        io.to(receiver.socketId).emit("stopTyping", {
          senderId: socket.userId,
        });
      }
    } catch (err) {
      console.error("StopTyping error:", err.message);
    }
  });

  // --- SEND MESSAGE ---
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
      console.error("Send message error:", err.message);
    }
  });

  // --- DELETE MESSAGE ---
  socket.on("deleteMessage", async ({ messageId, receiverId }) => {
    try {
      await Message.findByIdAndDelete(messageId);

      if (receiverId) {
        const receiver = await User.findById(receiverId);
        if (receiver?.socketId) {
          io.to(receiver.socketId).emit("messageDeleted", messageId);
        }
      }

      io.to(socket.id).emit("messageDeleted", messageId);
    } catch (err) {
      console.error("Delete message error:", err.message);
    }
  });

  // --- MARK SEEN ---
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
      if (other?.socketId) {
        io.to(other.socketId).emit("messageSeen", { messageIds: ids });
      }
    } catch (err) {
      console.error("Mark seen error:", err.message);
    }
  });

  // --- DISCONNECT ---
  socket.on("disconnect", async () => {
    try {
      await User.findByIdAndUpdate(socket.userId, { socketId: "" });
      console.log(`🔴 User ${socket.userId} disconnected`);
    } catch (err) {
      console.error("Disconnect error:", err.message);
    }
  });
});

// --- API ENDPOINT: MARK SEEN ---
app.post("/api/messages/mark-seen", async (req, res) => {
  const { userId, otherId } = req.body;

  try {
    const unseen = await Message.find({
      senderId: otherId,
      receiverId: userId,
      seen: false,
    });

    if (unseen.length > 0) {
      const ids = unseen.map((m) => m._id.toString());

      await Message.updateMany(
        { _id: { $in: ids } },
        { $set: { seen: true } }
      );

      const other = await User.findById(otherId);
      if (other?.socketId) {
        io.to(other.socketId).emit("messageSeen", { messageIds: ids });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// --- FETCH MESSAGES ---
app.get("/api/messages/:otherUserId", async (req, res) => {
  const currentUserId = req.query.currentUserId;
  const otherUserId = req.params.otherUserId;

  if (
    !mongoose.Types.ObjectId.isValid(currentUserId) ||
    !mongoose.Types.ObjectId.isValid(otherUserId)
  ) {
    return res.status(400).json({ message: "Invalid user IDs" });
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
    res.status(500).json({ message: "Server error" });
  }
});

// --- FETCH CHATS ---
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

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
