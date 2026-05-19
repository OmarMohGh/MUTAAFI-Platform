import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { LogOut, UserCircle, Sun, Moon, Menu, X, LayoutDashboard, Dumbbell, Utensils, Compass, Sparkles, Bot, MessageSquare, Mail, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import logo from '../assets/logo.png';
import GlobalChatOverlay from './GlobalChatOverlay';

const mainNavItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'My Workouts', path: '/workouts', icon: Dumbbell },
  { name: 'My Meals', path: '/meal-plans', icon: Utensils },
  { name: 'Explore', path: '/gallery', icon: Compass },
  { name: 'AI Planner', path: '/plan-generator', icon: Sparkles },
  { name: 'AI Coach', path: '/ai-coach', icon: Bot },
];

const supportNavItems = [
  { name: 'Feedback', path: '/feedback', icon: MessageSquare },
  { name: 'Contact Us', path: '/contact', icon: Mail },
];

const Layout = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email === 'admin@mutaafi.com') {
        setIsAdmin(true);
      }
    };
    checkAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(session?.user?.email === 'admin@mutaafi.com');
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close sidebar when navigating (mobile)
  const handleNavClick = () => {
    setIsSidebarOpen(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-gray-950 transition-colors duration-200 relative">
      <GlobalChatOverlay />

      {/* Mobile Overlay Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300
          fixed inset-y-0 left-0 z-40 transform
          ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
          md:relative md:translate-x-0 md:shadow-none md:z-auto
        `}
      >
        <div className="p-8 mb-2 flex items-center space-x-3 border-b border-gray-100 dark:border-gray-800 pb-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="Mutaafi Logo" className="h-16 w-auto object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 transition-transform hover:scale-105" />
            <span className="text-xl font-bold tracking-wide text-gray-900 dark:text-white">MUTAAFI</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm font-medium text-[#2a3441] dark:text-gray-200">
          
          {/* Main Product Zone */}
          <div className="space-y-1">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${
                      isActive
                        ? 'bg-[#10b981]/10 text-[#10b981] font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
            
            {isAdmin && (
              <NavLink
                to="/admin/knowledge"
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center justify-between px-4 py-3 rounded-md transition-colors ${
                    isActive
                      ? 'bg-[#10b981]/10 text-[#10b981] font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`
                }
              >
                <div className="flex items-center space-x-3">
                  <Database size={18} className="shrink-0" />
                  <span>Admin Knowledge Base</span>
                </div>
                <span className="text-[10px] uppercase font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-1 rounded">Admin</span>
              </NavLink>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800"></div>

          {/* Support Zone */}
          <div className="space-y-1">
            {supportNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${
                      isActive
                        ? 'bg-[#10b981]/10 text-[#10b981] font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>

        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
           <button 
             onClick={handleLogout}
             className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 w-full px-4 py-2 transition-colors"
           >
             <LogOut size={16} />
             <span>Sign Out</span>
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 md:px-8 transition-colors duration-200 shrink-0">
          {/* Hamburger Button — mobile only */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>

          <div className="flex-1 hidden md:block" />

          <div className="flex items-center space-x-4">
            <Link to="/profile" className="text-gray-500 dark:text-gray-400 hover:text-[#108a6e] dark:hover:text-[#19cba3] transition-colors rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
              <UserCircle size={28} />
            </Link>
            <button 
              onClick={toggleDarkMode}
              className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 dark:text-gray-200">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
