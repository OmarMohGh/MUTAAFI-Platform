/**
 * =========================================================================
 * Gallery.jsx — Explore Library (Workouts & Meals)
 * =========================================================================
 *
 * PURPOSE:
 *   A dual-gallery page that lets users browse the full exercise and meal
 *   databases.  Features fuzzy search (Levenshtein distance), muscle-group
 *   and calorie filters, tag-based filtering with autocomplete, a
 *   save/unsave bookmark feature for meals, and allergen safety warnings
 *   personalised to the logged-in user.
 *
 * FEATURE / PAGE:
 *   Explore — accessible from the sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - GET  /api/gallery/workouts   — Returns all exercises.
 *   - GET  /api/gallery/meals      — Returns all meals with nutrition.
 *   - GET  /api/meal-plan/interactions/:user_id — Saved meal IDs.
 *   - POST /api/meal-plan/interact — Saves/unsaves a meal.
 *   - supabase.from('user_data')   — Reads the user's allergies.
 *
 * RELATED COMPONENTS:
 *   - App.jsx router — Mounts at '/gallery'.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// ======================= HELPER FUNCTIONS =======================

/**
 * Computes the Levenshtein edit distance between two strings.
 * Used by fuzzyMatch to tolerate minor typos in search queries.
 *
 * @param {string} a — First string.
 * @param {string} b — Second string.
 * @returns {number} The edit distance.
 */
const levenshtein = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const fuzzyMatch = (text, query) => {
  if (!text || !query) return false;
  const t = String(text).toLowerCase();
  const q = String(query).toLowerCase();
  if (t.includes(q)) return true;
  
  // Simple Levenshtein for minor typos
  const distance = levenshtein(q, t);
  if (q.length <= 4 && distance <= 1) return true;
  if (q.length > 4 && distance <= 2) return true;
  
  // Also check word by word in case query is a single word matching part of a multi-word string
  const words = t.split(/[\s-]+/);
  for (let word of words) {
    if (word.length > 3) {
      const d = levenshtein(q, word);
      if (d <= 1) return true;
      if (q.length > 4 && d <= 2) return true;
    }
  }
  
  return false;
};

/**
 * Normalises a tag string: merges common variants (e.g. "high protein",
 * "high-protein") into a single canonical form and title-cases the result.
 *
 * @param {string} tag — Raw tag string from the database.
 * @returns {string} Normalised, title-cased tag.
 */
const normalizeTag = (tag) => {
  if (!tag) return '';
  const t = String(tag).toLowerCase().trim();
  if (t === 'high protein' || t === 'high-protein' || t === 'high-protein-diet') return 'High Protein';
  if (t === 'low carb' || t === 'low-carb' || t === 'low-carb-diet') return 'Low Carb';
  if (t === 'air fryer' || t === 'air-fryer' || t === 'airfryer') return 'Air-Fryer';
  // Capitalize first letter of each word
  return t.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

/**
 * Safely converts a value to an array.  Handles null, arrays, and
 * comma-separated strings from the database.
 *
 * @param {*} val — The value to convert.
 * @returns {string[]} A clean array of strings.
 */
const safeArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

// ======================= COMPONENT =======================
/**
 * Gallery — dual-gallery page for browsing exercises and meals.
 * @returns {JSX.Element}
 */
const Gallery = () => {

  // ======================= STATE & HOOKS =======================

  // Current view: 'selection' | 'workouts' | 'meals'
  const [view, setView] = useState('selection');
  // Array of items (exercises or meals) fetched from the backend
  const [items, setItems] = useState([]);
  // Whether the gallery data is being fetched
  const [loading, setLoading] = useState(false);
  // Error message from any failed fetch
  const [error, setError] = useState(null);
  // Current user's allergy list (lowercased)
  const [userAllergies, setUserAllergies] = useState([]);

  // ── Common Filter States ──
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // ── Workout Filter States ──
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');
  const [isHomeWorkout, setIsHomeWorkout] = useState(false);

  // ── Meal Filter States ──
  const [maxCalories, setMaxCalories] = useState(2000);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  // Array of meal_ids the user has bookmarked
  const [savedMeals, setSavedMeals] = useState([]);

  // ======================= CONSTANTS & CONFIG =======================

  // Fallback images when the database URL is missing or empty
  const FALLBACK_WORKOUT_IMG = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=500&q=80";
  const FALLBACK_MEAL_IMG = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80";

  // Fetch the user's allergies on mount for allergen warnings
  useEffect(() => {
    document.title = "Explore | Mutaafi";
    const fetchUserAllergies = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('user_data')
            .select('allergies')
            .eq('user_id', user.id)
            .single();
            
          if (data && data.allergies) {
            const parsed = safeArray(data.allergies);
            setUserAllergies(parsed.map(a => String(a).toLowerCase().trim()));
          }
        }
      } catch (err) {
        // Silently fail — allergen warnings won't show
      }
    };
    fetchUserAllergies();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // ======================= EVENT HANDLERS =======================

  /**
   * Fetches gallery data (exercises or meals) from the Flask backend
   * and transitions to the appropriate view.
   *
   * @param {'workouts'|'meals'} type — Which gallery to load.
   * @returns {Promise<void>}
   * Triggered when the user clicks a gallery card on the selection screen.
   */
  const fetchGalleryData = async (type) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = type === 'workouts' ? '/api/gallery/workouts' : '/api/gallery/meals';
      const response = await fetch(`http://127.0.0.1:5000${endpoint}`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to load gallery');
      
      setItems(data);
      setView(type);
      
      // Reset common filters
      setSearchTerm('');

      if (type === 'workouts') {
        setSelectedMuscleGroup('All');
        setIsHomeWorkout(false);
      } else {
        const maxCals = data.length > 0 ? Math.max(...data.map(i => i.calories || 0)) : 2000;
        setMaxCalories(maxCals);
        setSelectedTags([]);
        setTagSearchTerm('');
        setShowSavedOnly(false);
        
        // Fetch saved meals bypassing RLS
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            const interRes = await fetch(`http://127.0.0.1:5000/api/meal-plan/interactions/${user.id}?action_type=saved`);
            if (interRes.ok) {
              const interData = await interRes.json();
              if (interData) {
                setSavedMeals(interData.map(i => i.meal_id));
              }
            }
          } catch (err) {
            // Silently fail — saved state won't be shown
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Renders the initial selection screen with Workouts and Meals cards.
   * @returns {JSX.Element}
   */
  const renderSelection = () => (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold text-[#2a3441] dark:text-gray-100 mb-10">What would you like to see?</h2>
      
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-3xl px-4">
        {/* Workouts Card */}
        <button 
          onClick={() => fetchGalleryData('workouts')}
          className="flex-1 bg-white dark:bg-gray-800 rounded-2xl p-10 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-[#108a6e] dark:hover:border-[#19cba3] transition-all group text-center flex flex-col items-center justify-center min-h-[200px]"
        >
          <h3 className="text-xl font-bold text-[#108a6e] dark:text-[#19cba3] mb-2">Workouts</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">View exercise library</p>
        </button>

        {/* Healthy Meals Card */}
        <button 
          onClick={() => fetchGalleryData('meals')}
          className="flex-1 bg-white dark:bg-gray-800 rounded-2xl p-10 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-[#108a6e] dark:hover:border-[#19cba3] transition-all group text-center flex flex-col items-center justify-center min-h-[200px]"
        >
          <h3 className="text-xl font-bold text-[#108a6e] dark:text-[#19cba3] mb-2">Healthy Meals</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">View nutrition ideas</p>
        </button>
      </div>
    </div>
  );

  /**
   * Renders the filtered grid view for either workouts or meals,
   * including the filter toolbar and all gallery cards.
   * @returns {JSX.Element}
   */
  const renderGrid = () => {
    const isWorkouts = view === 'workouts';
    
    // Unique Data for Filters
    const uniqueMuscleGroups = isWorkouts 
      ? ['All', ...new Set(items.map(item => item.muscle_group).filter(Boolean))]
      : [];
      
    const uniqueTags = !isWorkouts
      ? [...new Set(items.flatMap(item => safeArray(item.tags).map(normalizeTag)))].sort()
      : [];
      
    const minCalories = !isWorkouts && items.length > 0 ? Math.min(...items.map(i => i.calories || 0)) : 0;
    const absMaxCalories = !isWorkouts && items.length > 0 ? Math.max(...items.map(i => i.calories || 0)) : 2000;

    // Filter Items
    const filteredItems = items.filter(item => {
      if (isWorkouts) {
        // --- WORKOUT FILTERS ---
        // 1. Muscle Group Filter
        if (selectedMuscleGroup !== 'All' && item.muscle_group !== selectedMuscleGroup) {
          return false;
        }

        // 2. Home Workout Filter
        if (isHomeWorkout && item.gym !== false) {
          return false;
        }

        // 3. Fuzzy Search Filter
        if (debouncedSearchTerm) {
          const nameMatch = fuzzyMatch(item.name || '', debouncedSearchTerm);
          const muscleMatch = fuzzyMatch(item.muscle_group || '', debouncedSearchTerm);
          const equipmentMatch = fuzzyMatch(item.equipment || '', debouncedSearchTerm);
          if (!nameMatch && !muscleMatch && !equipmentMatch) {
            return false;
          }
        }
      } else {
        // --- MEALS FILTERS ---
        // 1. Calorie Filter
        if ((item.calories || 0) > maxCalories) {
          return false;
        }

        // 2. Saved Meals Filter
        if (showSavedOnly && !savedMeals.includes(item.meal_id)) {
          return false;
        }

        const tagsArr = safeArray(item.tags);

        // 2. Tag Filter (OR Logic)
        if (selectedTags.length > 0) {
          const itemNormalizedTags = tagsArr.map(normalizeTag);
          const hasTag = selectedTags.some(tag => itemNormalizedTags.includes(tag));
          if (!hasTag) return false;
        }

        // 3. Fuzzy Search Filter
        if (debouncedSearchTerm) {
          const nameMatch = fuzzyMatch(item.meal_name || '', debouncedSearchTerm);
          const ingredientsMatch = fuzzyMatch(item.ingredients || '', debouncedSearchTerm);
          const tagsMatch = tagsArr.some(tag => fuzzyMatch(tag, debouncedSearchTerm));
          
          if (!nameMatch && !ingredientsMatch && !tagsMatch) {
            return false;
          }
        }
      }

      return true;
    });

    const resetFilters = () => {
      setSearchTerm('');
      if (isWorkouts) {
        setSelectedMuscleGroup('All');
        setIsHomeWorkout(false);
      } else {
        setMaxCalories(absMaxCalories);
        setSelectedTags([]);
        setTagSearchTerm('');
        setShowSavedOnly(false);
      }
    };

    // Calculate active filter count for meals
    let activeFilterCount = 0;
    if (!isWorkouts) {
      if (searchTerm) activeFilterCount++;
      if (maxCalories < absMaxCalories) activeFilterCount++;
      if (showSavedOnly) activeFilterCount++;
      activeFilterCount += selectedTags.length;
    }

    return (
      <div className="w-full">
        <button 
          onClick={() => { setView('selection'); setItems([]); }}
          className="mb-6 px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium transition-colors border border-gray-300 dark:border-gray-600 shadow-sm"
        >
          &larr; Back to Selection
        </button>
        
        <h2 className="text-2xl font-bold text-[#2a3441] dark:text-gray-100 mb-6">
          {isWorkouts ? 'Workouts Library' : 'Meals Library'}
        </h2>

        {/* Filters Header (Only for Workouts) */}
        {isWorkouts && items.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="w-full md:w-1/3 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <input 
                type="text" 
                placeholder="Search by name, muscle, or equipment..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#108a6e] dark:focus:ring-[#19cba3] outline-none dark:bg-gray-700 dark:text-white transition-shadow text-sm"
              />
            </div>

            {/* Dropdown */}
            <div className="w-full md:w-1/4">
              <select 
                value={selectedMuscleGroup}
                onChange={(e) => setSelectedMuscleGroup(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#108a6e] dark:focus:ring-[#19cba3] outline-none dark:bg-gray-700 dark:text-white transition-shadow text-sm cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_1rem_center] bg-no-repeat"
              >
                {uniqueMuscleGroups.map(mg => (
                  <option key={mg} value={mg}>{mg === 'All' ? 'All Muscle Groups' : mg}</option>
                ))}
              </select>
            </div>

            {/* Home Workout Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Home Workout</span>
              <button 
                onClick={() => setIsHomeWorkout(!isHomeWorkout)}
                className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none shadow-inner ${isHomeWorkout ? 'bg-[#108a6e] dark:bg-[#19cba3]' : 'bg-gray-300 dark:bg-gray-600'}`}
                aria-label="Toggle Home Workout"
              >
                <span className={`absolute top-1 bg-white w-4 h-4 rounded-full transition-all shadow ${isHomeWorkout ? 'left-7' : 'left-1'}`}></span>
              </button>
            </div>

            {/* Reset Button */}
            <div>
              <button 
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors text-sm border border-gray-200 dark:border-gray-600 shadow-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Filters Header (Only for Meals) */}
        {!isWorkouts && items.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8 flex flex-col gap-4">
            
            {/* Top Row: Search Meals, Max Calories, Clear All */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Search Meals */}
              <div className="w-full md:w-2/5 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input 
                  type="text" 
                  placeholder="Search meals or ingredients..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#108a6e] dark:focus:ring-[#19cba3] outline-none dark:bg-gray-700 dark:text-white transition-shadow text-sm"
                />
              </div>

              {/* Calorie Slider */}
              <div className="w-full md:w-2/5 flex flex-col justify-center px-2">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span className="font-medium">Max Calories</span>
                  <span className="font-bold text-[#108a6e] dark:text-[#19cba3] bg-[#108a6e]/10 px-2 py-0.5 rounded-full">{maxCalories} kcal</span>
                </div>
                <input 
                  type="range" 
                  min={minCalories}
                  max={absMaxCalories}
                  value={maxCalories}
                  onChange={(e) => setMaxCalories(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-[#108a6e]"
                />
              </div>

              {/* Reset Button */}
              <div className="w-full md:w-1/5 flex justify-end">
                <button 
                  onClick={resetFilters}
                  className="px-4 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors text-sm border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center gap-2 w-full md:w-auto"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Clear All {activeFilterCount > 0 && `(${activeFilterCount})`}
                </button>
              </div>
            </div>

            {/* Bottom Row: Searchable Tag Input & Active Chips */}
            <div className="flex flex-col gap-3 mt-2 border-t border-gray-100 dark:border-gray-700 pt-4">
              
              <div className="flex flex-col md:flex-row gap-4">
                {/* Searchable Tag Input */}
                <div className="w-full md:w-1/3 relative">
                  <input 
                    type="text" 
                    placeholder="Search and add tags..." 
                    value={tagSearchTerm}
                    onChange={(e) => {
                      setTagSearchTerm(e.target.value);
                      setShowTagSuggestions(true);
                    }}
                    onFocus={() => setShowTagSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#108a6e] dark:focus:ring-[#19cba3] outline-none dark:bg-gray-700 dark:text-white transition-shadow text-sm"
                  />
                  {/* Suggestions Dropdown */}
                  {showTagSuggestions && tagSearchTerm && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {uniqueTags
                        .filter(t => t.toLowerCase().includes(tagSearchTerm.toLowerCase()) && !selectedTags.includes(t))
                        .map(tag => (
                          <div 
                            key={tag}
                            onClick={() => {
                              setSelectedTags([...selectedTags, tag]);
                              setTagSearchTerm('');
                              setShowTagSuggestions(false);
                            }}
                            className="px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300"
                          >
                            {tag}
                          </div>
                      ))}
                      {uniqueTags.filter(t => t.toLowerCase().includes(tagSearchTerm.toLowerCase()) && !selectedTags.includes(t)).length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">No matching tags</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Active Tag Chips */}
                <div className="w-full md:w-2/3 flex flex-wrap gap-2 items-center">
                  {selectedTags.length > 0 ? (
                    selectedTags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-[#108a6e]/10 text-[#108a6e] dark:bg-[#19cba3]/20 dark:text-[#19cba3] rounded-full text-sm font-medium border border-[#108a6e]/20 dark:border-[#19cba3]/30">
                        {tag}
                        <button 
                          onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                          className="hover:text-red-500 transition-colors focus:outline-none"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-gray-500 italic">No tags selected</span>
                  )}
                </div>
              </div>

              {/* Goal-Based Shortcuts and Saved Meals Toggle */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider mr-2">Quick Actions:</span>
                  {['High Protein', 'Low Carb', 'Air-Fryer'].map(shortcut => (
                    <button
                      key={shortcut}
                      onClick={() => {
                        if (!selectedTags.includes(shortcut)) {
                          setSelectedTags([...selectedTags, shortcut]);
                        }
                      }}
                      className="px-3 py-2.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors min-h-[44px] flex items-center"
                    >
                      + {shortcut}
                    </button>
                  ))}
                  <button
                      onClick={() => setMaxCalories(500)}
                      className="px-3 py-2.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors min-h-[44px] flex items-center"
                    >
                      + Under 500 kcal
                  </button>
                </div>
                
                {/* Saved Meals Toggle */}
                <div className="flex items-center">
                  <button
                    onClick={() => setShowSavedOnly(!showSavedOnly)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border shadow-sm ${showSavedOnly ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'}`}
                  >
                    <svg className={`w-4 h-4 ${showSavedOnly ? 'text-blue-600 dark:text-blue-400 fill-blue-600 dark:fill-blue-400' : 'text-gray-500 dark:text-gray-400 fill-none'}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                    Saved Meals
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading {view}...</div>
        ) : error ? (
          <div className="text-center py-20 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            No {view} found in the database.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center">
            <svg className="w-16 h-16 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="mb-6 text-lg font-medium">No {isWorkouts ? 'exercises' : 'meals'} match your search criteria.</p>
            <button 
              onClick={resetFilters}
              className="px-6 py-2.5 bg-[#108a6e] hover:bg-[#0c6b56] text-white rounded-lg transition-colors shadow-sm font-medium"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredItems.map((item, index) => {
              // Workout mapping depends on exercise_id, meal on meal_id
              const key = isWorkouts ? item.exercise_id : item.meal_id;
              const title = isWorkouts ? item.name : item.meal_name;
              const fallback = isWorkouts ? FALLBACK_WORKOUT_IMG : FALLBACK_MEAL_IMG;
              // Some db rows might have 'image_url', check if valid
              const imageUrl = (item.image_url && typeof item.image_url === 'string' && item.image_url.trim().length > 0) ? item.image_url : fallback;
              
              // Safe Array Parsing for tags and allergies
              const safeItemTags = safeArray(item.tags);
              const safeItemAllergies = !isWorkouts ? safeArray(item.allergies) : [];
              const safeUserAllergies = Array.isArray(userAllergies) ? userAllergies : [];
              
              // Check if meal has dangerous allergens for current user
              const dangerousAllergens = safeItemAllergies.filter(a => safeUserAllergies.includes(String(a).toLowerCase().trim()));
              const isNotRecommended = dangerousAllergens.length > 0;

              return (
                <div key={key || index} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col hover:shadow-md transition-all duration-300 group hover:-translate-y-1 relative">
                  
                  {/* Warning Overlay */}
                  {isNotRecommended && (
                    <div className="absolute inset-0 bg-red-900/30 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                      <div className="bg-white/95 dark:bg-gray-900/95 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 shadow-lg border border-red-200 dark:border-red-900/50">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Not Recommended
                      </div>
                    </div>
                  )}

                  {/* Save Button for Meals */}
                  {!isWorkouts && (
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;
                        
                        const isSaved = savedMeals.includes(item.meal_id);
                        if (isSaved) {
                          setSavedMeals(prev => prev.filter(id => id !== item.meal_id));
                          await fetch(`http://127.0.0.1:5000/api/meal-plan/interact`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: user.id, meal_id: item.meal_id, action_type: 'unsaved' }),
                          });
                        } else {
                          setSavedMeals(prev => [...prev, item.meal_id]);
                          await fetch(`http://127.0.0.1:5000/api/meal-plan/interact`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: user.id, meal_id: item.meal_id, action_type: 'saved' }),
                          });
                        }
                      }}
                      className="absolute top-2 left-2 z-20 p-3 min-w-[44px] min-h-[44px] rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors flex items-center justify-center"
                      title={savedMeals.includes(item.meal_id) ? 'Unsave' : 'Save'}
                    >
                      <svg className={`w-4 h-4 transition-colors ${savedMeals.includes(item.meal_id) ? 'text-yellow-400 fill-yellow-400' : 'text-white fill-none'}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                      </svg>
                    </button>
                  )}

                  <div className="h-40 w-full overflow-hidden bg-gray-100 dark:bg-gray-700 relative">
                    <img 
                      src={imageUrl} 
                      alt={title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { e.target.src = fallback; }}
                    />
                    
                    {/* Optional labels for context */}
                    {isWorkouts && item.muscle_group && (
                      <span className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-md font-medium shadow-sm">
                        {item.muscle_group}
                      </span>
                    )}
                    
                    {/* Meal Quick Info Badge */}
                    {!isWorkouts && (
                      <div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end">
                        <span className="bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-semibold shadow-sm flex items-center gap-1">
                          <svg className="w-3 h-3 text-[#19cba3]" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" /></svg>
                          {item.calories} kcal
                        </span>
                        <span className="bg-[#108a6e]/90 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-semibold shadow-sm">
                          {item.protein}g P
                        </span>
                        <span className="backdrop-blur-sm text-xs px-2 py-1 rounded-md font-semibold shadow-sm" style={{ backgroundColor: '#F5C518', color: '#2a2a2a' }}>
                          {item.fats}g F
                        </span>
                        <span className="backdrop-blur-sm text-xs px-2 py-1 rounded-md font-semibold shadow-sm" style={{ backgroundColor: '#F5E6C8', color: '#2a2a2a' }}>
                          {item.carbs}g C
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="text-sm font-bold text-[#2a3441] dark:text-gray-100 break-words line-clamp-2">{title}</h3>
                    
                    {/* Workout Equipment */}
                    {isWorkouts && item.equipment && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5 font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {item.equipment}
                      </p>
                    )}

                    {/* Meal Ingredients Preview (if tags not available and no allergies) */}
                    {!isWorkouts && safeItemTags.length > 0 && safeItemAllergies.length === 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {safeItemTags.map(normalizeTag).slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded">
                            {tag}
                          </span>
                        ))}
                        {safeItemTags.length > 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 text-gray-400">+{safeItemTags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Allergies Section */}
                    {!isWorkouts && safeItemAllergies.length > 0 && (
                      <div className="mt-auto pt-3 flex flex-wrap gap-1.5 items-center justify-start z-20">
                        <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mr-1">Allergens:</span>
                        {safeItemAllergies.map(allergy => {
                          const aLower = String(allergy).toLowerCase();
                          let IconContent = null;
                          
                          // Minimalist Icons based on allergy
                          if (aLower.includes('dairy') || aLower.includes('milk')) {
                            IconContent = <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2h8M9 2v2.789a4 4 0 01-.672 2.223l-2.468 3.7A4 4 0 005.188 13H5v7a2 2 0 002 2h10a2 2 0 002-2v-7h-.188a4 4 0 00-.672-2.288l-2.468-3.7A4 4 0 0115 4.789V2"/></svg>;
                          } else if (aLower.includes('gluten') || aLower.includes('wheat')) {
                            IconContent = <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22l10-10M12 12A3 3 0 009 9M12 12a3 3 0 013 3M15 15a3 3 0 003 3M9 9a3 3 0 01-3-3M6 6a3 3 0 00-3-3M18 18a3 3 0 013 3M12 12l-4-4M12 12l4 4"/></svg>;
                          } else if (aLower.includes('nut') || aLower.includes('peanut')) {
                             IconContent = <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12s2-4 4-4 4 4 4 4-2 4-4 4-4-4-4-4z"/></svg>;
                          } else if (aLower.includes('shellfish') || aLower.includes('shrimp') || aLower.includes('fish')) {
                             IconContent = <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c2 0 4 1 5 3s1 4 .5 6-1.5 3-3 4c-.5 2-1 3-2 3M12 2c-2 0-4 1-5 3s-1 4-.5 6 1.5 3 3 4c.5 2 1 3 2 3M9 13s1-1 3-1 3 1 3 1"/></svg>;
                          } else if (aLower.includes('egg')) {
                             IconContent = <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5 0 9-4 9-10S17 2 12 2 3 6 3 12s4 10 9 10z"/></svg>;
                          }

                          const isAllergicTo = safeUserAllergies.includes(aLower.trim());

                          return (
                            <div key={allergy} className="relative group cursor-help flex items-center justify-center">
                              {IconContent ? (
                                <div className={`p-1.5 rounded-md shadow-sm border ${isAllergicTo ? 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'}`}>
                                  {IconContent}
                                </div>
                              ) : (
                                <div className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold shadow-sm uppercase ${isAllergicTo ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                                  {allergy}
                                </div>
                              )}
                              
                              {/* Tooltip */}
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block w-max px-2 py-1 bg-gray-900 dark:bg-black text-white text-[10px] font-medium rounded shadow-lg z-50">
                                Contains {allergy}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-black"></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ======================= RETURN (JSX) =======================
  return (
    <div className="max-w-7xl mx-auto min-h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold text-[#2a3441] dark:text-gray-100 mb-8">Library</h1>
      {view === 'selection' ? renderSelection() : renderGrid()}
    </div>
  );
};

// ======================= EXPORT =======================
export default Gallery;
