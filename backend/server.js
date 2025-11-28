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

// ===== SERVE FRONTEND BUILD =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== CORS =====
const allowedOrigins = [
  process.env.CLIENT_URL || "*",
];

// ===== EXPRESS APP =====
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

const frontendPath = path.join(__dirname, "../frontend/build");
app.use(express.static(frontendPath));


// =====================================================
// ✅ CORRECT EXPRESS v5 CATCH-ALL ROUTE
// (This one line was breaking everything before)
// =====================================================
app.get("/*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});


// ===== HTTP SERVER =====
const server = http.createServer(app);

// ===== SOCKET.IO =====
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// ===== SOCKET AUTH =====
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

// ===== SOCKET EVENTS =====
io.on("connection", async (socket) => {
  const userId = socket.userId;

  try {
    await User.findByIdAndUpdate(userId, { socketId: socket.id });
    console.log(`🟢 User ${userId} connected (${socket.id})`);
  } catch (err) {
    console.error("Socket connect error:", err);
  }

  // SEND MESSAGE
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
        receiverId: receiver._id,
        text,
        createdAt: message.createdAt,
        delivered: message.delivered,
        seen: message.seen,
      };

      if (receiver.socketId) {
        io.to(receiver.socketId).emit("receiveMessage", payload);
      }

      io.to(socket.id).emit("receiveMessage", payload);
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  // DELETE MESSAGE
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
      console.error("Delete error:", err);
    }
  });

  // MARK SEEN
  socket.on("markSeen", async ({ userId: currentUserId, otherUserId }) => {
    try {
      const unseen = await Message.find({
        senderId: otherUserId,
        receiverId: currentUserId,
        seen: false,
      });

      if (unseen.length === 0) return;

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
  socket.on("disconnect", async () => {
    try {
      await User.findByIdAndUpdate(socket.userId, { socketId: "" });
      console.log(`🔴 User ${socket.userId} disconnected`);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
});

// ===== REST API: MARK SEEN =====
app.post("/api/messages/mark-seen", async (req, res) => {
  const { userId, otherId } = req.body;

  try {
    const unseen = await Message.find({
      senderId: otherId,
      receiverId: userId,
      seen: false,
    });

    if (unseen.length === 0) return res.json({ success: true });

    const ids = unseen.map((m) => m._id.toString());
    await Message.updateMany({ _id: { $in: ids } }, { $set: { seen: true } });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ===== REST API: GET MESSAGES =====
app.get("/api/messages/:otherUserId", async (req, res) => {
  const currentUserId = req.query.currentUserId;
  const otherUserId = req.params.otherUserId;

  if (
    !mongoose.Types.ObjectId.isValid(currentUserId) ||
    !mongoose.Types.ObjectId.isValid(otherUserId)
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

// ===== REST API: CHAT LIST =====
app.get("/api/chats/:userId", async (req, res) => {
  const userId = req.params.userId;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.json([]);
  }

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
  } catch (err) {
    res.json([]);
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
