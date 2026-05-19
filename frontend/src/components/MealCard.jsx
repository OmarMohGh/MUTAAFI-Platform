import { useState } from 'react';

const API = 'http://127.0.0.1:5000';
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80';

// ── Star Rating Component ──
const StarRating = ({ rating, onRate }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(star => (
      <button key={star} onClick={() => onRate(star)} className="focus:outline-none transition-transform hover:scale-125">
        <svg className={`w-4 h-4 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600 fill-gray-300 dark:fill-gray-600'}`} viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
      </button>
    ))}
  </div>
);

// ── Single Meal Card ──
export const MealCard = ({ slot, userId, onSwap, onMealUpdated, initialSaved = false, initialRating = 0, viewOnly = false, showCompletion = false, isCompleted = false, onToggleComplete }) => {
  const [saved, setSaved] = useState(initialSaved);
  const [rating, setRating] = useState(initialRating);
  const [showRating, setShowRating] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [excludedIds, setExcludedIds] = useState([]);

  const meal = slot.meal || slot.nutrition_data; // Accept either format depending on plan schema
  if (!meal) return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400 dark:text-gray-500">
      No meal available for this slot.
    </div>
  );

  const imageUrl = (meal.image_url && meal.image_url.trim()) ? meal.image_url : FALLBACK_IMG;

  const logInteraction = async (action, expRating = null) => {
    try {
      await fetch(`${API}/api/meal-plan/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, meal_id: meal.meal_id, action_type: action, explicit_rating: expRating }),
      });
    } catch (err) { console.error('Interaction log failed:', err); }
  };

  const handleSave = () => {
    setSaved(!saved);
    if (!saved) logInteraction('saved');
  };

  const handleRate = (stars) => {
    setRating(stars);
    logInteraction('eaten', stars);
    setTimeout(() => setShowRating(false), 600);
  };

  const handleSwap = async () => {
    setSwapping(true);
    const newExcluded = [...excludedIds, meal.meal_id];
    setExcludedIds(newExcluded);
    logInteraction('swapped');
    try {
      const res = await fetch(`${API}/api/meal-plan/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, slot_name: slot.slot_name, excluded_meal_ids: newExcluded }),
      });
      const data = await res.json();
      if (data.new_meal) {
        onMealUpdated(slot.slot_name, data.new_meal);
      }
    } catch (err) { console.error('Swap failed:', err); }
    setSwapping(false);
  };

  const handleDislike = async () => {
    logInteraction('rejected');
    handleSwap();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col hover:shadow-md transition-all duration-300 group hover:-translate-y-1 relative">
      {/* Save Button (top-left) */}
      <button onClick={handleSave} className="absolute top-2 left-2 z-20 p-3 min-w-[44px] min-h-[44px] rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors flex items-center justify-center" title={saved ? 'Unsave' : 'Save'}>
        <svg className={`w-4 h-4 transition-colors ${saved ? 'text-yellow-400 fill-yellow-400' : 'text-white fill-none'}`} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
        </svg>
      </button>

      {/* Image */}
      <div className="h-40 w-full overflow-hidden bg-gray-100 dark:bg-gray-700 relative">
        <img src={imageUrl} alt={meal.meal_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { e.target.src = FALLBACK_IMG; }}/>
        {/* Nutrition Badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end">
          <span className="bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-semibold shadow-sm flex items-center gap-1">
            <svg className="w-3 h-3 text-[#19cba3]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd"/></svg>
            {meal.calories} kcal
          </span>
          <span className="bg-[#108a6e]/90 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-semibold shadow-sm">
            {meal.protein}g P
          </span>
          <span className="backdrop-blur-sm text-xs px-2 py-1 rounded-md font-semibold shadow-sm" style={{ backgroundColor: '#F5C518', color: '#2a2a2a' }}>
            {meal.fats}g F
          </span>
          <span className="backdrop-blur-sm text-xs px-2 py-1 rounded-md font-semibold shadow-sm" style={{ backgroundColor: '#F5E6C8', color: '#2a2a2a' }}>
            {meal.carbs}g C
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-sm font-bold text-[#2a3441] dark:text-gray-100 break-words line-clamp-2 mb-3">{meal.meal_name}</h3>

        {/* Rating (expandable) */}
        {showRating && (
          <div className="mb-3 flex items-center gap-2 animate-in fade-in">
            <StarRating rating={rating} onRate={handleRate}/>
            <button onClick={() => setShowRating(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-auto flex items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* Rate */}
          <button onClick={() => setShowRating(!showRating)} className="flex-1 flex items-center justify-center gap-1 py-3 min-h-[44px] rounded-lg text-xs font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 transition-colors" title="Rate">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            Rate
          </button>
          {!viewOnly && (
            <>
              {/* Swap */}
              <button onClick={handleSwap} disabled={swapping} className="flex-1 flex items-center justify-center gap-1 py-3 min-h-[44px] rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50" title="Swap">
                <svg className={`w-3.5 h-3.5 ${swapping ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                {swapping ? '...' : 'Swap'}
              </button>
              {/* Dislike */}
              <button onClick={handleDislike} className="flex-1 flex items-center justify-center gap-1 py-3 min-h-[44px] rounded-lg text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors" title="Dislike">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"/></svg>
                Dislike
              </button>
            </>
          )}
          {/* Completion Circle */}
          {showCompletion && (
            <button
              onClick={onToggleComplete}
              className={`w-9 h-9 min-w-[36px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ml-1 flex-shrink-0 ${
                isCompleted
                  ? 'bg-green-500 border-green-500 text-white shadow-sm shadow-green-500/30'
                  : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-[#108a6e] hover:bg-[#108a6e]/5'
              }`}
              title={isCompleted ? 'Mark as not consumed' : 'Mark as consumed'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
