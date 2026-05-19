#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
workout_planner.py — AI-Powered Weekly Workout Plan Generation Engine
======================================================================
FILE:    workout_planner.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    Generates a personalised 7-day workout plan by:
      1. Predicting the optimal schedule type (e.g. "PPL 2x") using a
         pre-trained Random Forest classifier, OR accepting a manual
         day count from the user.
      2. Selecting exercises for each training day using a config-driven
         engine that targets specific muscles, respects difficulty level
         and equipment access, and avoids duplicates across days.
      3. Saving the plan to the database and scheduling it on the
         current week's calendar.

HOW IT FITS IN THE PROJECT:
    This module is imported by app.py and called from Flask endpoints:
      /api/workout/generate-plan  → generate_workout_plan()
      /api/workout/swap-exercise   → swap_exercise()
      /api/workout/accept-plan     → accept_plan()
    It does NOT run standalone.

PUBLIC API:
    generate_workout_plan(user_id, client, mode, manual_days) → plan dict
    swap_exercise(muscle_group, specific_muscle, …, client) → exercise dict
    accept_plan(user_id, plan_id, weekly_plan, client) → result dict
"""

import os
import random
import numpy as np
import joblib

# ─────────────────────────────────────────────────────────────────────────────
#  LOAD ML MODEL ARTIFACTS
# ─────────────────────────────────────────────────────────────────────────────
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "ml_models")

try:
    rf_model      = joblib.load(os.path.join(_MODEL_DIR, "rf_workout_model.pkl"))
    label_encoder = joblib.load(os.path.join(_MODEL_DIR, "label_encoder.pkl"))
    scaler        = joblib.load(os.path.join(_MODEL_DIR, "scaler.pkl"))
    feature_cols  = joblib.load(os.path.join(_MODEL_DIR, "feature_cols.pkl"))
    print("[workout_planner] ML model loaded successfully.")
except Exception as e:
    rf_model = label_encoder = scaler = feature_cols = None
    print(f"[workout_planner] WARNING: Could not load ML model: {e}")

# ─────────────────────────────────────────────────────────────────────────────
#  MAPPING DICTS  (DB values → model values)
# ─────────────────────────────────────────────────────────────────────────────
ACTIVITY_LEVEL_MAP = {
    "Sedentary (Little to no exercise)": 1,
    "Lightly active (1-2 days/week)":    2,
    "Moderately active (3-4 days/week)": 3,
    "Very active (5-6 days/week)":       4,
    "Extra active (Physical job)":       5,
}

GOAL_MAP = {
    "Weight Loss":  "weight_loss",
    "Muscle Gain":  "muscle_gain",
    "Maintenance":  "maintenance",
}

EXPERIENCE_MAP = {"Beginner": 1, "Intermediate": 2, "Advanced": 3}
GENDER_MAP     = {"Male": 1, "Female": 0}

SCHEDULE_TO_DAYS = {
    "Full Body":      1,
    "Full Body 2x":   2,
    "UL + Full Body": 3,
    "UL 2x":          4,
    "PPL + UL":       5,
    "PPL 2x":         6,
}

DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday",
             "Thursday", "Friday", "Saturday"]

DAY_LABEL_COLORS = {
    "Push":      "orange",
    "Pull":      "blue",
    "Legs":      "green",
    "Upper":     "purple",
    "Lower":     "amber",
    "Full Body": "teal",
    "Rest":      "gray",
}

# ─────────────────────────────────────────────────────────────────────────────
#  SETS / REPS / CARDIO PROTOCOL
# ─────────────────────────────────────────────────────────────────────────────
PROTOCOL = {
    ("muscle_gain",  "Beginner"):     (3, 12),
    ("muscle_gain",  "Intermediate"): (4, 10),
    ("muscle_gain",  "Advanced"):     (4, 8),
    ("weight_loss",  "Beginner"):     (3, 15),
    ("weight_loss",  "Intermediate"): (3, 15),
    ("weight_loss",  "Advanced"):     (4, 12),
    ("maintenance",  "Beginner"):     (3, 12),
    ("maintenance",  "Intermediate"): (3, 12),
    ("maintenance",  "Advanced"):     (3, 12),
}

CARDIO_DURATION = {
    "weight_loss":  30,
    "muscle_gain":  15,
    "maintenance":  15,
}

# ─────────────────────────────────────────────────────────────────────────────
#  SPECIFIC-MUSCLE REFERENCE MAP
# ─────────────────────────────────────────────────────────────────────────────
SPECIFIC_MUSCLE_MAP = {
    "Chest":      ["middle chest", "upper chest", "fly"],
    "Triceps":    ["dip", "overhead"],
    "Shoulders":  ["front delt", "lateral raise", "rear delt"],
    "Back":       ["upper lats", "upper back", "lower lats", "traps", "lower back"],
    "Biceps":     ["short head biceps", "long head biceps", "hammer"],
    "Quadriceps": ["squat", "quadriceps", "side quadriceps"],
    "Hamstrings": ["hamstrings"],
    "Calves":     ["calves"],
    "Glutes":     ["glutes"],
    "Abs":        ["upper abs", "lower abs", "side abs"],
}

# ─────────────────────────────────────────────────────────────────────────────
#  DAY-TYPE SELECTION CONFIGS
#  Each config: { "MuscleGroup": {"targets": [...], "count": N (optional)} }
#  "targets" = which specific_muscle values to select (1 exercise each).
#  "count"   = override when you want N exercises from a single specific_muscle.
# ─────────────────────────────────────────────────────────────────────────────

PUSH_CONFIG = {
    "Chest":     {"targets": ["middle chest", "upper chest", "fly"]},
    "Shoulders": {"targets": ["front delt", "lateral raise"]},
    "Triceps":   {"targets": ["dip", "overhead"]},
}

PULL_CONFIG = {
    "Back":      {"targets": ["upper lats", "upper back", "lower lats", "traps", "lower back"]},
    "Biceps":    {"targets": ["short head biceps", "long head biceps", "hammer"]},
    "Shoulders": {"targets": ["rear delt"]},
}

LOWER_CONFIG = {
    "Quadriceps": {"targets": ["squat", "quadriceps", "side quadriceps"]},
    "Hamstrings": {"targets": ["hamstrings"], "count": 2},
    "Glutes":     {"targets": ["glutes"]},
    "Calves":     {"targets": ["calves"]},
    "Abs":        {"targets": ["upper abs", "lower abs"]},
}

UPPER_SOLO_CONFIG = {
    "Chest":     {"targets": ["middle chest", "upper chest", "fly"]},
    "Back":      {"targets": ["upper lats", "upper back", "lower lats"]},
    "Shoulders": {"targets": ["front delt", "lateral raise", "rear delt"]},
    "Triceps":   {"targets": ["dip", "overhead"]},
    "Biceps":    {"targets": ["short head biceps", "long head biceps"]},
}
# Total: 3+3+3+2+2 = 13 exercises

# When 2 Upper days exist, reduce chest to 2 and biceps to 1 per day.
# Day A and Day B alternate variants so all are covered across the week.
UPPER_MULTI_A_CONFIG = {
    "Chest":     {"targets": ["middle chest", "upper chest"]},
    "Back":      {"targets": ["upper lats", "upper back", "lower lats"]},
    "Shoulders": {"targets": ["front delt", "lateral raise", "rear delt"]},
    "Triceps":   {"targets": ["dip", "overhead"]},
    "Biceps":    {"targets": ["short head biceps"]},
}
# Total: 2+3+3+2+1 = 11 exercises

UPPER_MULTI_B_CONFIG = {
    "Chest":     {"targets": ["middle chest", "fly"]},
    "Back":      {"targets": ["upper lats", "upper back", "lower lats"]},
    "Shoulders": {"targets": ["front delt", "lateral raise", "rear delt"]},
    "Triceps":   {"targets": ["dip", "overhead"]},
    "Biceps":    {"targets": ["long head biceps"]},
}
# Total: 2+3+3+2+1 = 11 exercises

FULLBODY_1DAY_CONFIG = {
    "Chest":      {"targets": ["middle chest"]},
    "Back":       {"targets": ["upper lats"]},
    "Shoulders":  {"targets": ["front delt", "lateral raise", "rear delt"]},
    "Triceps":    {"targets": ["dip"]},
    "Biceps":     {"targets": ["short head biceps"]},
    "Quadriceps": {"targets": ["squat"]},
    "Hamstrings": {"targets": ["hamstrings"]},
    "Calves":     {"targets": ["calves"]},
    "Glutes":     {"targets": ["glutes"]},
    "Abs":        {"targets": ["upper abs", "lower abs"]},
}
# Total: 1+1+3+1+1+1+1+1+1+2 = 13 exercises

FULLBODY_2DAY_A_CONFIG = {
    "Chest":      {"targets": ["middle chest", "fly"]},
    "Back":       {"targets": ["upper lats"]},
    "Shoulders":  {"targets": ["front delt", "rear delt"]},
    "Triceps":    {"targets": ["dip"]},
    "Biceps":     {"targets": ["short head biceps", "hammer"]},
    "Quadriceps": {"targets": ["squat"]},
    "Hamstrings": {"targets": ["hamstrings"]},
    "Calves":     {"targets": ["calves"]},
    "Glutes":     {"targets": ["glutes"]},
    "Abs":        {"targets": ["upper abs", "lower abs"]},
}
# Day 1: middle chest + fly, short head + hammer → covers fly and hammer

FULLBODY_2DAY_B_CONFIG = {
    "Chest":      {"targets": ["upper chest"]},
    "Back":       {"targets": ["upper back"]},
    "Shoulders":  {"targets": ["lateral raise", "rear delt"]},
    "Triceps":    {"targets": ["overhead"]},
    "Biceps":     {"targets": ["long head biceps"]},
    "Quadriceps": {"targets": ["quadriceps"]},
    "Hamstrings": {"targets": ["hamstrings"]},
    "Calves":     {"targets": ["calves"]},
    "Glutes":     {"targets": ["glutes"]},
    "Abs":        {"targets": ["upper abs", "lower abs"]},
}



# ─────────────────────────────────────────────────────────────────────────────
#  1. MODEL PREDICTION
# ─────────────────────────────────────────────────────────────────────────────

def predict_schedule(user_data):
    """
    Run the Random Forest model on user profile data to predict
    the optimal workout schedule type.

    Parameters:
        user_data (dict): User profile with keys: goal_type,
            experience_level, fitness_level, equipment_access,
            gender, age, height, weight.

    Returns:
        tuple: (schedule_type: str, days_available: int,
                confidence_score: float).

    Called by:
        generate_workout_plan() when mode='ai'.
    """
    if rf_model is None:
        raise RuntimeError("Workout ML model is not loaded. Run train_workout_model.py first.")

    # Map DB values to model feature values
    goal_model  = GOAL_MAP.get(user_data.get("goal_type", "Maintenance"), "maintenance")
    exp_ordinal = EXPERIENCE_MAP.get(user_data.get("experience_level", "Beginner"), 1)
    fit_ordinal = ACTIVITY_LEVEL_MAP.get(user_data.get("fitness_level", ""), 2)
    equip_bin   = 1 if user_data.get("equipment_access", "gym") == "gym" else 0
    gender_bin  = GENDER_MAP.get(user_data.get("gender", "Male"), 1)
    age         = user_data.get("age", 25)

    height_cm = user_data.get("height", 170)
    weight_kg = user_data.get("weight", 70)
    bmi = round(weight_kg / ((height_cm / 100) ** 2), 2) if height_cm > 0 else 22.0

    # Build feature vector in the EXACT order expected by the model
    feature_dict = {
        "experience_level":  exp_ordinal,
        "fitness_level":     fit_ordinal,
        "equipment_access":  equip_bin,
        "gender":            gender_bin,
        "goal_muscle_gain":  1 if goal_model == "muscle_gain" else 0,
        "goal_weight_loss":  1 if goal_model == "weight_loss" else 0,
        "goal_maintenance":  1 if goal_model == "maintenance" else 0,
        "age":               age,
        "bmi":               bmi,
    }

    # Order features according to training column order
    feature_vector = [feature_dict.get(col, 0) for col in feature_cols]
    X = np.array([feature_vector])
    X_scaled = scaler.transform(X)

    # Predict
    pred_encoded = rf_model.predict(X_scaled)[0]
    probabilities = rf_model.predict_proba(X_scaled)[0]
    confidence = float(max(probabilities))

    schedule_type = label_encoder.inverse_transform([pred_encoded])[0]
    days_available = SCHEDULE_TO_DAYS.get(schedule_type, 3)

    return schedule_type, days_available, confidence



# ─────────────────────────────────────────────────────────────────────────────
#  2. EXERCISE SELECTION  (specific_muscle-driven)
# ─────────────────────────────────────────────────────────────────────────────

def _filter_exercise_pool(muscle_group, specific_muscle, experience_level,
                          equipment_access, all_exercises, excluded_ids):
    """
    Build a filtered candidate pool for ONE (muscle_group, specific_muscle)
    pair.  Applies equipment, difficulty, and exclusion filters.

    Parameters:
        muscle_group     (str):  e.g. 'Chest', 'Back', 'Cardio'.
        specific_muscle  (str):  e.g. 'upper chest', 'upper lats'.
        experience_level (str):  'Beginner', 'Intermediate', 'Advanced'.
        equipment_access (str):  'gym' or 'home'.
        all_exercises    (list): Every row from workout_data.
        excluded_ids     (set):  Exercise IDs already used.

    Returns:
        list[dict]: Matching exercises (may be empty).

    Called by:
        select_exercise_for_specific_muscle().
    """
    pool = [e for e in all_exercises
            if e.get("muscle_group") == muscle_group
            and e.get("specific_muscle") == specific_muscle
            and e.get("exercise_id") not in excluded_ids]

    # Equipment filter
    if equipment_access == "home":
        pool = [e for e in pool if e.get("gym") is False]
    elif equipment_access == "gym":
        gym_pool = [e for e in pool if e.get("gym") is True]
        if gym_pool:
            pool = gym_pool

    # Difficulty filter (skip for Cardio)
    if muscle_group != "Cardio":
        allowed_levels = {
            "Beginner":     ["Beginner"],
            "Intermediate": ["Beginner", "Intermediate"],
            "Advanced":     ["Beginner", "Intermediate", "Advanced"],
        }
        allowed = allowed_levels.get(experience_level, ["Beginner"])
        pool = [e for e in pool if e.get("difficulty_level") in allowed]

    return pool


def select_exercise_for_specific_muscle(muscle_group, specific_muscle,
                                         experience_level, equipment_access,
                                         all_exercises, excluded_ids):
    """
    Select ONE exercise for a (muscle_group, specific_muscle) pair.

    Parameters:
        muscle_group     (str):  Target muscle group.
        specific_muscle  (str):  Target specific muscle.
        experience_level (str):  User's experience level.
        equipment_access (str):  'gym' or 'home'.
        all_exercises    (list): All exercises from workout_data.
        excluded_ids     (set):  IDs already in use.

    Returns:
        dict or None: A randomly chosen exercise from the pool.

    Called by:
        select_exercises_for_day().
    """
    pool = _filter_exercise_pool(
        muscle_group, specific_muscle, experience_level,
        equipment_access, all_exercises, excluded_ids
    )
    if not pool:
        return None
    return random.choice(pool)


def select_exercises_for_muscle_group(muscle_group, experience_level,
                                      equipment_access, all_exercises,
                                      excluded_ids=None):
    """
    Legacy helper — used only for Cardio selection.
    Picks one random exercise from the given muscle_group.

    Parameters:
        muscle_group     (str):  e.g. 'Cardio'.
        experience_level (str):  User's experience level.
        equipment_access (str):  'gym' or 'home'.
        all_exercises    (list): All exercises from workout_data.
        excluded_ids     (set):  IDs already in use.

    Returns:
        list[dict]: A list with one exercise dict, or empty list.

    Called by:
        build_weekly_plan() — to add a cardio finisher to each day.
    """
    excluded_ids = excluded_ids or set()
    pool = [e for e in all_exercises
            if e.get("muscle_group") == muscle_group
            and e.get("exercise_id") not in excluded_ids]

    if equipment_access == "home":
        pool = [e for e in pool if e.get("gym") is False]
    elif equipment_access == "gym":
        gym_pool = [e for e in pool if e.get("gym") is True]
        if gym_pool:
            pool = gym_pool

    if not pool:
        return []
    return [random.choice(pool)]


def _resolve_day_config(day_label, days_available, fb_index, upper_count,
                        upper_seen=0):
    """
    Return the correct selection config dict for a training day.

    Args:
        day_label:      "Push" | "Pull" | "Legs" | "Upper" | "Lower" | "Full Body"
        days_available: total training days per week (1–6)
        fb_index:       0-based index of this Full Body day within the week
        upper_count:    how many Upper days exist in this week's schedule
        upper_seen:     how many Upper days have been processed so far (0 or 1)
    """
    if day_label == "Push":
        return PUSH_CONFIG
    if day_label == "Pull":
        return PULL_CONFIG
    if day_label in ("Legs", "Lower"):
        return LOWER_CONFIG
    if day_label == "Upper":
        if upper_count <= 1:
            return UPPER_SOLO_CONFIG
        # 2+ Upper days: alternate A/B configs
        return UPPER_MULTI_A_CONFIG if upper_seen == 0 else UPPER_MULTI_B_CONFIG
    if day_label == "Full Body":
        if days_available == 1:
            return FULLBODY_1DAY_CONFIG
        if days_available == 2:
            return FULLBODY_2DAY_A_CONFIG if fb_index == 0 else FULLBODY_2DAY_B_CONFIG
        # 3-day split (UL + FB): the single FB day uses the 1-day config
        return FULLBODY_1DAY_CONFIG
    return {}


def select_exercises_for_day(day_config, experience_level, equipment_access,
                              all_exercises, excluded_ids):
    """
    Select all exercises for a single training day using a config dict.
    Iterates through each muscle group's target list and picks one
    exercise per specific_muscle.

    Parameters:
        day_config       (dict): Muscle group configs for this day.
        experience_level (str):  User's experience level.
        equipment_access (str):  'gym' or 'home'.
        all_exercises    (list): All exercises from workout_data.
        excluded_ids     (set):  IDs already used (mutated in-place).

    Returns:
        list[dict]: Selected exercises (no duplicate specific_muscles).

    Called by:
        build_weekly_plan().
    """
    exercises = []
    used_specific = set()

    for muscle_group, spec in day_config.items():
        targets = spec.get("targets", [])
        count   = spec.get("count")  # override for multi-pick from same target

        if count and len(targets) == 1:
            # Pick N different exercises from the same specific_muscle
            target_sm = targets[0]
            for _ in range(count):
                ex = select_exercise_for_specific_muscle(
                    muscle_group, target_sm, experience_level,
                    equipment_access, all_exercises, excluded_ids
                )
                if ex:
                    exercises.append(ex)
                    excluded_ids.add(ex["exercise_id"])
        else:
            # Pick 1 exercise per target specific_muscle
            for target_sm in targets:
                if target_sm in used_specific:
                    continue
                ex = select_exercise_for_specific_muscle(
                    muscle_group, target_sm, experience_level,
                    equipment_access, all_exercises, excluded_ids
                )
                if ex:
                    exercises.append(ex)
                    excluded_ids.add(ex["exercise_id"])
                    used_specific.add(target_sm)

    return exercises


# ─────────────────────────────────────────────────────────────────────────────
#  3. BUILD WEEKLY PLAN
# ─────────────────────────────────────────────────────────────────────────────

def build_weekly_plan(schedule_type, days_available, experience_level,
                      equipment_access, goal_type, all_exercises, templates):
    """
    Build the full 7-day workout plan using split templates and
    config-driven exercise selection.

    Parameters:
        schedule_type    (str):  e.g. 'PPL 2x', 'UL + Full Body'.
        days_available   (int):  Number of training days (1–6).
        experience_level (str):  'Beginner', 'Intermediate', 'Advanced'.
        equipment_access (str):  'gym' or 'home'.
        goal_type        (str):  'Weight Loss', 'Muscle Gain', 'Maintenance'.
        all_exercises    (list): Every exercise from workout_data.
        templates        (list): All rows from workout_split_templates.

    Returns:
        list[dict]: 7 day dicts, each with exercises, labels, etc.

    Called by:
        generate_workout_plan().
    """
    goal_model = GOAL_MAP.get(goal_type, "maintenance")
    sets, reps = PROTOCOL.get((goal_model, experience_level), (3, 12))
    cardio_minutes = CARDIO_DURATION.get(goal_model, 15)

    # Get templates for this schedule
    day_templates = [t for t in templates if t["days_available"] == days_available]
    day_templates.sort(key=lambda t: t["week_day"])

    # Pre-compute how many Upper and Full Body days exist in this schedule
    upper_count = sum(1 for t in day_templates if t.get("day_label") == "Upper")
    fb_days = [t for t in day_templates if t.get("day_label") == "Full Body"]
    fb_days.sort(key=lambda t: t["week_day"])
    fb_index_map = {t["week_day"]: i for i, t in enumerate(fb_days)}

    # For 2-day Full Body: track Day 1 exercises to exclude from Day 2
    fb_day1_exercise_ids = set()
    # For multi-Upper: track first Upper day exercises to exclude from second
    upper_day1_exercise_ids = set()
    upper_seen = 0

    weekly_plan = []
    for week_day in range(7):
        template = next((t for t in day_templates if t["week_day"] == week_day), None)

        if not template or template["day_label"] == "Rest":
            weekly_plan.append({
                "week_day":   week_day,
                "day_name":   DAY_NAMES[week_day],
                "day_label":  "Rest",
                "label_color": DAY_LABEL_COLORS["Rest"],
                "is_rest":    True,
                "exercises":  [],
            })
            continue

        day_label = template["day_label"]
        used_exercise_ids = set()

        # For 2-day Full Body Day 2: exclude Day 1 exercises
        fb_idx = fb_index_map.get(week_day, 0)
        if day_label == "Full Body" and days_available == 2 and fb_idx == 1:
            used_exercise_ids |= fb_day1_exercise_ids

        # For multi-Upper Day 2: exclude Day 1 exercises
        if day_label == "Upper" and upper_count >= 2 and upper_seen >= 1:
            used_exercise_ids |= upper_day1_exercise_ids

        # Resolve the config for this day
        day_config = _resolve_day_config(
            day_label, days_available, fb_idx, upper_count, upper_seen
        )

        # Select exercises using config
        selected = select_exercises_for_day(
            day_config, experience_level, equipment_access,
            all_exercises, used_exercise_ids
        )

        # Track exercises for cross-day variety
        selected_ids = {ex["exercise_id"] for ex in selected}
        if day_label == "Full Body" and days_available == 2 and fb_idx == 0:
            fb_day1_exercise_ids = selected_ids.copy()
        if day_label == "Upper" and upper_count >= 2 and upper_seen == 0:
            upper_day1_exercise_ids = selected_ids.copy()
            upper_seen += 1
        elif day_label == "Upper":
            upper_seen += 1

        # Build exercise list with metadata
        exercises = []
        for ex in selected:
            exercises.append({
                "exercise_id":     ex["exercise_id"],
                "name":            ex.get("name", ""),
                "muscle_group":    ex.get("muscle_group", ""),
                "specific_muscle": ex.get("specific_muscle"),
                "equipment":       ex.get("equipment", ""),
                "image_url":       ex.get("image_url", ""),
                "video_url":       ex.get("video_url", ""),
                "difficulty_level": ex.get("difficulty_level", ""),
                "sets":            sets,
                "reps":            reps,
                "is_cardio":       False,
                "duration_minutes": None,
            })

        # Add cardio exercise at the end
        cardio_pool = select_exercises_for_muscle_group(
            "Cardio", experience_level, equipment_access,
            all_exercises, used_exercise_ids
        )
        if cardio_pool:
            cardio_ex = cardio_pool[0]
            exercises.append({
                "exercise_id":     cardio_ex["exercise_id"],
                "name":            cardio_ex.get("name", ""),
                "muscle_group":    "Cardio",
                "specific_muscle": cardio_ex.get("specific_muscle"),
                "equipment":       cardio_ex.get("equipment", ""),
                "image_url":       cardio_ex.get("image_url", ""),
                "video_url":       cardio_ex.get("video_url", ""),
                "difficulty_level": cardio_ex.get("difficulty_level", ""),
                "sets":            None,
                "reps":            None,
                "is_cardio":       True,
                "duration_minutes": cardio_minutes,
            })

        weekly_plan.append({
            "week_day":    week_day,
            "day_name":    DAY_NAMES[week_day],
            "day_label":   day_label,
            "label_color": DAY_LABEL_COLORS.get(day_label, "gray"),
            "is_rest":     False,
            "exercises":   exercises,
        })

    return weekly_plan



# ─────────────────────────────────────────────────────────────────────────────
#  4. MAIN GENERATION ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

# Reverse mapping: days_available → schedule_type (for manual mode)
DAYS_TO_SCHEDULE = {v: k for k, v in SCHEDULE_TO_DAYS.items()}


def generate_workout_plan(user_id, client, mode="ai", manual_days=None):
    """
    Full workout plan generation pipeline.

    Args:
        mode:        "ai" (RF model) or "manual" (user picks days)
        manual_days: int 1-6, required when mode="manual"

    Returns dict with schedule_type, days_available, confidence, plan_mode,
    plan_id, weekly_plan.
    """
    # Fetch user profile
    user_res = client.table("user_data").select(
        "age, gender, height, weight, fitness_level, goal_type, "
        "experience_level, equipment_access"
    ).eq("user_id", user_id).single().execute()

    user_data = user_res.data
    if not user_data:
        raise ValueError("User profile not found")

    experience_level = user_data.get("experience_level") or "Beginner"
    equipment_access = user_data.get("equipment_access") or "gym"
    goal_type        = user_data.get("goal_type") or "Maintenance"

    # Step 1: Determine schedule
    if mode == "manual" and manual_days:
        days_available = int(manual_days)
        schedule_type = DAYS_TO_SCHEDULE.get(days_available, "Full Body")
        confidence = None
    else:
        schedule_type, days_available, confidence = predict_schedule(user_data)
        confidence = round(confidence, 4)

    # Step 2: Fetch all exercises
    exercises_res = client.table("workout_data").select("*").execute()
    all_exercises = exercises_res.data or []

    # Step 3: Fetch split templates
    templates_res = client.table("workout_split_templates").select("*").execute()
    all_templates = templates_res.data or []

    # Step 4: Build the weekly plan
    weekly_plan = build_weekly_plan(
        schedule_type, days_available, experience_level,
        equipment_access, goal_type, all_exercises, all_templates
    )

    # Step 5: Create plan record in DB
    plan_record = {
        "user_id":          user_id,
        "schedule_type":    schedule_type,
        "days_available":   days_available,
        "experience_level": experience_level,
        "equipment_access": equipment_access,
        "confidence_score": confidence,
        "plan_mode":        mode,
        "is_active":        False,
    }
    plan_insert = client.table("workout_plans").insert(plan_record).execute()
    plan_id = plan_insert.data[0]["plan_id"] if plan_insert.data else None

    return {
        "schedule_type":    schedule_type,
        "days_available":   days_available,
        "confidence":       confidence,
        "plan_mode":        mode,
        "plan_id":          plan_id,
        "experience_level": experience_level,
        "equipment_access": equipment_access,
        "weekly_plan":      weekly_plan,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  5. SWAP EXERCISE (stateless)
# ─────────────────────────────────────────────────────────────────────────────

def swap_exercise(muscle_group, specific_muscle, experience_level,
                  equipment_access, used_exercise_ids, client):
    """
    Find an alternative exercise for the same (muscle_group, specific_muscle).
    Always matches specific_muscle for all experience levels.
    Excludes all exercise IDs already in the plan.
    Returns a single exercise dict or None.
    """
    exercises_res = client.table("workout_data").select("*").execute()
    all_exercises = exercises_res.data or []

    used_set = set(used_exercise_ids or [])

    # Always filter by specific_muscle to preserve muscle angle targeting
    if specific_muscle:
        result = select_exercise_for_specific_muscle(
            muscle_group, specific_muscle, experience_level,
            equipment_access, all_exercises, used_set
        )
        if result:
            return result

    # Fallback: any exercise in the muscle group (e.g. if specific_muscle is None)
    candidates = select_exercises_for_muscle_group(
        muscle_group, experience_level, equipment_access,
        all_exercises, used_set
    )
    return candidates[0] if candidates else None



# ─────────────────────────────────────────────────────────────────────────────
#  6. ACCEPT PLAN
# ─────────────────────────────────────────────────────────────────────────────

def accept_plan(user_id, plan_id, weekly_plan, client):
    """
    Finalize and save the accepted workout plan.
    - Deactivate previous plans
    - Activate the new plan
    - Insert exercises into user_workout_schedule
    - Update user_data
    """
    from datetime import date, timedelta

    # Deactivate all previous plans for this user
    client.table("workout_plans").update(
        {"is_active": False}
    ).eq("user_id", user_id).eq("is_active", True).execute()

    # Activate the new plan
    client.table("workout_plans").update(
        {"is_active": True}
    ).eq("plan_id", plan_id).execute()

    # Get the plan metadata for schedule_type and days_available
    plan_res = client.table("workout_plans").select(
        "schedule_type, days_available"
    ).eq("plan_id", plan_id).single().execute()
    plan_data = plan_res.data or {}

    # Calculate the most recent Sunday (or today if it IS Sunday)
    # Python: weekday() returns Mon=0 .. Sun=6
    # JS:     getDay()  returns Sun=0 .. Sat=6
    today = date.today()
    python_weekday = today.weekday()   # Mon=0 .. Sun=6
    # Days since last Sunday: Sun=0 days ago, Mon=1, Tue=2 ... Sat=6
    days_since_sunday = (python_weekday + 1) % 7
    this_sunday = today - timedelta(days=days_since_sunday)

    # Insert schedule rows
    schedule_rows = []
    for day in weekly_plan:
        if day.get("is_rest"):
            continue

        plan_date = this_sunday + timedelta(days=day["week_day"])

        for ex in day.get("exercises", []):
            row = {
                "user_id":      user_id,
                "exercise_id":  ex["exercise_id"],
                "plan_date":    str(plan_date),
                "sets":         ex.get("sets"),
                "reps":         ex.get("reps"),
                "is_completed": False,
                "plan_id":      plan_id,
            }
            if ex.get("is_cardio"):
                row["cardio_minutes"] = ex.get("duration_minutes")
            schedule_rows.append(row)

    if schedule_rows:
        client.table("user_workout_schedule").insert(schedule_rows).execute()

    # Update user_data
    client.table("user_data").update({
        "assigned_schedule": plan_data.get("schedule_type", ""),
        "days_available":    plan_data.get("days_available", 0),
    }).eq("user_id", user_id).execute()

    return {"message": "Plan accepted successfully", "plan_id": plan_id}
