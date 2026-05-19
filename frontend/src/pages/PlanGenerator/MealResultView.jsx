/**
 * =========================================================================
 * MealResultView.jsx — Generated Meal Plan Display
 * =========================================================================
 *
 * PURPOSE:
 *   Displays the AI-generated daily meal plan grouped by slot (Breakfast,
 *   Lunch, Snacks, Dinner).  Shows macro totals vs targets with progress
 *   bars.  Users can swap meals, save/rate, and accept the plan.
 *
 * BACKEND CONNECTION:
 *   - POST /api/meal-plan/generate  — Generates a new daily plan.
 *   - POST /api/meal-plan/interact  — Logs eaten interactions on accept.
 *   - POST /api/meal-plan/accept    — Persists the accepted plan.
 *   - supabase.from('user_meal_interactions') — Reads saved/rated state.
 *
 * RELATED COMPONENTS:
 *   - MealCard (../../components/MealCard) — Renders each meal card.
 *   - PlanGenerator.jsx (parent).
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { MealCard } from '../../components/MealCard';

// ======================= CONSTANTS & CONFIG =======================

// Base URL for the Flask backend API
const API = 'http://127.0.0.1:5000';
// Fallback meal image when the original URL is missing
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80';



// ======================= HELPER COMPONENTS =======================

/**
 * SkeletonCard — animated placeholder shown while the plan is loading.
 * @returns {JSX.Element}
 */
const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
    <div className="h-40 bg-gray-200 dark:bg-gray-700"/>
    <div className="p-4 space-y-3">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"/>
      <div className="h-8 bg-gray-100 dark:bg-gray-700/50 rounded"/>
    </div>
  </div>
);

// ======================= COMPONENT =======================
/**
 * MealResultView — renders the generated daily meal plan.
 * @returns {JSX.Element}
 */
const MealResultView = () => {

  // ======================= STATE & HOOKS =======================

  // The full plan object returned by the backend
  const [plan, setPlan] = useState(null);
  // Whether the plan is currently being generated
  const [loading, setLoading] = useState(true);
  // Error message from generation or accept failures
  const [error, setError] = useState(null);
  // The authenticated user's ID
  const [userId, setUserId] = useState(null);
  // Whether the plan has been accepted and saved
  const [accepted, setAccepted] = useState(false);
  // Whether the accept-plan request is in progress
  const [saving, setSaving] = useState(false);
  // Per-meal save/rate state from user_meal_interactions
  const [interactionsMap, setInteractionsMap] = useState({});
  // React Router hook for redirect after accepting
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Please log in to generate a meal plan.'); setLoading(false); return; }
      setUserId(user.id);

      try {
        // Fetch interactions for persistence
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

        const res = await fetch(`${API}/api/meal-plan/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate plan');
        setPlan(data);
      } catch (err) { setError(err.message); }
      setLoading(false);
    };
    init();
  }, []);

  // ======================= EVENT HANDLERS =======================

  /**
   * Replaces a meal slot in the plan and recalculates macro totals.
   *
   * @param {string} slotName — The slot being updated (e.g. 'Breakfast').
   * @param {Object} newMeal  — The replacement meal object.
   */
  const handleMealUpdated = (slotName, newMeal) => {
    setPlan(prev => {
      const newSlots = prev.slots.map(s => s.slot_name === slotName ? { ...s, meal: newMeal } : s);
      const totalCal = newSlots.reduce((sum, s) => sum + ((s.meal?.calories) || 0), 0);
      const totalProt = newSlots.reduce((sum, s) => sum + (parseFloat(s.meal?.protein) || 0), 0);
      const totalFat = newSlots.reduce((sum, s) => sum + (parseFloat(s.meal?.fats) || 0), 0);
      const totalCarbs = newSlots.reduce((sum, s) => sum + (parseFloat(s.meal?.carbs) || 0), 0);
      return { ...prev, slots: newSlots, totals: { calories: totalCal, protein: Math.round(totalProt * 10) / 10, fat: Math.round(totalFat * 10) / 10, carbs: Math.round(totalCarbs * 10) / 10 } };
    });
  };

  /**
   * Logs "eaten" interactions for all meals and saves the accepted
   * plan to the database.  Shows the success confirmation on completion.
   *
   * @returns {Promise<void>}
   * Triggered when the "Accept This Menu" button is clicked.
   */
  const handleAccept = async () => {
    if (!plan || !userId || saving) return;
    setSaving(true);
    
    try {
      // Log individual meal eaten interactions
      for (const slot of plan.slots) {
        if (slot.meal) {
          try {
            await fetch(`${API}/api/meal-plan/interact`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, meal_id: slot.meal.meal_id, action_type: 'eaten' }),
            });
          } catch (err) { /* Silently fail — interaction not critical */ }
        }
      }
      
      // Save to active daily plan
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${API}/api/meal-plan/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          plan_date: today,
          slots: plan.slots
        })
      });
      if (res.ok) {
        setAccepted(true);
      }
    } catch (err) {
      // Silently fail — button remains in unsaved state
    } finally {
      setSaving(false);
    }
  };

  // ======================= RETURN (JSX) =======================

  if (loading) return (
    <div>
      <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl mb-8 animate-pulse"/>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {['Breakfast', 'Lunch', 'Snacks', 'Dinner'].map(s => (
          <div key={s} className="flex flex-col gap-4">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"/>
            <SkeletonCard/>
            {s === 'Snacks' && <SkeletonCard/>}
          </div>
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
      <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
    </div>
  );

  if (!plan) return null;

  // ======================= COMPUTED VALUES =======================

  // Group slots by category for the 4-column layout
  const slotGroups = {};
  plan.slots.forEach(slot => {
    const groupName = slot.slot_name.startsWith('Snack') ? 'Snacks' : slot.slot_name;
    if (!slotGroups[groupName]) slotGroups[groupName] = [];
    slotGroups[groupName].push(slot);
  });

  const calPct = plan.targets.calories > 0 ? Math.round((plan.totals.calories / plan.targets.calories) * 100) : 0;
  const protPct = plan.targets.protein > 0 ? Math.round((plan.totals.protein / plan.targets.protein) * 100) : 0;

  // Compute fat/carbs totals from slots if not present in plan.totals
  const totalFat = plan.totals.fat ?? plan.slots.reduce((sum, s) => sum + (parseFloat(s.meal?.fats) || 0), 0);
  const totalCarbs = plan.totals.carbs ?? plan.slots.reduce((sum, s) => sum + (parseFloat(s.meal?.carbs) || 0), 0);

  return (
    <div>
      {/* Summary Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Your Daily Meal Plan</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">AI-optimized to match your daily targets.</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Calories</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {plan.totals.calories} <span className="text-sm font-normal text-gray-400">/ {plan.targets.calories}</span>
              </p>
              <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${calPct > 105 ? 'bg-red-500' : calPct > 90 ? 'bg-[#108a6e]' : 'bg-amber-500'}`} style={{ width: `${Math.min(calPct, 100)}%` }}/>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Protein</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {plan.totals.protein}g <span className="text-sm font-normal text-gray-400">/ {plan.targets.protein}g</span>
              </p>
              <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${protPct > 105 ? 'bg-red-500' : protPct > 90 ? 'bg-[#108a6e]' : 'bg-amber-500'}`} style={{ width: `${Math.min(protPct, 100)}%` }}/>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Fat</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {Math.round(totalFat)}g
              </p>
              <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                <div className="h-full rounded-full transition-all bg-[#108a6e]" style={{ width: '100%' }}/>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Carbs</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {Math.round(totalCarbs)}g
              </p>
              <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                <div className="h-full rounded-full transition-all bg-[#108a6e]" style={{ width: '100%' }}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meal Slots Grid */}
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
                    onSwap={() => {}} 
                    onMealUpdated={handleMealUpdated}
                    initialSaved={slot.meal && interactionsMap[slot.meal.meal_id] ? interactionsMap[slot.meal.meal_id].saved : false}
                    initialRating={slot.meal && interactionsMap[slot.meal.meal_id] ? interactionsMap[slot.meal.meal_id].rating : 0}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Accept Button */}
      <div className="mt-4 mb-8">
        {accepted ? (
          <div className="bg-[#108a6e]/10 dark:bg-[#19cba3]/10 border border-[#108a6e]/30 dark:border-[#19cba3]/30 rounded-xl p-4 text-center animate-fade-in">
            <p className="text-[#108a6e] dark:text-[#19cba3] font-semibold flex items-center justify-center gap-2 text-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              Your meal plan has been saved successfully!
            </p>
            <button onClick={() => navigate('/meal-plans')} className="mt-3 text-sm text-[#108a6e] dark:text-[#19cba3] underline hover:no-underline font-medium transition-all">
              View Today's Meal Plan →
            </button>
          </div>
        ) : saving ? (
          <button disabled className="w-full bg-[#108a6e] text-white py-3 rounded-xl text-sm font-semibold shadow-sm flex items-center justify-center gap-2.5 cursor-not-allowed opacity-90">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Saving your plan...
          </button>
        ) : (
          <button onClick={handleAccept} className="w-full bg-[#108a6e] hover:bg-[#0c6954] text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            Accept This Menu
          </button>
        )}
      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default MealResultView;
