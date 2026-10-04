import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { Video, Lock, Mail, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await ApiService.login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoFill = () => {
    setEmail('candidate@intervux.ai');
    setPassword('DemoPass123!');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-ink">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-panel bg-gradient-to-tr from-sodium-600 to-sodium-600 flex items-center justify-center text-chalk mx-auto mb-4">
            <Video className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-chalk">Welcome back to IntervuX</h2>
          <p className="text-xs text-mute mt-1">Sign in to access your interview telemetry and history</p>
        </div>

        {/* Card */}
        <div className="bg-panel border border-line rounded-panel p-8">
          {error && (
            <div className="mb-6 p-3.5 bg-peak-500/10 border border-peak-500/20 rounded-control flex items-center gap-3 text-peak-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-ink border border-line rounded-control pl-10 pr-4 py-2.5 text-sm text-chalk placeholder-line focus:outline-none focus:border-sodium-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-ink border border-line rounded-control pl-10 pr-4 py-2.5 text-sm text-chalk placeholder-line focus:outline-none focus:border-sodium-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-control bg-sodium-600 hover:bg-sodium-500 disabled:opacity-50 text-chalk text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-chalk border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Fill Helper */}
          <div className="mt-6 pt-5 border-t border-line text-center">
            <button
              type="button"
              onClick={handleDemoFill}
              className="text-xs text-sodium-400 hover:text-sodium-300 inline-flex items-center gap-1.5 font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-fill demo credentials
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-mute mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-sodium-400 font-semibold hover:underline">
            Register for free
          </Link>
        </p>
      </div>
    </div>
  );
};
