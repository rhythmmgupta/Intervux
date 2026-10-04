import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { InterviewSetup } from './pages/InterviewSetup';
import { InterviewRoom } from './pages/InterviewRoom';
import { Report } from './pages/Report';
import { History } from './pages/History';
import { Contests } from './pages/Contests';
import { Leaderboard } from './pages/Leaderboard';
import { SpeakingPractice } from './pages/SpeakingPractice';
import { HRDashboard } from './pages/HRDashboard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-ink text-chalk flex flex-col font-sans selection:bg-sodium-500 selection:text-chalk">
        <Navbar />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/setup" element={<InterviewSetup />} />
            <Route path="/interview/:id" element={<InterviewRoom />} />
            <Route path="/report/:id" element={<Report />} />
            <Route path="/history" element={<History />} />
            <Route path="/contests" element={<Contests />} />
            <Route path="/scoreboard" element={<Leaderboard />} />
            <Route path="/speaking" element={<SpeakingPractice />} />
            <Route path="/hr" element={<HRDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
