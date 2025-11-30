import axios from "axios";

const API = axios.create({
  baseURL: "https://chat-app-hwvk.onrender.com/api", 
  withCredentials: true, // 🔥 Hardcoded
});

export default API;

