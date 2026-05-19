/**
 * =========================================================================
 * Home.jsx — Authenticated User Dashboard
 * =========================================================================
 *
 * PURPOSE:
 *   Displays the main dashboard for logged-in users.  It shows a
 *   personalised greeting, today's workout and meal summaries, key
 *   health metrics (calories, goal, BMI), and a 4-week activity
 *   consistency heatmap.
 *
 * FEATURE / PAGE:
 *   Dashboard — the default home view after login (route '/').
 *
 * BACKEND CONNECTION:
 *   - GET /api/dashboard/:user_id  — Flask endpoint that returns
 *     aggregated daily stats: workout/meal counts, calorie and protein
 *     intake, BMI, goal type, and a 35-day activity history dict keyed
 *     by date string (YYYY-MM-DD).
 *   - supabase.auth.getUser()   — Provides user ID and first name.
 *   - supabase.auth.getSession() — Provides the JWT token for
 *     authorised backend requests.
 *
 * RELATED COMPONENTS:
 *   - Lucide icons (Flame, Target, Activity) for metric card icons.
 *   - App.jsx router — Mounts this component at the '/' route for
 *     authenticated users.
 * =========================================================================
 */

// ======================= IMPORTS =======================
// Core React hooks
import { useState, useEffect } from 'react';
// Supabase client for auth and session retrieval
import { supabase } from '../supabaseClient';
// React Router Link for internal navigation buttons
import { Link } from 'react-router-dom';
// Lucide icons used in the metric cards and heatmap header
import { Flame, Target, Activity, TrendingUp } from 'lucide-react';

// ======================= COMPONENT =======================
/**
 * Home — main authenticated dashboard component.
 *
 * @returns {JSX.Element} A responsive grid layout containing workout/meal
 *          cards, stat metric cards, and a 4-week activity heatmap.
 */
const Home = () => {

  // ======================= STATE & HOOKS =======================

  // Whether the dashboard data is still being fetched
  const [loading, setLoading] = useState(true);

  // Stores any fetch error (currently unused in render, but kept for future use)
  const [error, setError] = useState(null);

  // The full dashboard payload returned by the Flask backend
  const [dashboardData, setDashboardData] = useState(null);

  // The user's first name displayed in the greeting
  const [userName, setUserName] = useState('');

  // Set the page title and fetch data on first render
  useEffect(() => {
    document.title = "Dashboard | Mutaafi";
    fetchDashboardData();
  }, []);

  // ======================= HELPER FUNCTIONS =======================

  /**
   * Fetches all dashboard data from the Flask backend and falls back
   * to hardcoded demo data if the request fails.
   *
   * Workflow:
   *   1. Retrieves the current user and session from Supabase.
   *   2. Calls GET /api/dashboard/:user_id with a Bearer token.
   *   3. On success, stores the response in dashboardData state.
   *   4. On failure, sets fallback demo data so the UI still renders.
   *
   * @returns {Promise<void>}
   *
   * Triggered once on component mount via useEffect.
   */
  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: { session } } = await supabase.auth.getSession();

      setUserName(user.user_metadata?.first_name || 'User');

      // Fetch dynamic dashboard data from Flask backend
      const response = await fetch(`http://127.0.0.1:5000/api/dashboard/${user.id}`, {
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
        }
      });
      const data = await response.json();

      if (response.ok) {
        setDashboardData(data);
      } else {
        throw new Error(data.error || 'Failed to load dashboard data');
      }
    } catch (err) {
      // Fallback dummy data if backend fails/is not populated
      setDashboardData({
        workouts: { total: 8, completed: 6 },
        meals: { total: 6, calories_eaten: 950, protein_eaten: 85 },
        targets: { calories: 2054, protein: 180 },
        streak: 1,
        bmi: 31.1,
        goal_type: 'Cutting',
        weekly_active: 1
      });
    } finally {
      setLoading(false);
    }
  };

  // ======================= LOADING STATE =======================

  // Show a simple loading message while data is being fetched
  if (loading) return <div className="text-center py-10 text-gray-500">Loading dashboard...</div>;

  // ======================= COMPUTED VALUES =======================

  // Shorthand reference to the dashboard payload (or empty object)
  const data = dashboardData || {};

  // Format today's date as a readable string (e.g., "Saturday, December 6")
  const today = new Date();
  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  const formattedDate = today.toLocaleDateString('en-US', dateOptions);

  // Calculate the calorie progress bar percentage (capped at 100%)
  const calPercentage = data.targets?.calories ? Math.min((data.meals?.calories_eaten / data.targets?.calories) * 100, 100) : 0;

  /**
   * Generates a 4-week (28-day) heatmap grid aligned to a
   * Saturday–Friday week (Saudi calendar convention).
   *
   * Each cell contains the date, whether it's in the future, an
   * activity level string ('Full', 'Partial', 'Low', 'Missed'),
   * and the raw day data for the tooltip.
   *
   * @returns {Array<Object>} An array of 28 cell objects for the grid.
   */
  const generateHeatmapGrid = () => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    // Find the upcoming Friday (or today if it's Friday)
    const currentDayOfWeek = todayDate.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    const daysUntilFriday = (5 - currentDayOfWeek + 7) % 7;

    const endFriday = new Date(todayDate);
    endFriday.setDate(todayDate.getDate() + daysUntilFriday);

    // Start date is 27 days before the end Friday (to make 28 days total: 4 weeks * 7 days)
    const startDate = new Date(endFriday);
    startDate.setDate(endFriday.getDate() - 27);

    const grid = [];
    const history = data.activity_history || {};

    let current = new Date(startDate);
    while (current <= endFriday) {
      // Create local YYYY-MM-DD to avoid timezone shifts
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const isFuture = current > todayDate;

      const dayData = history[dateStr] || { workouts_completed: 0, workouts_total: 0, meals_completed: 0, meals_total: 0 };

      // Determine the activity level for colour coding
      let level = 'Missed';
      if (!isFuture) {
        const hasWorkoutPlan = dayData.workouts_total > 0;
        const hasMealPlan = dayData.meals_total > 0;
        const workoutFull = hasWorkoutPlan && dayData.workouts_completed === dayData.workouts_total;
        const mealFull = hasMealPlan && dayData.meals_completed === dayData.meals_total;

        if (workoutFull && mealFull) {
            level = 'Full';
        } else if (workoutFull || mealFull) {
            level = 'Partial';
        } else if (dayData.workouts_completed > 0 || dayData.meals_completed > 0) {
            level = 'Low';
        } else {
            level = 'Missed';
        }
      }

      grid.push({
        date: new Date(current),
        dateStr,
        isFuture,
        level,
        data: dayData
      });
      current.setDate(current.getDate() + 1);
    }
    return grid;
  };

  // Build the heatmap grid and check if the user has any history
  const heatmapGrid = generateHeatmapGrid();
  const hasHistory = data.activity_history && Object.values(data.activity_history).some(d => d.workouts_completed > 0 || d.meals_completed > 0);

  // ======================= RETURN (JSX) =======================
  return (
    <div className="max-w-6xl mx-auto">

      {/* ---------- WELCOME HEADER ---------- */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Welcome back, {userName}!</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-base">Here is your dashboard for <span className="font-semibold text-gray-700 dark:text-gray-300">{formattedDate}</span>.</p>
      </div>

      {/* ---------- TOP CARDS: TODAY'S WORKOUT & MENU ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        {/* Workout Card — links to the Workouts page */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
               <h2 className="text-xl font-bold text-gray-900 dark:text-white">Today's Workout</h2>
               <span className="bg-[#10b981]/10 text-[#10b981] text-xs font-semibold px-2.5 py-1 rounded-full">Active</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1"><span className="font-semibold text-gray-900 dark:text-gray-200">{data.workouts?.total || 0}</span> exercises scheduled.</p>
            <p className="text-sm text-gray-500">Done: {data.workouts?.completed || 0} / {data.workouts?.total || 0}</p>
          </div>
          <div className="mt-8">
            <Link to="/workouts" className="inline-flex justify-center w-auto bg-[#10b981] text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-[#059669] transition-colors shadow-sm">
              Start Workout
            </Link>
          </div>
        </div>

        {/* Menu Card — links to the Meal Plans page */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
           <div>
            <div className="flex justify-between items-start mb-4">
               <h2 className="text-xl font-bold text-gray-900 dark:text-white">Today's Menu</h2>
               <span className="bg-[#10b981]/10 text-[#10b981] text-xs font-semibold px-2.5 py-1 rounded-full">Active</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1"><span className="font-semibold text-gray-900 dark:text-gray-200">{data.meals?.total || 0}</span> meals planned.</p>
            <p className="text-sm text-gray-500">Eaten: {data.meals?.calories_eaten || 0} kcal</p>
          </div>
           <div className="mt-8">
            <Link to="/meal-plans" className="inline-flex justify-center w-auto bg-[#10b981] text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-[#059669] transition-colors shadow-sm">
              Track Meals
            </Link>
          </div>
        </div>
      </div>

      {/* ---------- MIDDLE STATS: CALORIES / GOAL / BMI ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

        {/* Calories Card — progress bar showing eaten vs. target */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
          <div className="flex items-center space-x-3 mb-4">
             <div className="p-2.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl">
                <Flame size={22} />
             </div>
             <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Calories</p>
          </div>
          <div>
             <h3 className="text-2xl font-semibold text-teal-600 dark:text-teal-400 mb-4">{data.meals?.calories_eaten || 0} <span className="text-sm font-normal text-gray-500 dark:text-gray-500">/ {data.targets?.calories || 0} kcal</span></h3>
             <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-2 overflow-hidden">
               <div className="bg-teal-500 dark:bg-teal-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${calPercentage}%` }}></div>
             </div>
             <p className="text-xs text-gray-500 dark:text-gray-500">Protein: {data.meals?.protein_eaten || 0}g / {data.targets?.protein || 0}g</p>
          </div>
        </div>

        {/* Goal Card — displays the user's current fitness goal */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
          <div className="flex items-center space-x-3 mb-4">
             <div className="p-2.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl">
                <Target size={22} />
             </div>
             <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Current Goal</p>
          </div>
          <div>
             <h3 className="text-2xl font-semibold text-teal-600 dark:text-teal-400 mb-2">{data.goal_type || 'Maintenance'}</h3>
             <p className="text-sm text-gray-500 dark:text-gray-500">Stay consistent to see results.</p>
          </div>
        </div>

        {/* BMI Card — displays the user's current BMI value */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
          <div className="flex items-center space-x-3 mb-4">
             <div className="p-2.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl">
                <Activity size={22} />
             </div>
             <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Current BMI</p>
          </div>
          <div>
             <h3 className="text-2xl font-semibold text-teal-600 dark:text-teal-400 mb-2">{data.bmi || 'N/A'}</h3>
             <p className="text-sm text-gray-500 dark:text-gray-500">Healthy range: 18.5 - 24.9</p>
          </div>
        </div>
      </div>

      {/* ---------- 4-WEEK ACTIVITY HEATMAP ---------- */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
             <div className="p-2.5 bg-[#10b981]/10 text-[#10b981] rounded-xl">
                <Activity size={22} />
             </div>
             <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your Consistency</h2>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Last 4 weeks of activity</span>
        </div>

        {/* Heatmap grid section */}
        <div className="relative pt-2">

           {/* Empty-state overlay — shown when user has no activity history */}
           {!hasHistory && (
             <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-[2px] rounded-xl">
               <p className="text-sm text-gray-600 dark:text-gray-300 font-medium bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                 Complete your first workout or meal to start your streak.
               </p>
             </div>
           )}

           <div className="flex items-end space-x-4 overflow-x-auto pb-2">

             {/* Y-axis day labels (Saturday to Friday) */}
             <div className="grid grid-rows-7 gap-1 text-xs text-gray-400 dark:text-gray-500 font-medium text-right pr-2">
               {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                 <div key={day} className="h-[28px] flex items-center justify-end leading-none">{day}</div>
               ))}
             </div>

             {/* Heatmap cells — colour-coded by activity level */}
             <div className="grid grid-rows-7 grid-flow-col gap-1 flex-1">
               {heatmapGrid.map((cell) => (
                 <div
                   key={cell.dateStr}
                   className={`group relative w-[28px] h-[28px] rounded-md transition-all ${
                     cell.isFuture ? 'bg-transparent border border-gray-100 dark:border-gray-800/50' :
                     cell.level === 'Full' ? 'bg-[#10b981]' :
                     cell.level === 'Partial' ? 'bg-[#10b981]/55' :
                     cell.level === 'Low' ? 'bg-[#10b981]/25' :
                     'bg-gray-100 dark:bg-white/[0.06]'
                   }`}
                 >
                   {/* Hover tooltip with day details */}
                   {!cell.isFuture && (
                     <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg whitespace-nowrap">
                       <p className="font-semibold">{cell.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                       <p className="text-gray-300 mt-0.5">
                         {cell.data.workouts_completed}/{cell.data.workouts_total} exercises done, {cell.data.meals_completed}/{cell.data.meals_total} meals logged
                       </p>
                       {/* Triangle pointer */}
                       <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                     </div>
                   )}
                 </div>
               ))}
             </div>
           </div>

           {/* Legend — maps colour intensity to activity level */}
           <div className="flex items-center justify-end mt-4 text-xs text-gray-500 dark:text-gray-400 font-medium space-x-1.5">
             <span>Less</span>
             <div className="w-3.5 h-3.5 rounded-sm bg-gray-100 dark:bg-white/[0.06]"></div>
             <div className="w-3.5 h-3.5 rounded-sm bg-[#10b981]/25"></div>
             <div className="w-3.5 h-3.5 rounded-sm bg-[#10b981]/55"></div>
             <div className="w-3.5 h-3.5 rounded-sm bg-[#10b981]"></div>
             <span className="pl-0.5">More</span>
           </div>
        </div>
      </div>

    </div>
  );
};

// ======================= EXPORT =======================
export default Home;
