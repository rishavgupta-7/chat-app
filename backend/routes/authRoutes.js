import express from "express";
import { registerUser, loginUser } from "../controllers/authController.js";
import User from "../models/User.js";
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/findByPhone/:phone", async (req, res) => {
  const user = await User.findOne({ phone: req.params.phone });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});
export default router;
