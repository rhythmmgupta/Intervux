import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { LogOut } from 'lucide-react';

const CANDIDATE_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/setup', label: 'New session' },
  { to: '/contests', label: 'Contests' },
  { to: '/speaking', label: 'Speaking' },
  { to: '/scoreboard', label: 'Scoreboard' },
  { to: '/history', label: 'History' },
];

const HR_LINKS = [
  { to: '/hr', label: 'Candidates' },
  { to: '/contests', label: 'Contests' },
  { to: '/scoreboard', label: 'Scoreboard' },
];

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = ApiService.getCurrentStoredUser();
  const links = user?.role === 'hr' ? HR_LINKS : CANDIDATE_LINKS;

  const handleLogout = () => {
    ApiService.removeToken();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-ink/95 backdrop-blur-sm border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        {/* The mark is the product: a level meter at rest. */}
        <Link to={user ? (user.role === 'hr' ? '/hr' : '/dashboard') : '/'} className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-end gap-[2px] h-5" aria-hidden="true">
            <span className="w-[3px] h-2 bg-sodium-600" />
            <span className="w-[3px] h-3.5 bg-sodium-500" />
            <span className="w-[3px] h-5 bg-sodium-400" />
            <span className="w-[3px] h-3 bg-good-500" />
          </span>
          <span className="signage text-lg text-chalk">IntervuX</span>
        </Link>

        {user && (
          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
            {links.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-1.5 text-sm rounded-control transition-colors ${
                    active
                      ? 'text-sodium-300 bg-sodium-600/10 border border-sodium-600/40'
                      : 'text-mute hover:text-chalk border border-transparent'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-3 ml-auto shrink-0">
          {user ? (
            <>
              <div className="hidden sm:block text-right leading-tight">
                <p className="text-xs text-chalk">{user.name}</p>
                <p className="text-[11px] text-mute">
                  {user.role === 'hr'
                    ? `Recruiting${user.target_company ? ` for ${user.target_company}` : ''}`
                    : user.target_company
                    ? `Targeting ${user.target_company}`
                    : 'No target set'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-mute hover:text-peak-300 transition-colors rounded-control"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 py-1.5 text-sm text-mute hover:text-chalk transition-colors">
                Sign in
              </Link>
              <Link
                to="/register"
                className="px-3.5 py-1.5 text-sm font-semibold bg-sodium-500 hover:bg-sodium-400 text-ink rounded-control transition-colors"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
