/**
 * =========================================================================
 * ProfileSettings.jsx — User Profile & Preferences Editor
 * =========================================================================
 *
 * PURPOSE:
 *   Allows authenticated users to view and update their personal details,
 *   body metrics, fitness goals, dietary preferences, allergies, and
 *   password.  Calorie/protein targets are recalculated automatically
 *   on every save via the Flask backend.
 *
 * FEATURE / PAGE:
 *   Profile Settings — accessible from the sidebar after login.
 *
 * BACKEND CONNECTION:
 *   - supabase.from('user_data')  — Reads/writes the user's profile row.
 *   - supabase.auth.updateUser()  — Updates name metadata and password.
 *   - POST /api/calculate-targets — Recalculates calorie and protein
 *     targets from the updated body metrics and goal.
 *
 * RELATED COMPONENTS:
 *   - App.jsx router — Mounts at '/profile-settings'.
 * =========================================================================
 */

// ======================= IMPORTS =======================
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, Activity, Target, Shield, Save, Leaf } from 'lucide-react';

// ======================= COMPONENT =======================
/**
 * ProfileSettings — multi-section profile editor.
 * @returns {JSX.Element}
 */
const ProfileSettings = () => {

  // ======================= STATE & HOOKS =======================

  // Whether the profile data is still being fetched
  const [loading, setLoading] = useState(true);
  // Whether a save operation is in progress
  const [saving, setSaving] = useState(false);
  // Status banner: { type: 'success'|'error', text: '...' }
  const [message, setMessage] = useState({ type: '', text: '' });
  // Per-field inline validation errors for weight, height, and age
  const [fieldErrors, setFieldErrors] = useState({ weight: '', height: '', age: '' });

  // All editable profile fields stored in a single state object
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    gender: 'Male',
    age: '',
    height: '',
    weight: '',
    activity_level: 'Lightly active (1-2 days/week)',
    experience_level: 'Beginner',
    equipment_access: 'gym',
    assigned_schedule: '',
    goal_type: 'Maintenance',
    target_calories: '',
    target_protein: '',
    dietary_preferences: 'None (Standard Diet)',
    allergies: {
      Peanuts: false,
      Dairy: false,
      Gluten: false,
      Shellfish: false,
      Eggs: false,
      Soy: false,
    },
    new_password: ''
  });

  useEffect(() => {
    document.title = "Profile Settings | Mutaafi";
    fetchUserProfile();
  }, []);

  /**
   * Loads the user's profile from the user_data table and auth metadata,
   * then populates the form state.
   *
   * @returns {Promise<void>}
   * Triggered once on component mount via useEffect.
   */
  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_data')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        // Map allergies array to object
        const userAllergies = {};
        Object.keys(formData.allergies).forEach(key => {
          userAllergies[key] = data.allergies?.includes(key) || false;
        });

        // Pull name from auth metadata (not stored in user_data table)
        const firstName = user.user_metadata?.first_name || '';
        const lastName = user.user_metadata?.last_name || '';

        setFormData({
          ...formData,
          first_name: firstName,
          last_name: lastName,
          email: user.email,
          gender: data.gender || 'Male',
          age: data.age || '',
          height: data.height || '',
          weight: data.weight || '',
          activity_level: data.fitness_level || 'Lightly active (1-2 days/week)',
          experience_level: data.experience_level || 'Beginner',
          equipment_access: data.equipment_access || 'gym',
          assigned_schedule: data.assigned_schedule || '',
          goal_type: data.goal_type || 'Maintenance',
          target_calories: data.target_calories || '',
          target_protein: data.target_protein || '',
          dietary_preferences: data.dietary_preferences?.[0] || 'None (Standard Diet)',
          allergies: userAllergies,
        });
      }
    } catch (error) {
      // Silently fail — form will show default values
    } finally {
      setLoading(false);
    }
  };

  // ======================= HELPER FUNCTIONS =======================

  /**
   * Validates a body-metric field and returns an error string or ''.
   * @param {string} name  — 'weight', 'height', or 'age'.
   * @param {string} value — Raw input value.
   * @returns {string} Error message or empty string.
   */
  const validateBodyField = (name, value) => {
    if (value === '' || value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num) || !/^-?\d+(\.\d)?$/.test(String(value).trim())) {
      if (name === 'weight') return 'Please enter a valid weight between 20 and 300 kg.';
      if (name === 'height') return 'Please enter a valid height between 50 and 250 cm.';
      if (name === 'age')    return 'Please enter a valid age between 10 and 80.';
    }
    if (num <= 0) {
      if (name === 'weight') return 'Please enter a valid weight between 20 and 300 kg.';
      if (name === 'height') return 'Please enter a valid height between 50 and 250 cm.';
      if (name === 'age')    return 'Please enter a valid age between 10 and 80.';
    }
    if (name === 'weight' && (num < 20 || num > 300)) return 'Please enter a valid weight between 20 and 300 kg.';
    if (name === 'height' && (num < 50 || num > 250)) return 'Please enter a valid height between 50 and 250 cm.';
    if (name === 'age'    && (num < 10 || num > 80))  return 'Please enter a valid age between 10 and 80.';
    return '';
  };

  /**
   * Blocks e/E/+/- keys on decimal number fields.
   * @param {KeyboardEvent} e
   */
  const blockInvalidKey = (e) => {
    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
  };

  /**
   * Blocks e/E/+/-/. keys on integer-only fields (age).
   * @param {KeyboardEvent} e
   */
  const blockInvalidKeyInt = (e) => {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
  };

  // ======================= EVENT HANDLERS =======================

  /**
   * Generic change handler for all form fields. Also runs live
   * validation on weight, height, and age.
   * @param {React.ChangeEvent} e
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (name === 'weight' || name === 'height' || name === 'age') {
      setFieldErrors(prev => ({ ...prev, [name]: validateBodyField(name, value) }));
    }
  };

  /**
   * Toggles an allergy checkbox.
   * @param {string} name — Allergy key (e.g. 'Peanuts').
   */
  const handleAllergyChange = (name) => {
    setFormData({
      ...formData,
      allergies: { ...formData.allergies, [name]: !formData.allergies[name] }
    });
  };

  /**
   * Calls the Flask backend to recalculate calorie and protein targets
   * from the current body metrics and goal.
   * @returns {Promise<{calories: number, protein: number}|null>}
   */
  const calculateTargets = async () => {
    try {
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
          activity_level: formData.activity_level,
          goal_type: formData.goal_type
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setFormData(prev => ({
          ...prev,
          target_calories: data.target_calories,
          target_protein: data.target_protein
        }));
        return { calories: data.target_calories, protein: data.target_protein };
      } else {
        throw new Error(data.error || 'Failed to calculate targets');
      }
    } catch (error) {
      return null;
    }
  };

  /**
   * Saves all profile changes: recalculates targets, updates auth
   * metadata, optionally changes password, and writes to user_data.
   * @returns {Promise<void>}
   * Triggered when the "Save Changes" button is clicked.
   */
  const handleSave = async () => {
    // Re-validate all three body fields before saving
    const weightErr = validateBodyField('weight', formData.weight);
    const heightErr = validateBodyField('height', formData.height);
    const ageErr    = validateBodyField('age',    formData.age);
    setFieldErrors({ weight: weightErr, height: heightErr, age: ageErr });
    if (weightErr || heightErr || ageErr) {
      setMessage({ type: 'error', text: 'Please fix the highlighted fields before saving.' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Calculate missing targets using backend if untouched
      let finalCalories = formData.target_calories;
      let finalProtein = formData.target_protein;
      
      // Recalculate targets using our backend
      const targets = await calculateTargets();
      if (targets) {
         finalCalories = targets.calories;
         finalProtein = targets.protein;
      }

      // Update auth user metadata (first_name, last_name)
      await supabase.auth.updateUser({
        data: {
          first_name: formData.first_name,
          last_name: formData.last_name
        }
      });

      // Update password if provided
      if (formData.new_password) {
        const { error: pwdError } = await supabase.auth.updateUser({
          password: formData.new_password
        });
        if (pwdError) throw pwdError;
      }

      // Map allergies to array
      const selectedAllergies = Object.keys(formData.allergies).filter(key => formData.allergies[key]);

      // Update DB
      const { error } = await supabase
        .from('user_data')
        .update({
          age: parseInt(formData.age),
          gender: formData.gender,
          height: parseFloat(formData.height),
          weight: parseFloat(formData.weight),
          fitness_level: formData.activity_level,
          experience_level: formData.experience_level,
          equipment_access: formData.equipment_access,
          goal_type: formData.goal_type,
          target_calories: finalCalories,
          target_protein: finalProtein,
          dietary_preferences: [formData.dietary_preferences],
          allergies: selectedAllergies
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      
      // Clear password field
      setFormData(prev => ({ ...prev, new_password: '' }));

    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  // ======================= LOADING STATE =======================
  if (loading) return <div className="text-center py-10">Loading profile...</div>;

  // ======================= RETURN (JSX) =======================

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#108a6e] dark:text-[#19cba3]">Profile Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage your account details and preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !!fieldErrors.weight || !!fieldErrors.height || !!fieldErrors.age}
          className="bg-[#108a6e] text-white px-5 py-2 rounded-md font-medium text-sm flex items-center hover:bg-[#0c6954] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} className="mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {message.text && (
        <div className={`p-4 mb-6 rounded-md ${message.type === 'success' ? 'bg-[#eafff6] dark:bg-[#108a6e]/20 text-[#108a6e] dark:text-[#19cba3] border border-[#a2ecd1] dark:border-[#108a6e]/30' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Personal Details Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-100 dark:border-gray-700 pb-3">
            <User size={18} className="mr-2 text-gray-500 dark:text-gray-400" />
            Personal Details
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
              <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
              <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
              <input type="email" value={formData.email} disabled className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 cursor-not-allowed text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
              <select name="gender" value={formData.gender} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
              <input
                id="age"
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                onKeyDown={blockInvalidKeyInt}
                min="10"
                max="80"
                aria-describedby={fieldErrors.age ? 'age-error' : undefined}
                className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-gray-100 ${fieldErrors.age ? 'border-red-500 focus:ring-red-400' : 'border-gray-200 dark:border-gray-700 focus:ring-[#108a6e]'}`}
              />
              {fieldErrors.age && (
                <p id="age-error" role="alert" className="mt-1 text-xs text-red-500 flex items-center gap-1">
                  <span aria-hidden="true">⚠</span> {fieldErrors.age}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Body & Activity Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-100 dark:border-gray-700 pb-3">
            <Activity size={18} className="mr-2 text-yellow-500" />
            Body & Activity
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Height (cm)</label>
              <input
                id="height"
                type="number"
                name="height"
                value={formData.height}
                onChange={handleChange}
                onKeyDown={blockInvalidKey}
                step="0.1"
                min="50"
                max="250"
                aria-describedby={fieldErrors.height ? 'height-error' : undefined}
                className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-gray-100 ${fieldErrors.height ? 'border-red-500 focus:ring-red-400' : 'border-gray-200 dark:border-gray-700 focus:ring-[#108a6e]'}`}
              />
              {fieldErrors.height && (
                <p id="height-error" role="alert" className="mt-1 text-xs text-red-500 flex items-center gap-1">
                  <span aria-hidden="true">⚠</span> {fieldErrors.height}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weight (kg)</label>
              <input
                id="weight"
                type="number"
                name="weight"
                value={formData.weight}
                onChange={handleChange}
                onKeyDown={blockInvalidKey}
                step="0.1"
                min="20"
                max="300"
                aria-describedby={fieldErrors.weight ? 'weight-error' : undefined}
                className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-gray-100 ${fieldErrors.weight ? 'border-red-500 focus:ring-red-400' : 'border-gray-200 dark:border-gray-700 focus:ring-[#108a6e]'}`}
              />
              {fieldErrors.weight && (
                <p id="weight-error" role="alert" className="mt-1 text-xs text-red-500 flex items-center gap-1">
                  <span aria-hidden="true">⚠</span> {fieldErrors.weight}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Activity Level <span className="text-red-500">*</span></label>
              <select name="activity_level" value={formData.activity_level} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100">
                <option value="Sedentary (Little to no exercise)">Sedentary (Little to no exercise)</option>
                <option value="Lightly active (1-2 days/week)">Lightly active (1-2 days/week)</option>
                <option value="Moderately active (3-4 days/week)">Moderately active (3-4 days/week)</option>
                <option value="Very active (5-6 days/week)">Very active (5-6 days/week)</option>
                <option value="Extra active (Physical job)">Extra active (Physical job)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Training Experience <span className="text-red-500">*</span></label>
              <select name="experience_level" value={formData.experience_level} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100">
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Where do you train? <span className="text-red-500">*</span></label>
              <select name="equipment_access" value={formData.equipment_access} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100">
                <option value="gym">Gym</option>
                <option value="home">Home</option>
              </select>
            </div>
            {formData.assigned_schedule && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Workout Schedule</label>
                <div className="w-full px-4 py-2.5 bg-[#eafff6] dark:bg-[#108a6e]/20 border border-[#a2ecd1] dark:border-[#108a6e]/30 rounded-md text-[#108a6e] dark:text-[#19cba3] text-sm font-semibold flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {formData.assigned_schedule}
                  <span className="text-gray-500 dark:text-gray-400 font-normal text-xs ml-1">(AI-assigned)</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Goals & Targets Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-100 dark:border-gray-700 pb-3">
            <Target size={18} className="mr-2 text-red-500" />
            Goals & Targets
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Goal <span className="text-red-500">*</span></label>
              <select name="goal_type" value={formData.goal_type} onChange={handleChange} className="w-full px-4 py-2 bg-transparent border-2 border-[#108a6e] dark:border-[#19cba3] text-[#108a6e] dark:text-[#19cba3] dark:bg-gray-900 rounded-md focus:outline-none focus:ring-0 text-sm font-medium">
                <option value="Maintenance">Maintenance (Keep weight)</option>
                <option value="Weight Loss">Cutting (Weight Loss)</option>
                <option value="Muscle Gain">Bulking (Muscle Gain)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Calories (kcal)</label>
              <input type="number" name="target_calories" value={formData.target_calories} onChange={handleChange} placeholder="Auto-calculated on save..." className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100" />
              <p className="text-xs text-gray-400 mt-1">Leave unchanged to keep automatic target</p>
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Protein (g)</label>
              <input type="number" name="target_protein" value={formData.target_protein} onChange={handleChange} placeholder="Auto-calculated on save..." className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100" />
              <p className="text-xs text-gray-400 mt-1">Leave unchanged to keep automatic target</p>
            </div>
          </div>
        </section>

        {/* Diet & Preferences Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-100 dark:border-gray-700 pb-3">
            <Leaf size={18} className="mr-2 text-green-500" />
            Diet & Preferences
          </h2>
          
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Diet Type</label>
              <select name="dietary_preferences" value={formData.dietary_preferences} onChange={handleChange} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100">
                <option value="None (Standard Diet)">None (Standard Diet)</option>
                <option value="Vegetarian">Vegetarian</option>
                <option value="Vegan">Vegan</option>
                <option value="Keto">Keto</option>
                <option value="Paleo">Paleo</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allergies (Select all that apply)</label>
              <div className="flex flex-wrap gap-4 mt-2">
                {Object.keys(formData.allergies).map(allergy => (
                  <label key={allergy} className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.allergies[allergy]} 
                      onChange={() => handleAllergyChange(allergy)}
                      className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-[#108a6e] shadow-sm focus:border-[#108a6e] focus:ring focus:ring-[#108a6e] focus:ring-opacity-50 mr-2"
                    />
                    {allergy}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 border-l-4 border-l-yellow-400">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center border-b border-gray-100 dark:border-gray-700 pb-3">
            <Shield size={18} className="mr-2 text-yellow-600" />
            Security
          </h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
             <input type="password" name="new_password" value={formData.new_password} onChange={handleChange} placeholder="Leave blank to keep current password" className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#108a6e] focus:border-transparent text-sm dark:text-gray-100" />
          </div>
        </section>

      </div>
    </div>
  );
};

// ======================= EXPORT =======================
export default ProfileSettings;
