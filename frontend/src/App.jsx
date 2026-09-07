import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Calendar from "./pages/Calendar.jsx";
import Config from "./pages/Config.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Execute from "./pages/Execute.jsx";
import News from "./pages/News.jsx";
import ScriptHistory from "./pages/ScriptHistory.jsx";
import TradeHistory from "./pages/TradeHistory.jsx";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/news" element={<News />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/execute/:scriptId" element={<Execute />} />
          <Route path="/history/:scriptId" element={<ScriptHistory />} />
          <Route path="/config" element={<Config />} />
          <Route path="/trade-history" element={<TradeHistory />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
