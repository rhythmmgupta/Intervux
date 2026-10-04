import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { Lock, Mail, User, AlertCircle } from 'lucide-react';
import { Company } from '../types';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'candidate' | 'hr'>('candidate');
  const [company, setCompany] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ApiService.getCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const roleOptions = companies.find((c) => c.name === company)?.roles || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await ApiService.register(name, email, password, {
        role,
        target_company: company || null,
        target_role: role === 'candidate' ? targetRole || null : null,
      });
      navigate(role === 'hr' ? '/hr' : '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-ink">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="mb-8">
          <span className="flex items-end gap-[3px] h-6 mb-4" aria-hidden="true">
            <span className="w-1 h-2.5 bg-sodium-600" />
            <span className="w-1 h-4 bg-sodium-500" />
            <span className="w-1 h-6 bg-sodium-400" />
            <span className="w-1 h-3.5 bg-good-500" />
          </span>
          <h1 className="signage text-3xl text-chalk">Create an account</h1>
          <p className="text-sm text-mute mt-2 leading-relaxed">
            {role === 'hr'
              ? 'Review how candidates preparing for your roles are performing.'
              : 'Practise under observation and watch your delivery scores move.'}
          </p>
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
              <label className="block text-xs font-medium text-chalk-dim mb-1.5">I am signing up as</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['candidate', 'A candidate', 'Practise and get scored'],
                  ['hr', 'HR or recruiter', 'Review candidates'],
                ] as const).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className={`p-3 text-left border rounded-control transition-colors ${
                      role === value
                        ? 'border-sodium-500 bg-sodium-600/10'
                        : 'border-line hover:border-mute'
                    }`}
                  >
                    <span className="block text-sm text-chalk">{label}</span>
                    <span className="block text-[11px] text-mute mt-0.5">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-1.5">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full bg-ink border border-line rounded-control pl-10 pr-4 py-2.5 text-sm text-chalk placeholder-line focus:outline-none focus:border-sodium-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-chalk-dim mb-1.5">
                  {role === 'hr' ? 'Company you recruit for' : 'Target company'}
                </label>
                <select
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setTargetRole('');
                  }}
                  className="w-full bg-ink border border-line rounded-control px-3 py-2.5 text-sm text-chalk focus:outline-none focus:border-sodium-500 transition-colors"
                >
                  <option value="">Not sure yet</option>
                  {companies.map((item) => (
                    <option key={item.slug} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              {role === 'candidate' && (
                <div>
                  <label className="block text-xs font-medium text-chalk-dim mb-1.5">Target role</label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    disabled={roleOptions.length === 0}
                    className="w-full bg-ink border border-line rounded-control px-3 py-2.5 text-sm text-chalk disabled:opacity-50 focus:outline-none focus:border-sodium-500 transition-colors"
                  >
                    <option value="">{roleOptions.length ? 'Any role' : 'Pick a company first'}</option>
                    {roleOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-control bg-sodium-500 hover:bg-sodium-400 disabled:opacity-50 text-ink text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-chalk border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-mute mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-sodium-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
