import { type ReactNode, useState } from 'react';
import {
  BarChart3,
  Ban,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Upload,
  UserCircle,
  Users,
  Zap,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type PageKey =
  | 'dashboard'
  | 'candidates'
  | 'import'
  | 'edit-candidate'
  | 'chase-centre'
  | 'do-not-book'
  | 'history'
  | 'reports'
  | 'admin'
  | 'settings';

interface LayoutProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
}

const navItems: { key: PageKey; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'candidates', label: 'Candidates', icon: Users },
  { key: 'import', label: 'Import', icon: Upload },
  { key: 'edit-candidate', label: 'Edit Candidate', icon: UserCircle },
  { key: 'chase-centre', label: 'Chase Centre', icon: Zap },
  { key: 'do-not-book', label: 'Do Not Book', icon: Ban },
  { key: 'history', label: 'Audit History', icon: History },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'admin', label: 'Admin', icon: ShieldCheck, adminOnly: true },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function DashboardLayout({ current, onNavigate, children }: LayoutProps) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (page: PageKey) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-pink-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-white/70 backdrop-blur-md border-r border-pink-100 fixed inset-y-0 left-0 z-30">
        <SidebarContent current={current} onNavigate={handleNav} user={user?.email} onSignOut={signOut} isAdmin={isAdmin} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-pink-900/20 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col animate-slide-in-right">
            <SidebarContent current={current} onNavigate={handleNav} user={user?.email} onSignOut={signOut} onClose={() => setMobileOpen(false)} isAdmin={isAdmin} />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-pink-50/80 backdrop-blur-md border-b border-pink-100 px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-pink-600 hover:bg-pink-100 transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm text-pink-400">
              <span className="font-medium text-pink-600">Oakwood24</span>
              <span>/</span>
              <span className="font-semibold text-pink-800">{navItems.find((n) => n.key === current)?.label ?? current}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-pink-100 text-pink-700 text-xs font-medium">
              <HeartPulse size={14} />
              <span>Maintenance Portal</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-pink-200 flex items-center justify-center text-pink-700 font-semibold text-sm">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-pink-800 leading-tight">{profile?.display_name ?? user?.email ?? 'User'}</p>
                <p className="text-xs text-pink-400 leading-tight">{profile?.role === 'admin' ? 'Administrator' : 'Coordinator'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  current,
  onNavigate,
  user,
  onSignOut,
  onClose,
  isAdmin,
}: {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  user?: string | null;
  onSignOut: () => void;
  onClose?: () => void;
  isAdmin: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-6 h-16 border-b border-pink-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center shadow-[var(--shadow-soft)]">
            <HeartPulse className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-base font-bold text-pink-900 leading-tight">Oakwood24</h1>
            <p className="text-xs text-pink-400 leading-tight">Maintenance Portal</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-pink-400 hover:bg-pink-100">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const active = current === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all-soft ${
                  active
                    ? 'bg-pink-500 text-white shadow-[var(--shadow-soft)]'
                    : 'text-pink-600 hover:bg-pink-100 hover:text-pink-800'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            );
          })}
      </nav>

      <div className="px-4 py-4 border-t border-pink-100">
        <div className="px-3.5 py-2 mb-2">
          <p className="text-xs text-pink-400 truncate">{user}</p>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-pink-600 hover:bg-danger-50 hover:text-danger-600 transition-all-soft"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </>
  );
}
