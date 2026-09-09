import { Navigate, Route, Routes } from "react-router-dom";
import { GlobalStyle } from "./theme";
import { ChatPage } from "./features/chat";
import { Login } from "./features/login";
import { useAppSelector } from "./store/hooks";

function LoginGate() {
  const connected = useAppSelector((state) => state.login.connected);
  return connected ? <Navigate to="/chat" replace /> : <Login />;
}

function ChatGate() {
  const connected = useAppSelector((state) => state.login.connected);
  return connected ? <ChatPage /> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <>
      <GlobalStyle />
      <Routes>
        <Route path="/login" element={<LoginGate />} />
        <Route path="/chat" element={<ChatGate />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
