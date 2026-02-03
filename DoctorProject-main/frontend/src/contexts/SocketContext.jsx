import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { io } from "socket.io-client";
import backendUrl from "../utils/BackendURL";

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // create socket instance only once
    socketRef.current = io(backendUrl, {
      transports: ["websocket"],
      auth: { token },            // pass token to backend
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      setIsConnected(true);

      try {
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          socket.emit("join", user.id);
        }
      } catch (err) {
        console.error("User parse error:", err);
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("userOnline", (userId) => {
      setOnlineUsers((prev) => new Set([...prev, userId]));
    });

    socket.on("userOffline", (userId) => {
      setOnlineUsers((prev) => {
        const updated = new Set(prev);
        updated.delete(userId);
        return updated;
      });
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      setIsConnected(false);
    });

    // ✅ clean, unconditional cleanup
    return () => {
      if (socket) {
        socket.off();      // remove all listeners
        socket.disconnect();
      }
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        onlineUsers,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
