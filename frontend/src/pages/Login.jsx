/**
 * =========================================================================
 * Login.jsx — User Login Page
 * =========================================================================
 *
 * PURPOSE:
 *   Renders the email/password login form.  On successful authentication
 *   via Supabase, the user is redirected to the dashboard.
 *
 * FEATURE / PAGE:
 *   Login — accessible at '/login' for unauthenticated users.
 *
 * BACKEND CONNECTION:
 *   - supabase.auth.signInWithPassword() — Authenticates the user
 *     against Supabase Auth using email and password.
 *
 * RELATED COMPONENTS:
 *   - ThemeContext (dark/light toggle in the top bar)
 *   - Register page (linked from the form footer)
 *   - App.jsx router — Navigates to '/' on success.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import logo from '../assets/logo.png';

// ======================= COMPONENT =======================
/**
 * Login — email/password login form with sidebar and dark-mode toggle.
 * @returns {JSX.Element}
 */
const Login = () => {

  // ======================= STATE & HOOKS =======================

  // Set the browser tab title on first render
  useEffect(() => {
    document.title = "Login | Mutaafi";
  }, []);

  // Controlled form field values
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Whether the login request is in progress
  const [loading, setLoading] = useState(false);
  // Error message shown above the form on auth failure
  const [errorMsg, setErrorMsg] = useState('');
  // React Router hook for redirect after login
  const navigate = useNavigate();
  // Theme context for dark/light mode toggle
  const { isDarkMode, toggleDarkMode } = useTheme();

  // ======================= EVENT HANDLERS =======================

  /**
   * Authenticates the user via Supabase email/password sign-in.
   * On success, navigates to the dashboard.  On failure, displays
   * the error message from Supabase.
   *
   * @param {React.FormEvent} e — The form submit event.
   * @returns {Promise<void>}
   * Triggered when the user clicks "Login".
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  // ======================= RETURN (JSX) =======================
  return (
    <div className="flex bg-[#fafafa] dark:bg-gray-950 min-h-screen transition-colors duration-200">
      {/* Sidebar (simplified for unauthenticated view based on mockup) */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col hidden md:flex transition-colors duration-200">
        <div className="p-6 flex items-center space-x-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Mutaafi Logo" className="h-16 w-auto object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 transition-transform hover:scale-105" />
            <span className="text-xl font-bold tracking-wide text-gray-900 dark:text-white">MUTAAFI</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 text-sm font-medium text-[#2a3441] dark:text-gray-200">
          {/* Static nav items representing the disabled state */}
          {['Dashboard', 'My Workouts', 'My Meals', 'Explore', 'AI Planner', 'AI Coach', 'Feedback', 'Contact Us'].map(item => (
            <div key={item} className="block px-4 py-3 rounded-md text-gray-500 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-not-allowed">
              {item}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex flex-col space-y-2">
          <Link to="/login" className="px-4 py-2 text-sm text-[#108a6e] dark:text-[#19cba3] font-semibold bg-[#eafff6] dark:bg-gray-800 rounded-md">Login</Link>
          <Link to="/register" className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md">Register</Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Top Navbar */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-8 transition-colors duration-200">
          <div className="flex-1"></div>
          <button
            onClick={toggleDarkMode}
            className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
          </button>
        </header>

        {/* Form Content */}
        <div className="flex-1 p-8">
          <h1 className="text-3xl font-bold text-[#2a3441] dark:text-gray-100 mb-12">Login</h1>

          <div className="flex justify-center">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-full max-w-md">
              <form onSubmit={handleLogin} className="space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm">
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="label-text">Email:</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label-text">Password:</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="input-field"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary mt-6 tracking-wide"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                New here? <Link to="/register" className="text-[#6c5b7b] dark:text-[#a08bb5] hover:text-[#50415c] dark:hover:text-[#cbb8e0] font-medium underline">Register</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ======================= EXPORT =======================
export default Login;
