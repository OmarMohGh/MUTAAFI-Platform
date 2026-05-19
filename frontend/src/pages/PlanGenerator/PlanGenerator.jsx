/**
 * =========================================================================
 * PlanGenerator.jsx — AI Plan Generator Container
 * =========================================================================
 *
 * PURPOSE:
 *   Orchestrates the three-step plan generation flow: selection view
 *   (choose workout or meal), workout result view, and meal result view.
 *   Acts as the parent state manager for view routing and workout mode.
 *
 * FEATURE / PAGE:
 *   AI Planner — accessible from the sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - supabase.from('user_data') — Checks for an existing assigned_schedule.
 *
 * RELATED COMPONENTS:
 *   - SelectionView, WorkoutResultView, MealResultView (sibling files).
 *   - App.jsx router — Mounts at '/plan-generator'.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import SelectionView from './SelectionView';
import WorkoutResultView from './WorkoutResultView';
import MealResultView from './MealResultView';

// ======================= COMPONENT =======================
/**
 * PlanGenerator — parent container managing view state for plan generation.
 * @returns {JSX.Element}
 */
const PlanGenerator = () => {

  // ======================= STATE & HOOKS =======================

  // Current view: 'selection' | 'workout' | 'meal'
  const [view, setView] = useState('selection');
  // The user's currently assigned workout schedule (if any)
  const [assignedSchedule, setAssignedSchedule] = useState(null);
  // Whether the initial profile check is still loading
  const [loadingProfile, setLoadingProfile] = useState(true);
  // Workout generation mode: 'ai' or 'manual'
  const [workoutMode, setWorkoutMode] = useState('ai');
  // Number of manual days (only used in manual mode)
  const [workoutDays, setWorkoutDays] = useState(null);

  useEffect(() => {
    document.title = "AI Planner | Mutaafi";
    const checkExistingPlan = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_data')
            .select('assigned_schedule')
            .eq('user_id', user.id)
            .single();
          if (data?.assigned_schedule) {
            setAssignedSchedule(data.assigned_schedule);
          }
        }
      } catch (err) {
        // Silently proceed — user will start fresh
      } finally {
        setLoadingProfile(false);
      }
    };
    checkExistingPlan();
  }, []);

  // ======================= EVENT HANDLERS =======================

  /**
   * Transitions to the workout result view with the chosen mode.
   * @param {{mode: string, days_available: number|null}} opts
   */
  const handleGenerateWorkout = ({ mode, days_available }) => {
    setWorkoutMode(mode);
    setWorkoutDays(days_available);
    setView('workout');
  };

  /** Transitions to the meal result view. */
  const handleGenerateMealPlan = () => {
    setView('meal');
  };

  /** Returns to the selection view. */
  const handleBackToSelection = () => {
    setView('selection');
  };

  // ======================= RETURN (JSX) =======================

  if (loadingProfile) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-[#108a6e] dark:text-[#19cba3] mb-6">AI Plan Generator</h1>
        <div className="text-center py-10 text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#108a6e] dark:text-[#19cba3]">AI Plan Generator</h1>
        {view !== 'selection' && (
          <button 
            onClick={handleBackToSelection}
            className="text-sm font-medium text-gray-500 hover:text-[#108a6e] dark:hover:text-[#19cba3] transition-colors flex items-center"
          >
            &larr; Back to selection
          </button>
        )}
      </div>

      <div className="mt-4">
        {view === 'selection' && (
          <SelectionView 
            onGenerateWorkout={handleGenerateWorkout} 
            onGenerateMeal={handleGenerateMealPlan}
            assignedSchedule={assignedSchedule}
          />
        )}
        {view === 'workout' && (
          <WorkoutResultView mode={workoutMode} daysAvailable={workoutDays} />
        )}
        {view === 'meal' && (
          <MealResultView />
        )}
      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default PlanGenerator;
