/**
 * =========================================================================
 * MealPlans.jsx — Daily Meal Plan Tracker Page
 * =========================================================================
 *
 * PURPOSE:
 *   Displays the user's active meal plan for today, grouped by meal slot
 *   (Breakfast, Lunch, Snacks, Dinner).  Users can mark individual meals
 *   or the entire day as completed, save/rate meals, and export the plan
 *   as a branded PDF.
 *
 * FEATURE / PAGE:
 *   My Meals — accessible from the sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - GET  /api/meal-plan/active/:user_id  — Fetches today's meal plan.
 *   - POST /api/meal-plan/complete         — Marks the full day complete.
 *   - POST /api/meal-plan/complete-meal    — Toggles one meal slot.
 *   - supabase.from('user_meal_interactions') — Reads saved/rated state.
 *   - supabase.from('user_data')           — Reads calorie/protein targets.
 *
 * RELATED COMPONENTS:
 *   - MealCard (../components/MealCard) — Renders each meal card.
 *   - exportPdf utility (exportMealPlanPdf, loadLogoBase64).
 *   - App.jsx router — Mounts at '/meal-plans'.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { MealCard } from '../components/MealCard';
import { Download } from 'lucide-react';
import { exportMealPlanPdf, loadLogoBase64 } from '../utils/exportPdf';
import logoUrl from '../assets/logo.png';

// ======================= CONSTANTS & CONFIG =======================

// Base URL for the Flask backend API
const API = 'http://127.0.0.1:5000';

// ======================= COMPONENT =======================
/**
 * MealPlans — daily meal tracker with per-slot completion.
 * @returns {JSX.Element}
 */
const MealPlans = () => {

  // ======================= STATE & HOOKS =======================

  // Array of meal objects for today's plan
  const [meals, setMeals] = useState([]);
  // Whether the initial data fetch is in progress
  const [loading, setLoading] = useState(true);
  // Error message from any failed fetch
  const [error, setError] = useState(null);
  // The authenticated user's ID
  const [userId, setUserId] = useState(null);
  // Whether all meals for the day have been completed
  const [isCompleted, setIsCompleted] = useState(false);
  // Per-meal save/rate state from user_meal_interactions
  const [interactionsMap, setInteractionsMap] = useState({});
  // Per-slot completion state: { slot_name: boolean }
  const [completionMap, setCompletionMap] = useState({});
  // User's display name for PDF export
  const [userName, setUserName] = useState('');
  // Calorie/protein targets for the PDF export header
  const [targets, setTargets] = useState({ calories: 0, protein: 0 });
  // Whether a PDF export is in progress
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    document.title = "My Meals | Mutaafi";
    const fetchActivePlan = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Please log in to view your meal plan.'); setLoading(false); return; }
      setUserId(user.id);

      // Get user name from auth metadata
      const firstName = user.user_metadata?.first_name || '';
      const lastName = user.user_metadata?.last_name || '';
      setUserName(`${firstName} ${lastName}`.trim() || 'User');

      // Fetch targets for PDF export
      const { data: userData } = await supabase
        .from('user_data')
        .select('target_calories, target_protein')
        .eq('user_id', user.id)
        .single();
      if (userData) {
        setTargets({
          calories: userData.target_calories || 0,
          protein: userData.target_protein || 0,
        });
      }

      try {
        // 1. Fetch Interactions for Save/Rate state
        const { data: interData } = await supabase
          .from('user_meal_interactions')
          .select('meal_id, action_type, explicit_rating')
          .eq('user_id', user.id);
          
        const imap = {};
        if (interData) {
          interData.forEach(interaction => {
            if (!imap[interaction.meal_id]) imap[interaction.meal_id] = { saved: false, rating: 0 };
            if (interaction.action_type === 'saved') imap[interaction.meal_id].saved = true;
            if (interaction.explicit_rating) imap[interaction.meal_id].rating = interaction.explicit_rating;
          });
        }
        setInteractionsMap(imap);

        // 2. Fetch Active Plan
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const today = new Date().toISOString().split('T')[0];
        
        const res = await fetch(`${API}/api/meal-plan/active/${user.id}?date=${today}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to fetch plan');
        setMeals(data);
        
        if (data && data.length > 0) {
          setIsCompleted(data.every(m => m.is_completed));
          // Build per-meal completion map from DB
          const cmap = {};
          data.forEach(m => {
            cmap[m.slot_name] = m.is_completed || false;
          });
          setCompletionMap(cmap);
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    fetchActivePlan();
  }, []);

  // ======================= EVENT HANDLERS =======================

  /**
   * Marks the entire daily meal plan as completed.
   * @returns {Promise<void>}
   * Triggered when the "Complete Daily Plan" button is clicked.
   */
  const handleComplete = async () => {
    if (!userId) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${API}/api/meal-plan/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, plan_date: today })
      });
      if (res.ok) {
        setIsCompleted(true);
        // Mark all meals as completed in local state
        setCompletionMap(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(k => updated[k] = true);
          return updated;
        });
      }
    } catch (err) {
      // Silently fail — button remains in incomplete state
    }
  };

  /**
   * Toggles a single meal slot between complete and incomplete.
   * Uses optimistic update — reverts on network error.
   *
   * @param {string} slotName — The meal slot (e.g. 'Breakfast', 'Snack 1').
   * @returns {Promise<void>}
   * Triggered when the check button on a MealCard is clicked.
   */
  const handleToggleMealComplete = async (slotName) => {
    const newCompleted = !completionMap[slotName];

    // Optimistic update
    setCompletionMap(prev => ({ ...prev, [slotName]: newCompleted }));

    try {
      const today = new Date().toISOString().split('T')[0];
      await fetch(`${API}/api/meal-plan/complete-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          plan_date: today,
          slot_name: slotName,
          is_completed: newCompleted
        })
      });
      
      // Check if all meals are now completed
      const updatedMap = { ...completionMap, [slotName]: newCompleted };
      const allDone = Object.values(updatedMap).every(v => v);
      setIsCompleted(allDone);
    } catch (err) {
      // Revert on error
      setCompletionMap(prev => ({ ...prev, [slotName]: !newCompleted }));
    }
  };

  /**
   * Exports the current meal plan as a branded PDF document.
   * @returns {Promise<void>}
   * Triggered when the "Export PDF" button is clicked.
   */
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const logo = await loadLogoBase64(logoUrl);
      exportMealPlanPdf({
        userName,
        meals,
        targets,
        logoBase64: logo,
      });
    } catch (err) {
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // ======================= LOADING / ERROR / EMPTY STATES =======================

  if (loading) return <div className="text-center py-10">Loading your active meal plan...</div>;
  if (error) return <div className="text-center text-red-500 py-10">{error}</div>;

  if (meals.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-10 text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">No Active Meal Plan</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8">You haven't accepted a meal plan for today yet.</p>
        <Link to="/plan-generator" className="bg-[#108a6e] hover:bg-[#0c6954] text-white px-6 py-3 rounded-lg font-medium shadow-sm transition-colors">
          Generate Today's Plan
        </Link>
      </div>
    );
  }

  // ======================= COMPUTED VALUES =======================

  // Calculate nutritional totals across all meals
  const totalCal = meals.reduce((sum, m) => sum + (m.nutrition_data?.calories || 0), 0);
  const totalProt = meals.reduce((sum, m) => sum + (parseFloat(m.nutrition_data?.protein) || 0), 0);
  const totalFat = meals.reduce((sum, m) => sum + (parseFloat(m.nutrition_data?.fats) || 0), 0);
  const totalCarbs = meals.reduce((sum, m) => sum + (parseFloat(m.nutrition_data?.carbs) || 0), 0);

  // Group meals by slot category for the 4-column layout
  const slotGroups = {};
  ['Breakfast', 'Lunch', 'Snacks', 'Dinner'].forEach(g => slotGroups[g] = []);
  
  meals.forEach(m => {
    const groupName = m.slot_name.startsWith('Snack') ? 'Snacks' : m.slot_name;
    if (slotGroups[groupName]) {
      // Re-map the structure so MealCard can use it
      slotGroups[groupName].push({
        slot_name: m.slot_name,
        meal: m.nutrition_data
      });
    }
  });

  // ======================= RETURN (JSX) =======================
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#108a6e] dark:text-[#19cba3]">Today's Meal Plan</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review your meals and mark the plan as completed.</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {isCompleted ? (
            <span className="bg-[#eafff6] dark:bg-[#108a6e]/20 text-[#108a6e] dark:text-[#19cba3] font-bold px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              Plan Completed
            </span>
          ) : (
            <button onClick={handleComplete} className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              Complete Daily Plan
            </button>
          )}
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#108a6e] dark:text-[#19cba3] border border-[#108a6e] dark:border-[#19cba3] rounded-lg hover:bg-[#108a6e]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export meal plan as PDF"
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-[#108a6e] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-8 flex gap-8">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Total Calories</p>
          <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{totalCal} kcal</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Total Protein</p>
          <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{Math.round(totalProt * 10) / 10}g</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Fat</p>
          <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{Math.round(totalFat)}g</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Carbs</p>
          <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{Math.round(totalCarbs)}g</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0">
        {['Breakfast', 'Lunch', 'Snacks', 'Dinner'].map((groupName, index) => {
          const slots = slotGroups[groupName];
          const colClasses = `flex flex-col gap-4 ${index !== 0 ? 'lg:border-l lg:border-gray-200 dark:lg:border-gray-700 lg:pl-6' : ''} ${index !== 3 ? 'lg:pr-6' : ''}`;
          
          if (!slots || slots.length === 0) return (
            <div key={groupName} className={colClasses}>
              <h3 className="text-base font-bold text-[#108a6e] dark:text-[#19cba3] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#108a6e] dark:bg-[#19cba3] inline-block"/>
                {groupName}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400 dark:text-gray-500 text-sm h-full flex items-center justify-center">
                None
              </div>
            </div>
          );
          
          return (
            <div key={groupName} className={colClasses}>
              <h3 className="text-base font-bold text-[#108a6e] dark:text-[#19cba3] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#108a6e] dark:bg-[#19cba3] inline-block"/>
                {groupName}
              </h3>
              <div className="flex flex-col gap-4">
                {slots.map((slot, i) => (
                  <MealCard 
                    key={`${slot.slot_name}-${i}`} 
                    slot={slot} 
                    userId={userId} 
                    viewOnly={true} 
                    initialSaved={slot.meal && interactionsMap[slot.meal.meal_id] ? interactionsMap[slot.meal.meal_id].saved : false}
                    initialRating={slot.meal && interactionsMap[slot.meal.meal_id] ? interactionsMap[slot.meal.meal_id].rating : 0}
                    showCompletion={true}
                    isCompleted={completionMap[slot.slot_name] || false}
                    onToggleComplete={() => handleToggleMealComplete(slot.slot_name)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default MealPlans;
