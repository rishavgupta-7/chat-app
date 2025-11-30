import axios from "axios";

const API = axios.create({
  baseURL: "https://chat-app-hwvk.onrender.com/api", 
  // 🔥 Hardcoded
});

export default API;

