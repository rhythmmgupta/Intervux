import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { Interview } from '../types';
import {
  History as HistoryIcon,
  Video,
  ExternalLink,
  Filter,
  Calendar,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const History: React.FC = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<string>('all');

  useEffect(() => {
    if (!ApiService.getCurrentStoredUser() && !localStorage.getItem('intervux_token')) {
      navigate('/login');
      return;
    }

    const loadHistory = async () => {
      try {
        setLoading(true);
        const data = await ApiService.getInterviews();
        setInterviews(data);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, [navigate]);

  const filtered = interviews.filter((item) => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterMode !== 'all' && item.mode !== filterMode) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-ink text-chalk py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-line mb-8">
        <div>
          <div className="flex items-center gap-2 text-sodium-400 text-xs font-semibold mb-1">
            <HistoryIcon className="w-3.5 h-3.5" />
            <span>Every session you have run</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-chalk">Interview History</h1>
          <p className="text-xs text-mute mt-1">
            Browse all past mock interviews, review feedback, and track your readiness.
          </p>
        </div>

        <Link
          to="/setup"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-control bg-sodium-600 hover:bg-sodium-500 text-chalk text-xs font-semibold transition-all"
        >
          <Video className="w-4 h-4" />
          New Interview
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-panel border border-line rounded-control p-4 mb-6 flex flex-wrap items-center gap-4 text-xs">
        <span className="text-mute flex items-center gap-1.5 font-medium">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </span>

        <div className="flex items-center gap-2">
          <label className="text-mute">Track:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-ink border border-line text-chalk rounded-control px-3 py-1.5 focus:outline-none focus:border-sodium-500"
          >
            <option value="all">All Tracks</option>
            <option value="technical">Technical</option>
            <option value="hr">HR & Behavioral</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-mute">Mode:</label>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            className="bg-ink border border-line text-chalk rounded-control px-3 py-1.5 focus:outline-none focus:border-sodium-500"
          >
            <option value="all">All Modes</option>
            <option value="practice">Practice Mode</option>
            <option value="simulation">Simulation Mode</option>
          </select>
        </div>

        <span className="text-mute ml-auto font-mono">
          Showing {filtered.length} of {interviews.length} sessions
        </span>
      </div>

      {/* History Table */}
      <div className="bg-panel border border-line rounded-panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-mute text-sm">Loading interview archive...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-mute text-sm">
            <p>No matching interview records found.</p>
            <Link to="/setup" className="inline-block mt-3 text-xs text-sodium-400 font-semibold hover:underline">
              Start a new interview session &rarr;
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-mute bg-ink/60 border-b border-line text-[10px]">
                <tr>
                  <th className="py-3 px-6 font-semibold">Date & Time</th>
                  <th className="py-3 px-6 font-semibold">Track & Mode</th>
                  <th className="py-3 px-6 font-semibold">Difficulty</th>
                  <th className="py-3 px-6 font-semibold">Overall</th>
                  <th className="py-3 px-6 font-semibold">Communication</th>
                  <th className="py-3 px-6 font-semibold">Technical</th>
                  <th className="py-3 px-6 font-semibold">Body Language</th>
                  <th className="py-3 px-6 font-semibold text-right">Detailed Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel text-chalk-dim">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-steel/40 transition-colors">
                    <td className="py-4 px-6 text-mute">
                      <div className="flex items-center gap-1.5 text-chalk font-medium">
                        <Calendar className="w-3.5 h-3.5 text-sodium-400" />
                        {new Date(item.started_at).toLocaleDateString()}
                      </div>
                      <span className="text-[10px] text-mute">
                        {new Date(item.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-4 px-6 capitalize">
                      <span className="font-semibold text-chalk">{item.type}</span>
                      <span className="text-mute text-[11px] block">{item.mode}</span>
                    </td>
                    <td className="py-4 px-6 capitalize">
                      <span className="px-2 py-0.5 rounded-full bg-steel text-chalk-dim font-medium text-[11px]">
                        {item.difficulty}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-bold text-base text-chalk">
                      {item.overall_score ? Math.round(item.overall_score) : '—'}
                    </td>
                    <td className="py-4 px-6 font-medium text-chalk-dim">
                      {item.communication_score ? Math.round(item.communication_score) : '—'}
                    </td>
                    <td className="py-4 px-6 font-medium text-chalk-dim">
                      {item.technical_score ? Math.round(item.technical_score) : '—'}
                    </td>
                    <td className="py-4 px-6 font-medium text-chalk-dim">
                      {item.body_language_score ? Math.round(item.body_language_score) : '—'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {item.status === 'completed' ? (
                        <Link
                          to={`/report/${item.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control bg-sodium-600/15 text-sodium-400 border border-sodium-500/20 hover:bg-sodium-600/25 font-semibold transition-colors"
                        >
                          View Report <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <Link
                          to={`/interview/${item.id}`}
                          className="inline-flex items-center gap-1 text-good-400 hover:text-good-300 font-semibold"
                        >
                          Resume <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
