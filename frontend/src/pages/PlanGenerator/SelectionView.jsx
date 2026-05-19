/**
 * =========================================================================
 * SelectionView.jsx — Plan Type Selection Screen
 * =========================================================================
 *
 * PURPOSE:
 *   Presents two cards (Workout / Meal Plan) so the user can choose
 *   what to generate.  For workouts, includes an AI vs Manual mode
 *   toggle and a day-count selector.
 *
 * BACKEND CONNECTION:
 *   - supabase.from('user_data') — Fetches target_calories, goal_type,
 *     and experience_level to display context and gate generation.
 *
 * RELATED COMPONENTS:
 *   - PlanGenerator.jsx (parent) — Receives callbacks onGenerateWorkout
 *     and onGenerateMeal.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

// ======================= CONSTANTS & CONFIG =======================

// Maps day count to a human-readable workout split label
const SCHEDULE_LABELS = {
  1: 'Full Body',
  2: 'Full Body 2×',
  3: 'UL + Full Body',
  4: 'UL 2×',
  5: 'PPL + UL',
  6: 'PPL 2×',
};

// ======================= COMPONENT =======================
/**
 * SelectionView — workout/meal plan selection with mode toggle.
 *
 * @param {Function} onGenerateWorkout — Callback with { mode, days_available }.
 * @param {Function} onGenerateMeal    — Callback to switch to meal view.
 * @param {string|null} assignedSchedule — Current schedule name, if any.
 * @returns {JSX.Element}
 */
const SelectionView = ({ onGenerateWorkout, onGenerateMeal, assignedSchedule }) => {

  // ======================= STATE & HOOKS =======================

  // User's daily calorie target (shown on the meal card)
  const [targetCalories, setTargetCalories] = useState(null);
  // User's fitness goal (e.g. 'Maintenance', 'Weight Loss')
  const [goalType, setGoalType] = useState('');
  // User's training experience (gates the Generate button)
  const [experienceLevel, setExperienceLevel] = useState('');
  // Workout mode: 'ai' (model decides days) or 'manual' (user picks)
  const [workoutMode, setWorkoutMode] = useState('ai');
  // Number of training days when in manual mode (default 3)
  const [manualDays, setManualDays] = useState(3);

  useEffect(() => {
    const fetchUserTargets = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_data')
            .select('target_calories, goal_type, experience_level')
            .eq('user_id', user.id)
            .single();
          if (data) {
            setTargetCalories(data.target_calories);
            setGoalType(data.goal_type || 'Maintenance');
            setExperienceLevel(data.experience_level || '');
          }
        }
      } catch (err) {
        // Silently fail — defaults will be used
      }
    };
    fetchUserTargets();
  }, []);

  // ======================= EVENT HANDLERS =======================

  /**
   * Calls the parent's onGenerateWorkout with the selected mode and days.
   */
  const handleGenerate = () => {
    onGenerateWorkout({
      mode: workoutMode,
      days_available: workoutMode === 'manual' ? manualDays : null,
    });
  };

  // ======================= RETURN (JSX) =======================
  return (
    <div>
      <p className="text-gray-600 dark:text-gray-400 mb-8">What would you like to generate today?</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Workout Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center text-center transition-transform hover:scale-[1.02]">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Generate Workout</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Get a routine optimized for <strong>{goalType || 'your goal'}</strong>.
          </p>

          {/* Show existing plan badge if assigned */}
          {assignedSchedule && (
            <div className="w-full mb-5 px-4 py-2.5 bg-[#eafff6] dark:bg-[#108a6e]/20 border border-[#a2ecd1] dark:border-[#108a6e]/30 rounded-lg flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-[#108a6e] dark:text-[#19cba3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-sm font-semibold text-[#108a6e] dark:text-[#19cba3]">
                Current: {assignedSchedule}
              </span>
            </div>
          )}

          {/* Missing experience_level warning */}
          {!experienceLevel && (
            <div className="w-full mb-5 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Please set your Training Experience in Profile Settings before generating a workout plan.
              </p>
            </div>
          )}

          {/* ── MODE TOGGLE ── */}
          <div className="w-full mb-5">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 gap-1">
              <button
                onClick={() => setWorkoutMode('ai')}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                  workoutMode === 'ai'
                    ? 'bg-white dark:bg-gray-600 text-[#108a6e] dark:text-[#19cba3] shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  <span>AI Recommended</span>
                </div>
              </button>
              <button
                onClick={() => setWorkoutMode('manual')}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                  workoutMode === 'manual'
                    ? 'bg-white dark:bg-gray-600 text-[#108a6e] dark:text-[#19cba3] shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  <span>Choose My Days</span>
                </div>
              </button>
            </div>

            {/* Mode description */}
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 text-center">
              {workoutMode === 'ai'
                ? 'Let the AI model decide based on your profile'
                : 'Pick how many days you want to train per week'
              }
            </p>
          </div>

          {/* ── MANUAL DAY SELECTOR ── */}
          {workoutMode === 'manual' && (
            <div className="w-full mb-5">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 text-center">
                Days per week
              </label>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map(d => (
                  <button
                    key={d}
                    onClick={() => setManualDays(d)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
                      manualDays === d
                        ? 'bg-[#108a6e] text-white shadow-md shadow-[#108a6e]/25'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 mt-2 font-medium">
                {SCHEDULE_LABELS[manualDays]}
              </p>
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={!experienceLevel}
            className="bg-[#108a6e] hover:bg-[#0c6954] text-white px-8 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assignedSchedule ? 'Regenerate Plan' : 'Generate'}
          </button>
        </div>

        {/* Meal Plan Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center justify-center text-center transition-transform hover:scale-[1.02]">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Generate Meal Plan</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Build a menu matching <strong>{targetCalories ? `${targetCalories} kcal` : 'your targets'}</strong>.
          </p>
          <button 
            onClick={onGenerateMeal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default SelectionView;
