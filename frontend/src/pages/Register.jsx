/**
 * =========================================================================
 * Register.jsx — User Registration Page
 * =========================================================================
 *
 * PURPOSE:
 *   Renders the multi-field registration form that creates a new Mutaafi
 *   user account.  The form collects personal info (name, email, password),
 *   body metrics (age, height, weight), fitness preferences (activity level,
 *   experience, equipment, goal), dietary preferences, and food allergies.
 *
 * FEATURE / PAGE:
 *   Registration / Onboarding flow.
 *
 * BACKEND CONNECTION:
 *   1. POST /api/calculate-targets  — Flask endpoint that computes daily
 *      calorie and protein targets from the user's body metrics and goal.
 *   2. supabase.auth.signUp()       — Creates the auth user in Supabase
 *      with all profile fields stored as user_metadata.
 *   3. supabase.from('user_data')   — Explicit update to persist computed
 *      calorie/protein targets in the user_data table after signup.
 *
 * RELATED COMPONENTS:
 *   - ThemeContext (dark/light mode toggle in the top bar)
 *   - Login page (linked from sidebar)
 *   - App.jsx router (navigates to '/' on successful registration)
 * =========================================================================
 */

// ======================= IMPORTS =======================
// Core React hooks
import { useState, useEffect } from 'react';
// Supabase client for auth and database operations
import { supabase } from '../supabaseClient';
// React Router utilities for navigation and links
import { Link, useNavigate } from 'react-router-dom';
// Custom theme context for dark/light mode toggle
import { useTheme } from '../context/ThemeContext';
// Lucide icons for the dark-mode toggle button
import { Sun, Moon } from 'lucide-react';
// Static logo image for the sidebar brand
import logo from '../assets/logo.png';

// ======================= COMPONENT =======================
/**
 * Register — main registration form component.
 *
 * @returns {JSX.Element} The full registration page layout including
 *          sidebar, top bar, and the multi-section form.
 */
const Register = () => {

  // ======================= STATE & HOOKS =======================

  // Set the browser tab title on first render
  useEffect(() => {
    document.title = "Register | Mutaafi";
  }, []);

  // Form state — holds every field the user fills in during registration
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    gender: 'Male',
    age: '',
    height: '',
    weight: '',
    activityLevel: 'Sedentary (Little to no exercise)',
    experienceLevel: 'Beginner',
    equipmentAccess: 'Gym',
    goal: 'Maintenance',
    dietaryPreference: 'None (Standard Diet)',
  });

  // Allergy checkboxes — each key is a known allergy; value is boolean
  const [allergies, setAllergies] = useState({
    Peanuts: false,
    Dairy: false,
    Gluten: false,
    Shellfish: false,
    Eggs: false,
    Soy: false,
  });

  // Whether the form submission is in progress (disables submit button)
  const [loading, setLoading] = useState(false);

  // Global error message displayed at the top of the form
  const [errorMsg, setErrorMsg] = useState('');

  // Per-field inline validation errors for weight and height
  const [fieldErrors, setFieldErrors] = useState({ weight: '', height: '' });

  // React Router hook — used to redirect to '/' after successful signup
  const navigate = useNavigate();

  // Theme context — provides dark mode state and toggle callback
  const { isDarkMode, toggleDarkMode } = useTheme();

  // ======================= HELPER FUNCTIONS =======================

  /**
   * Validates a body-metric field (weight or height) and returns an
   * error string.  Returns an empty string when the value is valid.
   *
   * @param   {string} name  — Field name: 'weight' or 'height'.
   * @param   {string} value — Raw input value from the form field.
   * @returns {string}       — Human-readable error message, or '' if valid.
   *
   * Triggered on every keystroke (via handleChange) and again on form submit.
   */
  const validateBodyField = (name, value) => {
    if (value === '' || value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num) || !/^-?\d+(\.\d)?$/.test(String(value).trim())) {
      return name === 'weight'
        ? 'Please enter a valid weight between 20 and 300 kg.'
        : 'Please enter a valid height between 50 and 250 cm.';
    }
    if (num <= 0) {
      return name === 'weight'
        ? 'Please enter a valid weight between 20 and 300 kg.'
        : 'Please enter a valid height between 50 and 250 cm.';
    }
    if (name === 'weight' && (num < 20 || num > 300)) {
      return 'Please enter a valid weight between 20 and 300 kg.';
    }
    if (name === 'height' && (num < 50 || num > 250)) {
      return 'Please enter a valid height between 50 and 250 cm.';
    }
    return '';
  };

  /**
   * Keyboard handler that blocks scientific-notation characters (e, E)
   * and sign characters (+, -) from being typed into decimal number fields.
   *
   * @param {KeyboardEvent} e — The native keyboard event.
   * @returns {void}
   *
   * Attached via onKeyDown on weight and height inputs.
   */
  const blockInvalidKey = (e) => {
    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
  };

  /**
   * Same as blockInvalidKey but also blocks the decimal point character.
   * Used on integer-only fields like age.
   *
   * @param {KeyboardEvent} e — The native keyboard event.
   * @returns {void}
   *
   * Attached via onKeyDown on the age input.
   */
  const blockInvalidKeyInt = (e) => {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
  };

  // ======================= EVENT HANDLERS =======================

  /**
   * Generic change handler for all text / select / number form fields.
   * Also performs live inline validation for weight and height.
   *
   * @param {React.ChangeEvent} e — The change event from the input element.
   * @returns {void}
   *
   * Triggered on every keystroke or dropdown selection change.
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Live validation for weight & height
    if (name === 'weight' || name === 'height') {
      setFieldErrors(prev => ({ ...prev, [name]: validateBodyField(name, value) }));
    }
  };

  /**
   * Toggles a single allergy checkbox on or off.
   *
   * @param {string} name — The allergy key (e.g., 'Peanuts', 'Dairy').
   * @returns {void}
   *
   * Triggered when the user clicks any allergy checkbox.
   */
  const handleAllergyChange = (name) => {
    setAllergies({ ...allergies, [name]: !allergies[name] });
  };

  /**
   * Main form submission handler.
   *
   * Workflow:
   *   1. Re-validates weight and height fields.
   *   2. Calls the Flask /api/calculate-targets endpoint to compute
   *      daily calorie and protein targets.
   *   3. Signs the user up via supabase.auth.signUp() with all profile
   *      data stored as user_metadata.
   *   4. Explicitly updates the user_data table with computed targets
   *      (as a safety net in case the Supabase trigger missed them).
   *   5. Navigates to the dashboard on success.
   *
   * @param {React.FormEvent} e — The form submit event.
   * @returns {Promise<void>}
   *
   * Triggered when the user clicks the "Register" button.
   */
  const handleRegister = async (e) => {
    e.preventDefault();

    // Re-run field validations on submit to catch untouched fields
    const weightErr = validateBodyField('weight', formData.weight);
    const heightErr = validateBodyField('height', formData.height);
    setFieldErrors({ weight: weightErr, height: heightErr });
    if (weightErr || heightErr) return;

    setLoading(true);
    setErrorMsg('');

    let target_calories = null;
    let target_protein = null;

    try {
      // Call Flask Backend to calculate calorie & protein targets
      const response = await fetch('http://127.0.0.1:5000/api/calculate-targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          age: formData.age,
          gender: formData.gender,
          height: formData.height,
          weight: formData.weight,
          activity_level: formData.activityLevel,
          goal_type: formData.goal
        }),
      });

      if (response.ok) {
        const result = await response.json();
        target_calories = result.target_calories;
        target_protein = result.target_protein;
      }
    } catch (err) {
      // Silently proceed — targets will remain null and can be set later
    }

    // Prepare extended user metadata object for Supabase auth
    const selectedAllergies = Object.keys(allergies).filter(key => allergies[key]);
    const metadata = {
      first_name: formData.firstName,
      last_name: formData.lastName,
      gender: formData.gender,
      age: parseInt(formData.age),
      height_cm: parseFloat(formData.height),
      weight_kg: parseFloat(formData.weight),
      activity_level: formData.activityLevel,
      experience_level: formData.experienceLevel,
      equipment_access: formData.equipmentAccess.toLowerCase(),
      goal: formData.goal,
      allergies: selectedAllergies,
      dietary_preference: formData.dietaryPreference,
      target_calories: target_calories,
      target_protein: target_protein
    };

    // Attempt Sign Up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: metadata
      }
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      // Ensure target_calories and target_protein are saved in the user_data table.
      // The Supabase trigger might map it, but we update explicitly to be safe.
      if (data?.user && target_calories && target_protein) {
        try {
          // Wait a bit to ensure trigger finishes inserting the row
          await new Promise(resolve => setTimeout(resolve, 500));

          await supabase
            .from('user_data')
            .update({
              target_calories: target_calories,
              target_protein: target_protein,
              experience_level: formData.experienceLevel,
              equipment_access: formData.equipmentAccess.toLowerCase(),
            })
            .eq('user_id', data.user.id);
        } catch (updateErr) {
          // Non-critical — targets can be recalculated later from settings
        }
      }

      // Navigate to the dashboard (auto-login if Supabase auto-confirm is on)
      navigate('/');
    }
    setLoading(false);
  };

  // ======================= RETURN (JSX) =======================
  return (
    <div className="flex bg-[#fafafa] dark:bg-gray-950 min-h-screen transition-colors duration-200">

      {/* ---------- LEFT SIDEBAR (disabled navigation for unauthenticated users) ---------- */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col hidden md:flex transition-colors duration-200">
        {/* Brand logo and name */}
        <div className="p-6 flex items-center space-x-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Mutaafi Logo" className="h-16 w-auto object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 transition-transform hover:scale-105" />
            <span className="text-xl font-bold tracking-wide text-gray-900 dark:text-white">MUTAAFI</span>
          </div>
        </div>

        {/* Greyed-out navigation items (user is not logged in) */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 text-sm font-medium text-[#2a3441] dark:text-gray-200">
          {['Dashboard', 'My Workouts', 'My Meals', 'Explore', 'AI Planner', 'AI Coach', 'Feedback', 'Contact Us'].map(item => (
            <div key={item} className="block px-4 py-3 rounded-md text-gray-500 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-not-allowed">
              {item}
            </div>
          ))}
        </nav>

        {/* Login / Register links at the bottom of the sidebar */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex flex-col space-y-2">
          <Link to="/login" className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md">Login</Link>
          <Link to="/register" className="px-4 py-2 text-sm text-[#108a6e] dark:text-[#19cba3] font-semibold bg-[#eafff6] dark:bg-gray-800 rounded-md">Register</Link>
        </div>
      </aside>

      {/* ---------- MAIN CONTENT AREA ---------- */}
      <main className="flex-1 flex flex-col overflow-y-auto">

        {/* Top Navbar — only contains the dark-mode toggle */}
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-8 flex-shrink-0 transition-colors duration-200">
          <div className="flex-1"></div>
          <button
            onClick={toggleDarkMode}
            className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
          </button>
        </header>

        {/* ---------- REGISTRATION FORM ---------- */}
        <div className="p-8 max-w-3xl w-full mx-auto">
          <h1 className="text-3xl font-bold text-[#2a3441] dark:text-gray-100 mb-8">Create Account</h1>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <form onSubmit={handleRegister} className="space-y-5">

              {/* Global error banner */}
              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm">
                  {errorMsg}
                </div>
              )}

              {/* First Name */}
              <div>
                <label className="label-text">First Name <span className="text-red-500">*</span></label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required className="input-field" />
              </div>

              {/* Last Name */}
              <div>
                <label className="label-text">Last Name <span className="text-red-500">*</span></label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required className="input-field" />
              </div>

              {/* Email */}
              <div>
                <label className="label-text">Email <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} required className="input-field" />
              </div>

              {/* Password */}
              <div>
                <label className="label-text">Password <span className="text-red-500">*</span></label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} required className="input-field" />
              </div>

              {/* Gender selector */}
              <div>
                <label className="label-text">Gender <span className="text-red-500">*</span></label>
                <select name="gender" value={formData.gender} onChange={handleChange} required className="input-field">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Age — integer only, blocks decimal and scientific notation keys */}
              <div>
                <label className="label-text">Age <span className="text-red-500">*</span></label>
                <input type="number" name="age" value={formData.age} onChange={handleChange} onKeyDown={blockInvalidKeyInt} min="10" max="80" required className="input-field" />
              </div>

              {/* Height — decimal allowed, with inline validation error */}
              <div>
                <label className="label-text">Height (cm) <span className="text-red-500">*</span></label>
                <input
                  id="height"
                  type="number"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  onKeyDown={blockInvalidKey}
                  placeholder="e.g. 175"
                  step="0.1"
                  min="50"
                  max="250"
                  required
                  aria-describedby={fieldErrors.height ? 'height-error' : undefined}
                  className={`input-field ${fieldErrors.height ? 'border-red-500 focus:ring-red-400' : ''}`}
                />
                {fieldErrors.height && (
                  <p id="height-error" role="alert" className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <span aria-hidden="true">⚠</span> {fieldErrors.height}
                  </p>
                )}
              </div>

              {/* Weight — decimal allowed, with inline validation error */}
              <div>
                <label className="label-text">Weight (kg) <span className="text-red-500">*</span></label>
                <input
                  id="weight"
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  onKeyDown={blockInvalidKey}
                  placeholder="e.g. 70.5"
                  step="0.1"
                  min="20"
                  max="300"
                  required
                  aria-describedby={fieldErrors.weight ? 'weight-error' : undefined}
                  className={`input-field ${fieldErrors.weight ? 'border-red-500 focus:ring-red-400' : ''}`}
                />
                {fieldErrors.weight && (
                  <p id="weight-error" role="alert" className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <span aria-hidden="true">⚠</span> {fieldErrors.weight}
                  </p>
                )}
              </div>

              {/* Activity Level dropdown */}
              <div>
                <label className="label-text">Activity Level <span className="text-red-500">*</span></label>
                <select name="activityLevel" value={formData.activityLevel} onChange={handleChange} required className="input-field">
                  <option value="Sedentary (Little to no exercise)">Sedentary (Little to no exercise)</option>
                  <option value="Lightly active (1-2 days/week)">Lightly active (1-2 days/week)</option>
                  <option value="Moderately active (3-4 days/week)">Moderately active (3-4 days/week)</option>
                  <option value="Very active (5-6 days/week)">Very active (5-6 days/week)</option>
                  <option value="Extra active (Physical job)">Extra active (Physical job)</option>
                </select>
              </div>

              {/* Training Experience dropdown */}
              <div>
                <label className="label-text">Training Experience <span className="text-red-500">*</span></label>
                <select name="experienceLevel" value={formData.experienceLevel} onChange={handleChange} required className="input-field">
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>

              {/* Equipment Access dropdown */}
              <div>
                <label className="label-text">Where do you train? <span className="text-red-500">*</span></label>
                <select name="equipmentAccess" value={formData.equipmentAccess} onChange={handleChange} required className="input-field">
                  <option value="Gym">Gym</option>
                  <option value="Home">Home</option>
                </select>
              </div>

              {/* Fitness Goal dropdown */}
              <div>
                <label className="label-text">Goal <span className="text-red-500">*</span></label>
                <select name="goal" value={formData.goal} onChange={handleChange} required className="input-field">
                  <option value="Maintenance">Maintenance</option>
                  <option value="Weight Loss">Weight Loss</option>
                  <option value="Muscle Gain">Muscle Gain</option>
                </select>
              </div>

              {/* Allergy checkboxes (optional) */}
              <div>
                <label className="label-text">Allergies (Optional)</label>
                <div className="flex flex-wrap gap-4 mt-2">
                  {Object.keys(allergies).map(allergy => (
                    <label key={allergy} className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allergies[allergy]}
                        onChange={() => handleAllergyChange(allergy)}
                        className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-[#108a6e] shadow-sm focus:border-primary-green focus:ring focus:ring-primary-green focus:ring-opacity-50 mr-2"
                      />
                      {allergy}
                    </label>
                  ))}
                </div>
              </div>

              {/* Dietary Preference dropdown (optional) */}
              <div>
                <label className="label-text">Dietary Preferences (Optional)</label>
                <select name="dietaryPreference" value={formData.dietaryPreference} onChange={handleChange} className="input-field">
                  <option value="None (Standard Diet)">None (Standard Diet)</option>
                  <option value="Vegetarian">Vegetarian</option>
                  <option value="Vegan">Vegan</option>
                  <option value="Keto">Keto</option>
                  <option value="Paleo">Paleo</option>
                </select>
              </div>

              {/* Submit button — disabled while loading or if validation errors exist */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading || !!fieldErrors.weight || !!fieldErrors.height}
                  className="btn-primary w-auto px-8 min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

// ======================= EXPORT =======================
export default Register;
