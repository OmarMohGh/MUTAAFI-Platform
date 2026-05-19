#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_synthetic_data.py — Synthetic User & Interaction Generator
=====================================================================
FILE:    generate_synthetic_data.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    Generates realistic synthetic test data for the Collaborative
    Filtering (CF) meal recommendation engine.  It runs a 5-phase
    pipeline:

      Phase 1 → Fetch all meals from nutrition_data.
      Phase 2 → Create synthetic auth users (Supabase Auth) and
                their profiles (user_data table).
      Phase 3 → Generate realistic meal interaction history for
                each user (weighted by goal/dietary affinity).
      Phase 4 → Bulk-insert all interactions into
                user_meal_interactions.
      Phase 5 → Bulk-insert user_meal_plan rows for 'eaten'
                actions (the is_completed signal).

HOW IT FITS IN THE PROJECT:
    The CF engine in meal_planner.py requires interaction data to
    learn user preferences.  In development/testing there are no
    real users yet, so this script populates the database with
    synthetic but realistic data.

DESIGN DECISIONS:
    - Users are created via the Supabase Admin Auth API so they
      appear in auth.users and can be cleaned up later.
    - Interactions are NOT uniformly random.  Meal selection is
      WEIGHTED by goal/dietary affinity so users with the same
      goal interact with similar meals — creating genuine
      collaborative signal for the CF model to learn from.
    - Action types (eaten/saved/viewed/swapped/rejected) are also
      affinity-dependent: high-affinity meals are mostly eaten,
      low-affinity meals are mostly rejected.

HOW TO RUN:
    1. Ensure backend/.env has VITE_SUPABASE_URL and
       SUPABASE_SERVICE_ROLE_KEY.
    2. Run:  python generate_synthetic_data.py
    3. Clean up test accounts afterwards in Supabase Dashboard →
       Authentication (email pattern: syn_user_*@mutaafi-test.com).
"""


# ========================= IMPORTS ==========================
import os
import sys
import time
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Force UTF-8 stdout so special chars don't crash on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables from .env
load_dotenv()

# Supabase credentials
SUPABASE_URL      = os.getenv("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Generation parameters (tuned to reduce matrix sparsity to ~74%)
NUM_SYNTHETIC_USERS = 80     # Number of fake user accounts to create
MIN_INTERACTIONS    = 50     # Minimum interactions per user
MAX_INTERACTIONS    = 120    # Maximum interactions per user
CHUNK_SIZE          = 200    # Batch size for bulk DB inserts

# User profile option pools
GOAL_TYPES     = ['Weight Loss', 'Muscle Gain', 'Maintenance']
FITNESS_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
GENDERS        = ['male', 'female']

# Dietary preference pools (more empty entries = more users with no restriction)
DIETARY_POOLS = [
    [],
    [],
    [],
    ['Vegetarian'],
    ['Vegetarian'],
    ['Vegan'],
    ['Gluten-Free'],
    ['High Protein'],
    ['Low Carb'],
    ['Vegetarian', 'Gluten-Free'],
]

# Allergy pools (most users have none — realistic population distribution)
ALLERGY_POOLS = [
    [],
    [],
    [],
    [],
    ['Nuts'],
    ['Dairy'],
    ['Gluten'],
    ['Shellfish'],
    ['Eggs'],
    ['Nuts', 'Dairy'],
]

# Action type → preference score mapping
ACTION_TYPES   = ['eaten', 'saved', 'viewed', 'swapped', 'rejected']
PREFERENCE_SCORE_MAP = {
    'eaten':    1,
    'saved':    1,
    'viewed':   0,
    'swapped': -1,
    'rejected': -1,
}


# ==================== HELPER FUNCTIONS =======================
# Functions for target calculation, safety checks, preference
# scoring, and action-weight determination.
# =============================================================

def calculate_targets(age, gender, height_cm, weight_kg, goal):
    """
    Compute daily calorie and protein targets using
    the Mifflin-St Jeor equation (mirrors app.py logic).

    Parameters:
        age       (int):   User's age in years.
        gender    (str):   'male' or 'female'.
        height_cm (float): Height in centimetres.
        weight_kg (float): Weight in kilograms.
        goal      (str):   'Weight Loss', 'Muscle Gain', or 'Maintenance'.

    Returns:
        tuple: (target_calories: int, target_protein: int).

    Called by:
        generate_synthetic_data() — for each synthetic user profile.
    """
    # Mifflin-St Jeor BMR formula
    if gender == 'male':
        bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
    else:
        bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

    # TDEE with "moderately active" default multiplier
    tdee = bmr * 1.55

    # Adjust for goal
    if 'Loss' in goal:
        target_calories = int(tdee - 500)
        target_protein  = int(weight_kg * 2.2)
    elif 'Gain' in goal:
        target_calories = int(tdee + 500)
        target_protein  = int(weight_kg * 2.0)
    else:
        target_calories = int(tdee)
        target_protein  = int(weight_kg * 1.8)

    return target_calories, target_protein


def is_meal_safe(meal, user_allergies):
    """
    Check whether a meal is safe for a user (no allergen conflicts).

    Parameters:
        meal           (dict): A row from nutrition_data.
        user_allergies (list): User's allergy list (e.g. ['Nuts', 'Dairy']).

    Returns:
        bool: True if the meal is safe, False if it contains an allergen.

    Called by:
        generate_synthetic_data() — to filter eligible meals per user.
    """
    if not user_allergies:
        return True
    meal_allergy_text = (meal.get('allergies') or '').lower()
    for allergy in user_allergies:
        if allergy.lower() in meal_allergy_text:
            return False
    return True


def meal_matches_dietary(meal, user_dietary):
    """
    Check whether a meal matches the user's dietary preferences
    via case-insensitive tag matching.

    Parameters:
        meal          (dict): A row from nutrition_data.
        user_dietary  (list): User's dietary preferences (e.g. ['Vegetarian']).

    Returns:
        bool: True if any preference matches a meal tag, or if
              the user has no dietary preferences.

    Called by:
        generate_synthetic_data() — to filter eligible meals per user.
    """
    if not user_dietary:
        return True
    meal_tags = [t.lower() for t in (meal.get('tags') or [])]
    return any(pref.lower() in meal_tags for pref in user_dietary)


def score_meal_for_user(meal, goal, dietary):
    """
    Compute a preference affinity score for a meal given user goal/dietary.
    Higher scores mean the user is more likely to enjoy this meal.

    Parameters:
        meal    (dict): A row from nutrition_data.
        goal    (str):  User's goal type.
        dietary (list): User's dietary preferences.

    Returns:
        float: Affinity score (minimum 0.1, no upper bound).

    Called by:
        generate_synthetic_data() — for weighted meal sampling.
        Also used to determine action-type probabilities.
    """
    score = 1.0  # base weight
    meal_tags = [t.lower() for t in (meal.get('tags') or [])]

    # Goal-based affinity: reward meals that align with the user's goal
    if goal == 'Muscle Gain' and 'high protein' in meal_tags:
        score += 2.0
    if goal == 'Weight Loss' and 'low calorie' in meal_tags:
        score += 2.0
    if goal == 'Weight Loss' and (meal.get('calories') or 0) > 600:
        score -= 1.0

    # Dietary affinity: reward meals that match dietary preferences
    for pref in (dietary or []):
        if pref.lower() in meal_tags:
            score += 1.5

    return max(score, 0.1)  # never zero


def get_action_weights(affinity_score):
    """
    Return action probability weights based on how well a meal
    fits the user.  High-affinity meals are mostly eaten/saved;
    low-affinity meals are mostly swapped/rejected.

    Parameters:
        affinity_score (float): Output of score_meal_for_user().

    Returns:
        dict: {action_type: probability_weight}.

    Called by:
        generate_synthetic_data() — to pick a realistic action type
        for each user-meal interaction.
    """
    if affinity_score >= 3.5:
        # High affinity: user likely eats/saves it
        return {'eaten': 0.75, 'saved': 0.12, 'viewed': 0.05,
                'swapped': 0.05, 'rejected': 0.03}
    elif affinity_score >= 2.0:
        # Medium affinity: default distribution
        return {'eaten': 0.55, 'saved': 0.12, 'viewed': 0.15,
                'swapped': 0.12, 'rejected': 0.06}
    else:
        # Low affinity: user likely swaps/rejects
        return {'eaten': 0.20, 'saved': 0.05, 'viewed': 0.20,
                'swapped': 0.30, 'rejected': 0.25}


# ===================== MAIN GENERATOR ========================
# The generate_synthetic_data() function orchestrates all 5 phases.
# =============================================================

def generate_synthetic_data():
    """
    Run the full synthetic data generation pipeline.

    Parameters:
        None — all configuration comes from module-level constants.

    Returns:
        None — progress and summary are printed to stdout.

    When / why it is called:
        Invoked from the __main__ guard.  Run once to populate the
        database with synthetic interaction data for CF training.
    """
    print("")
    print("=" * 60)
    print("  MUTAAFI Synthetic Data Generator")
    print("=" * 60)

    # Validate env vars
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        print("")
        print("[ERROR] Missing environment variables.")
        print("  Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        print("  are both set in your backend/.env file.")
        print("")
        return

    # Connect with service role key (bypasses RLS, enables admin auth API)
    print("")
    print("[INFO] Connecting to Supabase with service role key...")
    client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
    print("[INFO] Connected successfully.")
    print("")

    # ═══════════════════════════════════════════════════════════
    # Phase 1: Fetch all meals from nutrition_data
    # ═══════════════════════════════════════════════════════════
    print("-" * 60)
    print("[Phase 1/5] Fetching meals from nutrition_data...")
    meals_res = client.table('nutrition_data').select(
        'meal_id, meal_name, calories, protein, tags, allergies'
    ).execute()
    all_meals = meals_res.data
    print(f"           Found {len(all_meals)} meals.")
    print("")

    if len(all_meals) == 0:
        print("[ERROR] No meals found. Populate nutrition_data first.")
        return

    # ═══════════════════════════════════════════════════════════
    # Phase 2: Create synthetic auth users + profiles
    # ═══════════════════════════════════════════════════════════
    print("-" * 60)
    print(f"[Phase 2/5] Creating {NUM_SYNTHETIC_USERS} synthetic auth users...")
    created_users  = []
    timestamp_seed = int(time.time())

    for i in range(1, NUM_SYNTHETIC_USERS + 1):
        # Randomly generate a realistic user profile
        gender    = random.choice(GENDERS)
        age       = random.randint(18, 55)
        height    = round(random.uniform(158, 193), 1) if gender == 'male' else round(random.uniform(150, 178), 1)
        weight    = round(random.uniform(58, 102), 1)  if gender == 'male' else round(random.uniform(47, 85), 1)
        goal      = random.choice(GOAL_TYPES)
        fitness   = random.choice(FITNESS_LEVELS)
        dietary   = random.choice(DIETARY_POOLS)
        allergies = random.choice(ALLERGY_POOLS)

        # Calculate calorie/protein targets using Mifflin-St Jeor
        target_cal, target_prot = calculate_targets(age, gender, height, weight, goal)

        # Unique email per run (timestamp_seed prevents collisions on re-runs)
        email    = f"syn_user_{i}_{timestamp_seed}@mutaafi-test.com"
        password = "SyntheticPass@2025!"

        try:
            # Create user in Supabase Auth via Admin API
            auth_res = client.auth.admin.create_user({
                "email":         email,
                "password":      password,
                "email_confirm": True,   # Skip email confirmation step
            })
            user_id = auth_res.user.id

            # Upsert profile into user_data (upsert handles auto-created rows)
            client.table('user_data').upsert({
                "user_id":             user_id,
                "age":                 age,
                "gender":              gender,
                "height":              height,
                "weight":              weight,
                "fitness_level":       fitness,
                "goal_type":           goal,
                "target_calories":     target_cal,
                "target_protein":      target_prot,
                "dietary_preferences": dietary,
                "allergies":           allergies,
            }, on_conflict="user_id").execute()

            created_users.append({
                "user_id":  user_id,
                "goal":     goal,
                "dietary":  dietary,
                "allergies": allergies,
                "email":    email,
            })

            diet_str    = (", ".join(dietary)   if dietary   else "None").ljust(22)
            allergy_str = (", ".join(allergies) if allergies else "None")
            print(f"  [OK] {i:02d}/{NUM_SYNTHETIC_USERS} | {gender.ljust(6)} | {goal.ljust(14)} | Diet: {diet_str} | Allergy: {allergy_str}")

        except Exception as e:
            print(f"  [FAIL] {i:02d}/{NUM_SYNTHETIC_USERS} : {e}")

    print("")
    print(f"  --> {len(created_users)} users created successfully.")
    print("")

    if len(created_users) == 0:
        print("[ERROR] No users were created. Aborting interaction generation.")
        return

    # ═══════════════════════════════════════════════════════════
    # Phase 3: Generate meal interactions per user
    # ═══════════════════════════════════════════════════════════
    print("-" * 60)
    print("[Phase 3/5] Generating meal interactions...")
    all_interactions = []
    skipped_users    = 0

    for user in created_users:
        user_allergies = user['allergies']
        user_dietary   = user['dietary']

        # Filter meals that are safe (no allergen conflicts)
        safe_meals = [m for m in all_meals if is_meal_safe(m, user_allergies)]

        # Filter meals that match dietary preferences via tags
        matching_meals = [m for m in safe_meals if meal_matches_dietary(m, user_dietary)]

        # If too few preference-matching meals, fall back to all safe meals
        eligible_meals = matching_meals if len(matching_meals) >= 10 else safe_meals

        if len(eligible_meals) < 5:
            print(f"  [SKIP] User {user['user_id'][:8]}... only {len(eligible_meals)} eligible meals.")
            skipped_users += 1
            continue

        # Weighted sampling based on preference affinity (not uniform random)
        available = len(eligible_meals)
        low       = min(MIN_INTERACTIONS, available)
        high      = min(MAX_INTERACTIONS, available)
        n         = random.randint(low, high)
        weights   = [score_meal_for_user(m, user['goal'], user['dietary'])
                     for m in eligible_meals]
        sampled_raw = random.choices(eligible_meals, weights=weights, k=n)

        # random.choices allows duplicates — deduplicate while preserving order
        seen = set()
        sampled_meals = []
        for m in sampled_raw:
            if m['meal_id'] not in seen:
                seen.add(m['meal_id'])
                sampled_meals.append(m)

        for meal in sampled_meals:
            # Determine action type based on meal-user affinity
            affinity = score_meal_for_user(meal, user['goal'], user['dietary'])
            aw       = get_action_weights(affinity)
            action   = random.choices(
                list(aw.keys()), weights=list(aw.values()), k=1
            )[0]

            pref_score = PREFERENCE_SCORE_MAP[action]

            # Assign explicit_rating based on action and affinity
            if action == 'eaten':
                if affinity >= 3.5:
                    explicit_rating = random.randint(4, 5)
                elif affinity >= 2.0:
                    explicit_rating = random.randint(3, 4)
                else:
                    explicit_rating = random.randint(1, 3)
                is_explicit_flag = True
            elif action == 'saved':
                explicit_rating  = random.randint(4, 5)
                is_explicit_flag = True
            else:
                explicit_rating  = None
                is_explicit_flag = False

            # Spread timestamps randomly over the last 90 days
            days_ago = random.randint(0, 90)
            hours    = random.randint(6, 22)
            ts       = datetime.now() - timedelta(days=days_ago, hours=(24 - hours))

            all_interactions.append({
                "user_id":          user['user_id'],
                "meal_id":          meal['meal_id'],
                "plan_id":          None,
                "action_type":      action,
                "explicit_rating":  explicit_rating,
                "preference_score": pref_score,
                "is_implicit":      not is_explicit_flag,
                "timestamp":        ts.isoformat(),
            })

    print(f"  --> Generated {len(all_interactions)} interactions total.")
    print(f"  --> {skipped_users} users skipped (too few eligible meals).")
    print("")

    # ═══════════════════════════════════════════════════════════
    # Phase 4: Bulk insert all interactions
    # ═══════════════════════════════════════════════════════════
    print("-" * 60)
    print(f"[Phase 4/5] Inserting {len(all_interactions)} interactions (batch size: {CHUNK_SIZE})...")

    inserted_total = 0
    for start in range(0, len(all_interactions), CHUNK_SIZE):
        chunk = all_interactions[start : start + CHUNK_SIZE]
        end   = min(start + CHUNK_SIZE, len(all_interactions))
        try:
            client.table('user_meal_interactions').insert(chunk).execute()
            inserted_total += len(chunk)
            print(f"  [OK] Records {start + 1} to {end} inserted.")
        except Exception as e:
            print(f"  [FAIL] Records {start + 1} to {end} : {e}")

    # ═══════════════════════════════════════════════════════════
    # Phase 5: Populate user_meal_plan with is_completed signal
    # The CF model uses is_completed as a strong +1.5 boost.
    # ═══════════════════════════════════════════════════════════
    print("-" * 60)
    print("[Phase 5/5] Inserting user_meal_plan rows for 'eaten' actions...")
    plan_rows = []
    for interaction in all_interactions:
        if interaction['action_type'] == 'eaten':
            plan_rows.append({
                "user_id":       interaction['user_id'],
                "meal_id":       interaction['meal_id'],
                "plan_date":     interaction['timestamp'][:10],
                "is_completed":  True,
                "slot_name":     None,
            })

    plan_inserted = 0
    for start in range(0, len(plan_rows), CHUNK_SIZE):
        chunk = plan_rows[start : start + CHUNK_SIZE]
        end   = min(start + CHUNK_SIZE, len(plan_rows))
        try:
            client.table('user_meal_plan').insert(chunk).execute()
            plan_inserted += len(chunk)
            print(f"  [OK] Plan rows {start + 1} to {end} inserted.")
        except Exception as e:
            print(f"  [FAIL] Plan rows {start + 1} to {end} : {e}")

    # ═══════════════════════════════════════════════════════════
    # Summary
    # ═══════════════════════════════════════════════════════════
    print("")
    print("=" * 60)
    print("  GENERATION COMPLETE")
    print("=" * 60)
    print(f"  Auth users created  : {len(created_users)}")
    print(f"  Users skipped       : {skipped_users}")
    print(f"  Interactions stored : {inserted_total}")
    print(f"  Meal plan rows      : {plan_inserted}")
    print(f"  Avg per user        : {inserted_total // max(len(created_users), 1)}")
    print("=" * 60)
    print("")
    print("  IMPORTANT: These are TEST accounts.")
    print("  Email pattern : syn_user_*@mutaafi-test.com")
    print("  Password      : SyntheticPass@2025!")
    print("  Delete them in Supabase Dashboard -> Authentication")
    print("  before going to production.")
    print("")


# ======================== ENTRY POINT ========================
if __name__ == '__main__':
    generate_synthetic_data()
