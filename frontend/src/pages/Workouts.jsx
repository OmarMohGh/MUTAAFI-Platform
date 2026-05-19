/**
 * =========================================================================
 * Workouts.jsx — Daily Workout Tracker Page
 * =========================================================================
 *
 * PURPOSE:
 *   Displays the user's exercises scheduled for today, lets them log
 *   sets, reps, and weight for each exercise, toggle completion, and
 *   submit the finished workout.  Also supports exporting the full
 *   weekly plan as a branded PDF.
 *
 * FEATURE / PAGE:
 *   My Workouts — accessible from the sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - GET  /api/workout/today/:user_id      — Fetches today's exercises.
 *   - POST /api/workout/complete-exercise   — Toggles one exercise done.
 *   - POST /api/workout/finish              — Saves all exercise data
 *     and marks the day as finished.
 *   - GET  /api/workout/full-plan/:user_id  — Fetches the full weekly
 *     plan for PDF export.
 *
 * RELATED COMPONENTS:
 *   - exportPdf utility (exportWorkoutPdf, loadLogoBase64)
 *   - App.jsx router — Mounts at '/workouts'.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { exportWorkoutPdf, loadLogoBase64 } from '../utils/exportPdf';
import logoUrl from '../assets/logo.png';

// ======================= CONSTANTS & CONFIG =======================

// Fallback image shown when an exercise has no image or the URL is broken
const FALLBACK_IMG = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300&q=80";

// ======================= COMPONENT =======================
/**
 * Workouts — daily workout tracker with per-exercise logging.
 * @returns {JSX.Element}
 */
const Workouts = () => {

  // ======================= STATE & HOOKS =======================

  // List of exercise objects returned by the backend for today
  const [exercises, setExercises] = useState([]);
  // The split type label (e.g., "Push/Pull/Legs")
  const [scheduleType, setScheduleType] = useState('');
  // The muscle-group label for today (e.g., "Push")
  const [dayLabel, setDayLabel] = useState('');
  // Today's date string (YYYY-MM-DD) from the backend
  const [workoutDate, setWorkoutDate] = useState('');
  // Whether the initial data fetch is in progress
  const [loading, setLoading] = useState(true);
  // Error message from any failed fetch
  const [error, setError] = useState(null);
  // Whether the "Finish Workout" submission is in progress
  const [finishing, setFinishing] = useState(false);
  // Per-exercise weight input values keyed by schedule_id
  const [weights, setWeights] = useState({});
  // Per-exercise sets input values keyed by schedule_id
  const [setsMap, setSetsMap] = useState({});
  // Per-exercise reps input values keyed by schedule_id
  const [repsMap, setRepsMap] = useState({});
  // Whether the PDF export is in progress
  const [exporting, setExporting] = useState(false);
  // React Router hook for programmatic navigation
  const navigate = useNavigate();

  // ======================= EVENT HANDLERS =======================

  /**
   * Exports the user's full weekly workout plan as a branded PDF.
   * Fetches the complete plan from the backend, builds the user's
   * display name from auth metadata, and triggers the download.
   *
   * @returns {Promise<void>}
   * Triggered when the "Export PDF" button is clicked.
   */
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const res = await fetch(`http://127.0.0.1:5000/api/workout/full-plan/${user.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch full plan');

      // Get user name from auth metadata
      const firstName = user.user_metadata?.first_name || '';
      const lastName = user.user_metadata?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'User';

      const logo = await loadLogoBase64(logoUrl);
      exportWorkoutPdf({
        userName: fullName,
        scheduleType: data.schedule_type,
        weeklyPlan: data.weekly_plan,
        logoBase64: logo,
      });
    } catch (err) {
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    document.title = "My Workouts | Mutaafi";
    fetchTodaysWorkout();
  }, []);

  /**
   * Fetches today's scheduled exercises from the Flask backend and
   * pre-fills the weight/sets/reps inputs with saved or historical values.
   *
   * Priority for pre-fill: saved value > last session's value > protocol default.
   *
   * @returns {Promise<void>}
   * Triggered once on component mount via useEffect.
   */
  const fetchTodaysWorkout = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const res = await fetch(`http://127.0.0.1:5000/api/workout/today/${user.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch workout');

      setExercises(data.exercises || []);
      setScheduleType(data.schedule_type || '');
      setDayLabel(data.day_label || '');
      setWorkoutDate(data.date || '');

      // Pre-fill weights, sets, reps from saved values or history
      const initialWeights = {};
      const initialSets = {};
      const initialReps = {};
      (data.exercises || []).forEach(ex => {
        // Weight: saved > history > empty
        if (ex.weight_lifted != null) initialWeights[ex.schedule_id] = ex.weight_lifted;
        else if (ex.last_weight != null) initialWeights[ex.schedule_id] = ex.last_weight;
        // Sets: performed > history > protocol default
        if (ex.sets_performed != null) initialSets[ex.schedule_id] = ex.sets_performed;
        else if (ex.last_sets != null) initialSets[ex.schedule_id] = ex.last_sets;
        else if (ex.sets != null) initialSets[ex.schedule_id] = ex.sets;
        // Reps: performed > history > protocol default
        if (ex.reps_performed != null) initialReps[ex.schedule_id] = ex.reps_performed;
        else if (ex.last_reps != null) initialReps[ex.schedule_id] = ex.last_reps;
        else if (ex.reps != null) initialReps[ex.schedule_id] = ex.reps;
      });
      setWeights(initialWeights);
      setSetsMap(initialSets);
      setRepsMap(initialReps);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Updates the weight value for a specific exercise.
   * @param {string} scheduleId — The exercise's schedule ID.
   * @param {string} value      — Raw input string from the number field.
   */
  const handleWeightChange = (scheduleId, value) => {
    const numVal = value === '' ? null : parseFloat(value);
    setWeights(prev => ({ ...prev, [scheduleId]: numVal }));
  };

  /**
   * Updates the sets value for a specific exercise.
   * @param {string} scheduleId — The exercise's schedule ID.
   * @param {string} value      — Raw input string from the number field.
   */
  const handleSetsChange = (scheduleId, value) => {
    const numVal = value === '' ? null : parseInt(value, 10);
    setSetsMap(prev => ({ ...prev, [scheduleId]: numVal }));
  };

  /**
   * Updates the reps value for a specific exercise.
   * @param {string} scheduleId — The exercise's schedule ID.
   * @param {string} value      — Raw input string from the number field.
   */
  const handleRepsChange = (scheduleId, value) => {
    const numVal = value === '' ? null : parseInt(value, 10);
    setRepsMap(prev => ({ ...prev, [scheduleId]: numVal }));
  };

  /**
   * Toggles an exercise between complete and incomplete.
   * Uses optimistic UI update — reverts on network error.
   *
   * @param {string} scheduleId — The exercise's schedule ID.
   * @returns {Promise<void>}
   * Triggered when the circular check button is clicked.
   */
  const handleToggleComplete = async (scheduleId) => {
    const exercise = exercises.find(e => e.schedule_id === scheduleId);
    if (!exercise) return;

    const newCompleted = !exercise.is_completed;

    // Optimistic update
    setExercises(prev => prev.map(ex =>
      ex.schedule_id === scheduleId
        ? { ...ex, is_completed: newCompleted }
        : ex
    ));

    try {
      await fetch('http://127.0.0.1:5000/api/workout/complete-exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: scheduleId,
          is_completed: newCompleted,
          weight_lifted: weights[scheduleId] ?? null,
          sets_performed: setsMap[scheduleId] ?? null,
          reps_performed: repsMap[scheduleId] ?? null,
        }),
      });
    } catch (err) {
      // Revert on error
      setExercises(prev => prev.map(ex =>
        ex.schedule_id === scheduleId
          ? { ...ex, is_completed: !newCompleted }
          : ex
      ));
      // Network error — the optimistic update was already reverted above
    }
  };

  /**
   * Submits all exercise data (weights, sets, reps) and marks the
   * entire workout day as finished.  Navigates to the dashboard on success.
   *
   * @returns {Promise<void>}
   * Triggered when the "Finish Workout" button is clicked.
   */
  const handleFinishWorkout = async () => {
    setFinishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload = exercises.map(ex => ({
        schedule_id: ex.schedule_id,
        weight_lifted: weights[ex.schedule_id] ?? null,
        sets_performed: setsMap[ex.schedule_id] ?? null,
        reps_performed: repsMap[ex.schedule_id] ?? null,
      }));

      const res = await fetch('http://127.0.0.1:5000/api/workout/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, exercises: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to finish workout');

      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setFinishing(false);
    }
  };

  // ======================= COMPUTED VALUES =======================
  const completedCount = exercises.filter(e => e.is_completed).length;
  const totalCount = exercises.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Sort: incomplete first, then completed
  const sortedExercises = [...exercises].sort((a, b) => {
    if (a.is_completed === b.is_completed) return 0;
    return a.is_completed ? 1 : -1;
  });

  /**
   * Formats a YYYY-MM-DD date string into a human-readable form.
   * @param {string} dateStr — Date in YYYY-MM-DD format.
   * @returns {string} e.g. "Saturday, May 17"
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // ======================= RETURN (JSX) =======================

  // ── LOADING STATE ──
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-[#108a6e] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Loading today's workout...</p>
        </div>
      </div>
    );
  }

  // ── ERROR ──
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-xl border border-red-200 dark:border-red-800 mt-8 text-center">
          <p className="font-semibold mb-1">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // ── NO WORKOUT TODAY ──
  if (exercises.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-[#108a6e] dark:text-[#19cba3] mb-2">Today's Workout</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">{formatDate(workoutDate)}</p>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Rest Day</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            No exercises scheduled for today. Rest up and recover — you've earned it!
          </p>
          <div className="flex items-center gap-3 mt-6 justify-center">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#108a6e] dark:text-[#19cba3] border border-[#108a6e] dark:border-[#19cba3] rounded-lg hover:bg-[#108a6e]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export weekly plan as PDF"
            >
              {exporting ? (
                <div className="w-3.5 h-3.5 border-2 border-[#108a6e] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── HEADER ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[#108a6e] dark:text-[#19cba3]">Today's Workout</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {dayLabel && (
                <span className="font-semibold text-gray-700 dark:text-gray-200">{dayLabel} Day</span>
              )}
              {dayLabel && ' · '}
              {formatDate(workoutDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {scheduleType && (
              <span className="px-3 py-1 bg-[#eafff6] dark:bg-[#108a6e]/20 text-[#108a6e] dark:text-[#19cba3] text-xs font-bold rounded-full border border-[#a2ecd1] dark:border-[#108a6e]/30">
                {scheduleType}
              </span>
            )}
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#108a6e] dark:text-[#19cba3] border border-[#108a6e] dark:border-[#19cba3] rounded-lg hover:bg-[#108a6e]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export weekly plan as PDF"
            >
              {exporting ? (
                <div className="w-3.5 h-3.5 border-2 border-[#108a6e] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export PDF
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Progress
            </span>
            <span className="text-xs font-bold text-[#108a6e] dark:text-[#19cba3]">
              {completedCount} / {totalCount} done
            </span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                background: allCompleted
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : 'linear-gradient(90deg, #108a6e, #19cba3)',
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* ── EXERCISE LIST ── */}
      <div className="space-y-3">
        {sortedExercises.map((exercise) => {
          const isCardio = exercise.is_cardio;
          const isDone = exercise.is_completed;
          const imageUrl = exercise.image_url?.trim() ? exercise.image_url : FALLBACK_IMG;

          return (
            <div
              key={exercise.schedule_id}
              className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-300 ${
                isDone
                  ? 'border-green-200 dark:border-green-800/50 opacity-60'
                  : isCardio
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 hover:shadow-md'
                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:shadow-md'
              } ${isDone && isCardio ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : isDone ? 'bg-white dark:bg-gray-800' : ''}`}
            >
              <div className="flex items-stretch">
                {/* Thumbnail */}
                <div className="w-24 h-auto flex-shrink-0 relative overflow-hidden">
                  <img
                    src={imageUrl}
                    alt={exercise.name}
                    className={`w-full h-full object-cover min-h-[96px] ${isDone ? 'grayscale' : ''}`}
                    onError={(e) => { e.target.src = FALLBACK_IMG; }}
                  />
                  {isDone && (
                    <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                      <svg className="w-8 h-8 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-3.5 flex flex-col justify-center min-w-0">
                  <h3 className={`text-sm font-bold mb-0.5 truncate ${isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                    {exercise.name}
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {exercise.muscle_group}
                    {exercise.specific_muscle && ` · ${exercise.specific_muscle}`}
                  </p>
                  {exercise.equipment && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                      <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span className="truncate">{exercise.equipment}</span>
                    </p>
                  )}

                  {/* Sets/Reps or Cardio duration */}
                  <div className="flex items-center gap-3 mt-2">
                    {isCardio ? (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-md">
                        🏃 {exercise.cardio_minutes} min
                      </span>
                    ) : (
                      <>
                        {/* Sets Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={setsMap[exercise.schedule_id] ?? ''}
                            onChange={(e) => handleSetsChange(exercise.schedule_id, e.target.value)}
                            placeholder={exercise.sets ?? '3'}
                            disabled={isDone}
                            className="w-16 px-2 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded text-sm text-center font-medium focus:outline-none focus:ring-1 focus:ring-[#108a6e] dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <span className="text-[10px] text-gray-400 font-semibold">sets</span>
                        </div>
                        <span className="text-gray-300 dark:text-gray-600 text-xs">×</span>
                        {/* Reps Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={repsMap[exercise.schedule_id] ?? ''}
                            onChange={(e) => handleRepsChange(exercise.schedule_id, e.target.value)}
                            placeholder={exercise.reps ?? '12'}
                            disabled={isDone}
                            className="w-16 px-2 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded text-sm text-center font-medium focus:outline-none focus:ring-1 focus:ring-[#108a6e] dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <span className="text-[10px] text-gray-400 font-semibold">reps</span>
                        </div>
                        <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
                        {/* Weight Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={weights[exercise.schedule_id] ?? ''}
                            onChange={(e) => handleWeightChange(exercise.schedule_id, e.target.value)}
                            placeholder="0"
                            disabled={isDone}
                            className="w-20 px-2 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded text-sm text-center font-medium focus:outline-none focus:ring-1 focus:ring-[#108a6e] dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <span className="text-[10px] text-gray-400 font-semibold">kg</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Done Button */}
                <div className="flex items-center pr-4 pl-2">
                  <button
                    onClick={() => handleToggleComplete(exercise.schedule_id)}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                      isDone
                        ? 'bg-green-500 border-green-500 text-white shadow-sm shadow-green-500/30'
                        : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-[#108a6e] hover:bg-[#108a6e]/5'
                    }`}
                    title={isDone ? 'Mark as incomplete' : 'Mark as done'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FINISH BUTTON ── */}
      {allCompleted && (
        <div className="mt-8 mb-4 animate-fade-in">
          <button
            onClick={handleFinishWorkout}
            disabled={finishing}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-green-600/20 hover:shadow-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {finishing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving workout...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Finish Workout
              </>
            )}
          </button>
        </div>
      )}

      {/* Subtle hint when not all done */}
      {!allCompleted && totalCount > 0 && (
        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Complete all exercises to finish your workout
        </p>
      )}
    </div>
  );
};

// ======================= EXPORT =======================
export default Workouts;
