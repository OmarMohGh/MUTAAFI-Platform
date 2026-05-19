/**
 * =========================================================================
 * WorkoutResultView.jsx — Generated Workout Plan Display
 * =========================================================================
 *
 * PURPOSE:
 *   Displays the AI-generated (or manually configured) weekly workout
 *   plan.  Each day shows its exercises as horizontally scrollable cards
 *   with swap, rate, and dislike actions.  The user can review and accept
 *   the plan to save it to the database.
 *
 * BACKEND CONNECTION:
 *   - POST /api/workout/generate-plan  — Generates the weekly plan.
 *   - POST /api/workout/swap-exercise  — Replaces one exercise.
 *   - POST /api/workout/interact       — Logs swap/rate/dislike actions.
 *   - POST /api/workout/accept-plan    — Persists the accepted plan.
 *
 * RELATED COMPONENTS:
 *   - PlanGenerator.jsx (parent) — Passes mode and daysAvailable props.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';

// ======================= CONSTANTS & CONFIG =======================

// Colour classes for each day-label badge (Push, Pull, Legs, etc.)
const LABEL_COLORS = {
  Push:      { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  Pull:      { bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-300',     border: 'border-blue-200 dark:border-blue-800' },
  Legs:      { bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-300',   border: 'border-green-200 dark:border-green-800' },
  Upper:     { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  Lower:     { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800' },
  'Full Body': { bg: 'bg-teal-100 dark:bg-teal-900/30',   text: 'text-teal-700 dark:text-teal-300',     border: 'border-teal-200 dark:border-teal-800' },
  Rest:      { bg: 'bg-gray-100 dark:bg-gray-700/50',     text: 'text-gray-500 dark:text-gray-400',     border: 'border-gray-200 dark:border-gray-700' },
};

// Fallback exercise image when the original URL is missing or broken
const FALLBACK_IMG = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=500&q=80";

// ======================= COMPONENT =======================
/**
 * WorkoutResultView — renders the generated weekly workout plan.
 *
 * @param {string} mode          — 'ai' or 'manual'.
 * @param {number|null} daysAvailable — Manual day count (1–6).
 * @returns {JSX.Element}
 */
const WorkoutResultView = ({ mode = 'ai', daysAvailable = null }) => {

  // ======================= STATE & HOOKS =======================

  // The full plan object returned by the backend
  const [plan, setPlan] = useState(null);
  // Whether the plan is currently being generated
  const [loading, setLoading] = useState(true);
  // Error message from generation or accept failures
  const [error, setError] = useState(null);
  // Composite key of the exercise currently being swapped ("dayIdx-exIdx")
  const [swappingId, setSwappingId] = useState(null);
  // Whether the accept-plan request is in progress
  const [accepting, setAccepting] = useState(false);
  // Exercise ID currently showing the star-rating popup
  const [ratingExId, setRatingExId] = useState(null);
  // Hovered star value in the rating popup
  const [ratingValue, setRatingValue] = useState(0);
  // React Router hook for redirect after accepting
  const navigate = useNavigate();

  useEffect(() => {
    generatePlan();
  }, []);

  // ======================= EVENT HANDLERS =======================

  /**
   * Calls the backend to generate a new weekly workout plan.
   * @returns {Promise<void>}
   * Triggered on mount and when the "Try Again" button is clicked.
   */
  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const body = { user_id: user.id, mode };
      if (mode === 'manual' && daysAvailable) body.days_available = daysAvailable;

      const res = await fetch('http://127.0.0.1:5000/api/workout/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate plan');
      setPlan(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ======================= HELPER FUNCTIONS =======================

  /**
   * Returns all exercise IDs for a given day to prevent duplicates on swap.
   * @param {number} dayIndex — Index into the weekly_plan array.
   * @returns {string[]} Array of exercise IDs.
   */
  const getUsedExerciseIdsForDay = (dayIndex) => {
    if (!plan?.weekly_plan?.[dayIndex]) return [];
    return (plan.weekly_plan[dayIndex].exercises || []).map(ex => ex.exercise_id);
  };

  /**
   * Swaps a single exercise for a different one targeting the same muscle.
   * Uses optimistic UI update and logs the swap interaction.
   *
   * @param {number} dayIndex      — Day index in the weekly plan.
   * @param {number} exerciseIndex — Exercise position within the day.
   * @param {Object} exercise      — The exercise object being replaced.
   * @returns {Promise<void>}
   */
  const handleSwap = async (dayIndex, exerciseIndex, exercise) => {
    const compositeKey = `${dayIndex}-${exerciseIndex}`;
    setSwappingId(compositeKey);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/workout/swap-exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muscle_group: exercise.muscle_group,
          specific_muscle: exercise.specific_muscle,
          experience_level: plan.experience_level,
          equipment_access: plan.equipment_access,
          used_exercise_ids: getUsedExerciseIdsForDay(dayIndex),
        }),
      });
      const data = await res.json();
      if (res.ok && data.new_exercise) {
        // Build the replacement exercise with same sets/reps/cardio info
        const newEx = {
          exercise_id:     data.new_exercise.exercise_id,
          name:            data.new_exercise.name,
          muscle_group:    data.new_exercise.muscle_group || exercise.muscle_group,
          specific_muscle: data.new_exercise.specific_muscle,
          equipment:       data.new_exercise.equipment,
          image_url:       data.new_exercise.image_url,
          video_url:       data.new_exercise.video_url,
          difficulty_level: data.new_exercise.difficulty_level,
          sets:            exercise.sets,
          reps:            exercise.reps,
          is_cardio:       exercise.is_cardio,
          duration_minutes: exercise.duration_minutes,
        };
        // Update the plan state
        setPlan(prev => {
          const updated = { ...prev };
          updated.weekly_plan = [...prev.weekly_plan];
          updated.weekly_plan[dayIndex] = { ...prev.weekly_plan[dayIndex] };
          updated.weekly_plan[dayIndex].exercises = [...prev.weekly_plan[dayIndex].exercises];
          updated.weekly_plan[dayIndex].exercises[exerciseIndex] = newEx;
          return updated;
        });

        // Log swap interaction
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          fetch('http://127.0.0.1:5000/api/workout/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              exercise_id: exercise.exercise_id,
              action_type: 'swapped',
              plan_id: plan.plan_id,
            }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      // Silently fail — exercise remains unchanged
    } finally {
      setSwappingId(null);
    }
  };

  /**
   * Logs a "disliked" interaction for the given exercise.
   * @param {Object} exercise — The exercise being disliked.
   * @returns {Promise<void>}
   */
  const handleDislike = async (exercise) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await fetch('http://127.0.0.1:5000/api/workout/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          exercise_id: exercise.exercise_id,
          action_type: 'disliked',
          plan_id: plan.plan_id,
        }),
      });
    } catch (err) {
      // Silently fail — interaction not critical
    }
  };

  /**
   * Logs a star rating for the given exercise.
   * @param {Object} exercise — The exercise being rated.
   * @param {number} rating   — Star value (1–5).
   * @returns {Promise<void>}
   */
  const handleRate = async (exercise, rating) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await fetch('http://127.0.0.1:5000/api/workout/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          exercise_id: exercise.exercise_id,
          action_type: 'rated',
          explicit_rating: rating,
          plan_id: plan.plan_id,
        }),
      });
      setRatingExId(null);
      setRatingValue(0);
    } catch (err) {
      // Silently fail — rating not critical
    }
  };

  /**
   * Persists the accepted plan to the database and redirects home.
   * @returns {Promise<void>}
   * Triggered when the "Accept this plan" button is clicked.
   */
  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const res = await fetch('http://127.0.0.1:5000/api/workout/accept-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          plan_id: plan.plan_id,
          weekly_plan: plan.weekly_plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept plan');
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  // ======================= RETURN (JSX) =======================

  // ── LOADING STATE ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-[#108a6e] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Generating your workout plan...</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Analyzing your profile with AI</p>
      </div>
    );
  }

  // ── ERROR STATE ──
  if (error) {
    return (
      <div className="text-center py-20">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-xl border border-red-200 dark:border-red-800 max-w-md mx-auto">
          <p className="font-semibold mb-2">Failed to generate plan</p>
          <p className="text-sm">{error}</p>
          <button onClick={generatePlan} className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const { schedule_type, confidence, experience_level, equipment_access, weekly_plan } = plan;

  return (
    <div className="w-full">
      {/* ── HEADER ── */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Your weekly workout plan</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span className="font-semibold text-[#108a6e] dark:text-[#19cba3]">{schedule_type}</span>
              {plan?.plan_mode === 'manual' ? (
                <span className="text-gray-400"> · Custom Plan</span>
              ) : (
                <>
                  {' '}· AI-optimized for your goals
                  {confidence && <span className="text-gray-400"> · {Math.round(confidence * 100)}% confidence</span>}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold border border-purple-200 dark:border-purple-800">
              {experience_level}
            </span>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold border border-blue-200 dark:border-blue-800 capitalize">
              {equipment_access}
            </span>
          </div>
        </div>
      </div>

      {/* ── WEEKLY PLAN ROWS ── */}
      <div className="space-y-4">
        {weekly_plan.map((day, dayIndex) => {
          const colors = LABEL_COLORS[day.day_label] || LABEL_COLORS.Rest;

          return (
            <div key={dayIndex} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              {/* Day Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-200 w-24">{day.day_name}</span>
                  <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
                    {day.day_label}
                  </span>
                </div>
                {!day.is_rest && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {day.exercises?.length || 0} exercises
                  </span>
                )}
              </div>

              {/* Day Content */}
              {day.is_rest ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-gray-400 dark:text-gray-500 text-sm">
                    No workout scheduled · Recovery is part of the plan
                  </p>
                </div>
              ) : (
                <div className="p-4 overflow-x-auto">
                  <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
                    {(day.exercises || []).map((exercise, exIndex) => {
                      const compositeKey = `${dayIndex}-${exIndex}`;
                      const isSwapping = swappingId === compositeKey;
                      const isCardio = exercise.is_cardio;
                      const imageUrl = exercise.image_url?.trim() ? exercise.image_url : FALLBACK_IMG;
                      const isRatingThis = ratingExId === exercise.exercise_id;

                      return (
                        <div
                          key={compositeKey}
                          className={`flex-shrink-0 w-52 rounded-xl overflow-hidden shadow-sm border flex flex-col transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${
                            isCardio
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                              : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                          }`}
                        >
                          {/* Image */}
                          <div className="h-32 w-full overflow-hidden relative">
                            <img
                              src={imageUrl}
                              alt={exercise.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.src = FALLBACK_IMG; }}
                            />
                            <span className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-md font-medium">
                              {exercise.muscle_group}
                            </span>
                          </div>

                          {/* Card Body */}
                          <div className="p-3 flex flex-col flex-grow">
                            <h4 className="text-xs font-bold text-gray-800 dark:text-gray-100 line-clamp-2 mb-1.5">
                              {exercise.name}
                            </h4>

                            {/* Equipment */}
                            {exercise.equipment && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-2">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                {exercise.equipment}
                              </p>
                            )}

                            {/* Sets × Reps or Duration */}
                            {isCardio ? (
                              <div className="bg-emerald-100 dark:bg-emerald-800/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-1.5 rounded-lg text-xs font-bold text-center">
                                🏃 {exercise.duration_minutes} min
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2.5 py-1.5 rounded-lg text-xs font-bold text-center">
                                  {exercise.sets} sets × {exercise.reps} reps
                                </div>
                                {/* Weight Input */}
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    placeholder="0"
                                    min="0"
                                    className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#108a6e] dark:text-gray-100"
                                  />
                                  <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">kg</span>
                                </div>
                              </div>
                            )}

                            {/* Card Actions */}
                            <div className="mt-auto pt-2.5 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 gap-1">
                              {/* Rate */}
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    setRatingExId(isRatingThis ? null : exercise.exercise_id);
                                    setRatingValue(0);
                                  }}
                                  className="p-1.5 rounded-md hover:bg-yellow-50 dark:hover:bg-yellow-900/20 text-gray-400 hover:text-yellow-500 transition-colors"
                                  title="Rate"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                </button>
                                {isRatingThis && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 flex gap-0.5 z-50">
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <button
                                        key={star}
                                        onClick={() => handleRate(exercise, star)}
                                        onMouseEnter={() => setRatingValue(star)}
                                        onMouseLeave={() => setRatingValue(0)}
                                        className="p-0.5"
                                      >
                                        <svg className={`w-4 h-4 transition-colors ${star <= ratingValue ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600 fill-none'}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                        </svg>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Swap */}
                              <button
                                onClick={() => handleSwap(dayIndex, exIndex, exercise)}
                                disabled={isSwapping}
                                className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"
                                title="Swap"
                              >
                                {isSwapping ? (
                                  <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                )}
                              </button>

                              {/* Dislike */}
                              <button
                                onClick={() => handleDislike(exercise)}
                                className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                                title="Dislike"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── ACCEPT BUTTON ── */}
      <div className="mt-8 mb-4">
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full bg-[#108a6e] hover:bg-[#0c6954] text-white py-3.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-[#108a6e]/20 hover:shadow-[#108a6e]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {accepting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Saving your plan...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Accept this plan
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default WorkoutResultView;
