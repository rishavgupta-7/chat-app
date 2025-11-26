import axios from "axios";

const fetchMessages = async (otherUserId) => {
  const currentUserId = JSON.parse(localStorage.getItem("user")).id;
  try {
    const res = await axios.get(
      `http://localhost:5000/api/messages/${otherUserId}?currentUserId=${currentUserId}`
    );
    console.log(res.data); // array of messages
    return res.data;
  } catch (err) {
    console.error("Fetch messages error:", err.response?.data || err.message);
  }
};
