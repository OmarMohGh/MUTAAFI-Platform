/**
 * =========================================================================
 * Feedback.jsx — User Feedback Submission Page
 * =========================================================================
 *
 * PURPOSE:
 *   Renders a form that allows authenticated users to submit feedback
 *   about the Mutaafi platform.  The form collects a feedback category,
 *   a 1–5 star rating, and a free-text message, then POSTs everything
 *   to the Flask backend for storage.
 *
 * FEATURE / PAGE:
 *   Feedback — accessible from the main sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - POST /api/feedback  — Sends user_id, feedback_type, rating, and
 *     message to the Flask API which inserts a row into the feedback
 *     table in Supabase.
 *   - supabase.auth.getUser() — Retrieves the current user's ID so the
 *     feedback is linked to their account.
 *
 * RELATED COMPONENTS:
 *   - App.jsx router — Mounts this component at the '/feedback' route.
 * =========================================================================
 */

// ======================= IMPORTS =======================
// Core React hooks
import { useState, useEffect } from 'react';
// Supabase client for retrieving the authenticated user
import { supabase } from '../supabaseClient';
// Lucide icons: Star for the rating widget, MessageSquare for the header
import { Star, MessageSquare } from 'lucide-react';

// ======================= COMPONENT =======================
/**
 * Feedback — feedback form component with star rating and message textarea.
 *
 * @returns {JSX.Element} A centered card containing the feedback form.
 */
const Feedback = () => {

  // ======================= STATE & HOOKS =======================

  // Set the browser tab title on first render
  useEffect(() => {
    document.title = "Feedback | Mutaafi";
  }, []);

  // Form data: selected category, star rating (0 = unset), and message text
  const [formData, setFormData] = useState({
    feedback_type: 'General Feedback',
    rating: 0,
    message: ''
  });

  // Whether the form is currently being submitted (disables the button)
  const [loading, setLoading] = useState(false);

  // Status banner state: { type: 'success'|'error', text: '...' }
  const [status, setStatus] = useState({ type: '', text: '' });

  // ======================= CONSTANTS & CONFIG =======================

  // Available feedback categories shown in the dropdown
  const feedbackTypes = [
    'General Feedback',
    'Bug Report',
    'Feature Request',
    'Meal/Workout Suggestion'
  ];

  // ======================= EVENT HANDLERS =======================

  /**
   * Updates the star rating in formData when the user clicks a star.
   *
   * @param {number} ratingValue — The star number (1–5) that was clicked.
   * @returns {void}
   *
   * Triggered when a star button is clicked.
   */
  const handleRating = (ratingValue) => {
    setFormData({ ...formData, rating: ratingValue });
  };

  /**
   * Generic change handler for the feedback-type dropdown and the
   * message textarea.
   *
   * @param {React.ChangeEvent} e — The change event from the input element.
   * @returns {void}
   *
   * Triggered on every keystroke or dropdown selection change.
   */
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  /**
   * Validates the form and submits the feedback to the Flask backend.
   *
   * Workflow:
   *   1. Validates that a star rating is selected and a message is written.
   *   2. Retrieves the current user's ID from Supabase auth.
   *   3. POSTs the feedback payload to /api/feedback.
   *   4. Shows a success banner and resets the form on success,
   *      or shows an error banner on failure.
   *
   * @param {React.FormEvent} e — The form submit event.
   * @returns {Promise<void>}
   *
   * Triggered when the user clicks the "Submit Feedback" button.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    // Validation — ensure rating and message are provided
    if (formData.rating === 0) {
      setStatus({ type: 'error', text: 'Please select a rating between 1 and 5 stars.' });
      return;
    }
    if (formData.message.trim() === '') {
      setStatus({ type: 'error', text: 'Please write a message so we can understand your feedback.' });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const response = await fetch('http://127.0.0.1:5000/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          feedback_type: formData.feedback_type,
          rating: formData.rating,
          message: formData.message
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit feedback');
      }

      setStatus({ type: 'success', text: 'Thank you! Your feedback has been successfully submitted.' });

      // Reset form on success
      setFormData({
        feedback_type: 'General Feedback',
        rating: 0,
        message: ''
      });

    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'An error occurred while submitting.' });
    } finally {
      setLoading(false);
    }
  };

  // ======================= RETURN (JSX) =======================
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">

      {/* ---------- PAGE HEADER ---------- */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2a3441] dark:text-gray-100 flex items-center">
          <MessageSquare className="mr-3 text-[#108a6e] dark:text-[#19cba3]" size={28} />
          Submit Feedback
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
          We are constantly trying to improve Mutaafi. Let us know how we can make your experience better!
        </p>
      </div>

      {/* ---------- FEEDBACK FORM CARD ---------- */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">

        {/* Status banner — success (green) or error (red) */}
        {status.text && (
          <div className={`p-4 mb-6 rounded-md text-sm ${status.type === 'success' ? 'bg-[#eafff6] dark:bg-[#108a6e]/20 text-[#108a6e] dark:text-[#19cba3] border border-[#a2ecd1] dark:border-[#108a6e]/30' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Feedback Type dropdown */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              What kind of feedback is this? <span className="text-red-500">*</span>
            </label>
            <select
              name="feedback_type"
              value={formData.feedback_type}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-gray-700 dark:text-gray-100 font-medium"
            >
              {feedbackTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Star Rating — 5 clickable star buttons */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              How would you rate your overall experience? <span className="text-red-500">*</span>
            </label>
            <div className="flex space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRating(star)}
                  className={`p-1 focus:outline-none transition-colors ${
                    formData.rating >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600 hover:text-yellow-200'
                  }`}
                >
                  <Star size={32} fill={formData.rating >= star ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Please share your thoughts <span className="text-red-500">*</span>
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows="5"
              placeholder="Tell us what you love, what's broken, or what you wish we had..."
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-gray-700 dark:text-gray-100 resize-y"
            ></textarea>
          </div>

          {/* Submit button */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className={`bg-[#108a6e] text-white px-8 py-3 rounded-md font-medium shadow-sm hover:bg-[#0c6954] transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-[#108a6e] ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default Feedback;
