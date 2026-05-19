#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
meal_planner.py — Collaborative Filtering + RMSE Meal Recommendation Engine
=============================================================================
FILE:    meal_planner.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform 

WHAT THIS FILE DOES:
    Generates a personalised daily meal plan (Breakfast, Lunch, Snack,
    Dinner) for a user by combining four stages:
      Stage 1 — Hard-constraint filtering (allergies, dietary prefs, meal tags)
      Stage 2 — User-based Collaborative Filtering (Pearson correlation)
      Stage 3 — Nutritional RMSE scoring (calories + protein vs. targets)
      Stage 4 — Weighted ranking (CF × alpha + RMSE × beta, goal-dependent)

HOW IT FITS IN THE PROJECT:
    This module is imported by app.py and called from the Flask endpoints:
      /api/meal-plan/generate  → generate_daily_plan()
      /api/meal-plan/swap      → swap_single_meal()
      /api/meal-plan/interact  → log_interaction()
    It does NOT run standalone.

PUBLIC API:
    generate_daily_plan(user_id, client)  → full day plan dict
    swap_single_meal(user_id, slot, excluded, client) → new meal dict
    log_interaction(user_id, meal_id, action, client)  → None
"""

import math
import random
from collections import defaultdict

# ─────────────────────────────────────────────────────────────────────────────
#  CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Calorie/protein distribution across meal slots (must sum to ~1.0)
SLOT_CONFIG = [
    {"name": "Breakfast", "cal_pct": 0.30, "prot_pct": 0.30, "tags": ["Breakfast"]},
    {"name": "Lunch",     "cal_pct": 0.30, "prot_pct": 0.30, "tags": ["Lunch"]},
    {"name": "Snack",     "cal_pct": 0.10, "prot_pct": 0.10, "tags": ["Snack", "Snacks"]},
    {"name": "Dinner",    "cal_pct": 0.30, "prot_pct": 0.30, "tags": ["Dinner"]},
]

# CALFIX 3: Rebalanced weights — CF scores are now stronger
# due to explicit_rating and is_completed boosts, so beta must
# increase to keep nutritional accuracy as the primary driver.
GOAL_WEIGHTS = {
    "Weight Loss":  {"alpha": 0.20, "beta": 0.80},
    "Muscle Gain":  {"alpha": 0.15, "beta": 0.85},
    "Maintenance":  {"alpha": 0.35, "beta": 0.65},
}
DEFAULT_WEIGHTS = {"alpha": 0.35, "beta": 0.65}

# FIX 11: Tune CF constants for sparse data
CF_MIN_INTERACTIONS = 2   # was 5 — too high for sparse data, locked out most users
CF_TOP_K_NEIGHBORS  = 20  # was 10 — more neighbors = better coverage in sparse matrix

# Preference score mapping for action_type -> numeric signal
PREF_SCORE_MAP = {
    "eaten":    1,
    "saved":    1,
    "viewed":   0,
    "swapped": -1,
    "rejected": -1,
}


# ─────────────────────────────────────────────────────────────────────────────
#  1. HARD CONSTRAINT FILTER
# ─────────────────────────────────────────────────────────────────────────────

def get_user_profile(user_id, client):
    """
    Fetch the user's profile row from the user_data table.

    Parameters:
        user_id (str):    UUID of the target user.
        client  (Client): Authenticated Supabase client.

    Returns:
        dict: Profile data including target_calories, target_protein,
              goal_type, dietary_preferences, and allergies.

    Called by:
        generate_daily_plan(), swap_single_meal().
    """
    res = client.table('user_data').select(
        'target_calories, target_protein, goal_type, dietary_preferences, allergies'
    ).eq('user_id', user_id).single().execute()
    return res.data


def get_all_meals(client):
    """
    Fetch every meal row from the nutrition_data table.

    Parameters:
        client (Client): Authenticated Supabase client.

    Returns:
        list[dict]: All meal rows with nutritional data and tags.

    Called by:
        generate_daily_plan(), swap_single_meal().
    """
    res = client.table('nutrition_data').select(
        'meal_id, meal_name, calories, protein, carbs, fats, image_url, tags, allergies'
    ).execute()
    return res.data or []


def is_meal_safe(meal, user_allergies):
    """
    Check if a meal is safe for a user (no allergen conflicts).
    Uses substring matching on the meal's allergies text field.

    Parameters:
        meal           (dict): A meal row from nutrition_data.
        user_allergies (list): User's allergy list e.g. ['Nuts','Dairy'].

    Returns:
        bool: True if safe, False if the meal contains an allergen.

    Called by:
        get_eligible_meals().
    """
    if not user_allergies:
        return True
    meal_allergy_text = (meal.get('allergies') or '').lower()
    if not meal_allergy_text:
        return True
    for allergy in user_allergies:
        if allergy.lower() in meal_allergy_text:
            return False
    return True


def meal_has_tag(meal, target_tags):
    """
    Check if a meal's tags array contains any of the target tags.

    Parameters:
        meal        (dict): A meal row with a 'tags' list.
        target_tags (list): Tags to look for e.g. ['Breakfast'].

    Returns:
        bool: True if at least one target tag matches (case-insensitive).

    Called by:
        get_eligible_meals().
    """
    meal_tags = meal.get('tags') or []
    if not meal_tags:
        return False
    meal_tags_lower = [t.lower() for t in meal_tags]
    return any(tt.lower() in meal_tags_lower for tt in target_tags)


def get_eligible_meals(all_meals, user_allergies, user_dietary, slot_config):
    """
    Filter meals by:
      1. Allergy safety
      2. Meal type tag (e.g., 'Breakfast')
      3. Dietary preference match (relaxed for snacks)
    """
    slot_name = slot_config["name"]
    slot_tags = slot_config["tags"]

    # Step 1: Allergy filter
    safe_meals = [m for m in all_meals if is_meal_safe(m, user_allergies)]

    # Step 2: Meal type tag filter
    tagged_meals = [m for m in safe_meals if meal_has_tag(m, slot_tags)]

    # If no meals match the tag, fall back to all safe meals
    # (some datasets may not tag every meal)
    if len(tagged_meals) < 3:
        tagged_meals = safe_meals

    # Step 3: Dietary preference filter
    if user_dietary:
        diet_matched = [
            m for m in tagged_meals
            if any(
                pref.lower() in [t.lower() for t in (m.get('tags') or [])]
                for pref in user_dietary
            )
        ]
        # Snacks get relaxed dietary filter
        if slot_name == "Snack" and len(diet_matched) < 3:
            return tagged_meals
        # For main meals, if too few matches, fall back
        if len(diet_matched) < 5:
            return tagged_meals
        return diet_matched

    return tagged_meals


# ─────────────────────────────────────────────────────────────────────────────
#  1b. DIRECT USER INTERACTION SIGNALS
#  Reads the target user's own reject/save/rating history and returns:
#    - rejected_ids: meals to hard-exclude (rejected or rated <= 2)
#    - user_boosts:  small additive score adjustments for Stage 4
# ─────────────────────────────────────────────────────────────────────────────

def get_user_interaction_signals(user_id, client):
    """
    Fetch the target user's own interaction history.
    Returns:
      rejected_ids  – set of meal_ids to hard-exclude
      user_boosts   – dict { meal_id: float } additive adjustments
    """
    res = client.table('user_meal_interactions').select(
        'meal_id, action_type, explicit_rating'
    ).eq('user_id', user_id).execute()

    rejected = set()
    boosts = defaultdict(float)

    for row in (res.data or []):
        mid = row['meal_id']
        action = row.get('action_type')
        rating = row.get('explicit_rating')

        # ── Hard exclusion: rejected or rated poorly ──
        if action == 'rejected':
            rejected.add(mid)
        if rating is not None and rating <= 2:
            rejected.add(mid)

        # ── Positive signals (keep highest boost per meal) ──
        if action == 'saved':
            boosts[mid] = max(boosts[mid], 0.06)
        if action == 'eaten':
            boosts[mid] = max(boosts[mid], 0.03)
        if rating is not None and rating >= 4:
            boosts[mid] = max(boosts[mid], 0.04)
        if rating is not None and rating == 5:
            boosts[mid] = max(boosts[mid], 0.07)

        # ── Mild negative for swapped (only if no positive exists) ──
        if action == 'swapped' and boosts[mid] <= 0:
            boosts[mid] = min(boosts[mid], -0.03)

    # Never boost a rejected meal
    for mid in rejected:
        boosts.pop(mid, None)

    return rejected, boosts


# ─────────────────────────────────────────────────────────────────────────────
#  2. COLLABORATIVE FILTERING (User-Based, Pearson Correlation)
# ─────────────────────────────────────────────────────────────────────────────

def build_interaction_matrix(client):
    """
    Build a user-meal preference matrix from user_meal_interactions
    and user_meal_plan tables.

    Parameters:
        client (Client): Authenticated Supabase client.

    Returns:
        defaultdict: Nested dict {user_id: {meal_id: blended_score}}.
            Scores blend explicit_rating (normalised to [-1,+1]),
            preference_score, and is_completed boost (+1.5).

    Called by:
        generate_daily_plan(), swap_single_meal().
    """
    # FIX 6: Incorporate explicit_rating into the interaction matrix.
    # Previously only preference_score was read, ignoring explicit_rating
    # entirely. Explicit ratings are the strongest signal in the dataset.
    res = client.table('user_meal_interactions').select(
        'user_id, meal_id, preference_score, explicit_rating, action_type'
    ).execute()

    matrix = defaultdict(lambda: defaultdict(float))
    for row in (res.data or []):
        uid = row['user_id']
        mid = row['meal_id']
        er  = row.get('explicit_rating')
        ps  = row.get('preference_score', 0)

        if er is not None:
            # FIX 6: Normalize 1-5 to [-1, +1], explicit gets 2x weight
            score = ((er - 3) / 2) * 2.0
        else:
            score = ps

        # FIX 6: Use max aggregation (not sum) to avoid score inflation
        matrix[uid][mid] = max(matrix[uid][mid], score)

    # FIX 10: Add is_completed boost from user_meal_plan.
    # user_meal_plan.is_completed is a strong real-world signal (user
    # actually completed and ate the planned meal) but was never read
    # by the CF model.
    completed = client.table('user_meal_plan').select(
        'user_id, meal_id'
    ).eq('is_completed', True).execute()

    for row in (completed.data or []):
        matrix[row['user_id']][row['meal_id']] = max(
            matrix[row['user_id']][row['meal_id']] + 1.5, 1.5
        )

    return matrix


# FIX 7: Replace cosine similarity with Pearson correlation.
# Cosine similarity does not account for user rating bias. A user who
# always rates 4-5 and a user who always rates 1-2 appear dissimilar
# even if their relative preferences are identical.
def pearson_similarity(vec_a, vec_b, common_keys):
    """
    Compute Pearson correlation between two users on their common items.
    Pearson is preferred over cosine because it accounts for user rating
    bias (a user who always rates 4-5 vs one who rates 1-2).

    Parameters:
        vec_a       (dict): Ratings by user A keyed by meal_id.
        vec_b       (dict): Ratings by user B keyed by meal_id.
        common_keys (set):  Meal IDs both users have rated.

    Returns:
        float: Correlation in [-1, 1] (0 if fewer than 2 common items).

    Called by:
        compute_cf_scores().
    """
    if len(common_keys) < 2:
        return 0.0
    mean_a = sum(vec_a[k] for k in common_keys) / len(common_keys)
    mean_b = sum(vec_b[k] for k in common_keys) / len(common_keys)
    num  = sum((vec_a[k] - mean_a) * (vec_b[k] - mean_b) for k in common_keys)
    da   = math.sqrt(sum((vec_a[k] - mean_a) ** 2 for k in common_keys))
    db   = math.sqrt(sum((vec_b[k] - mean_b) ** 2 for k in common_keys))
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


# FIX 8: Popularity-based cold-start scores instead of flat 0.5 for all meals.
# Users below CF_MIN_INTERACTIONS previously got {mid: 0.5} for every meal —
# a flat score that makes every meal look equally relevant, destroying
# ranking quality for new users.
def get_popularity_scores(eligible_meal_ids, matrix):
    """
    Return popularity-normalised scores for cold-start users.
    Counts how many users positively interacted with each meal and
    normalises by the most popular meal.

    Parameters:
        eligible_meal_ids (list): Meal IDs to score.
        matrix            (dict): Full interaction matrix.

    Returns:
        dict: {meal_id: score} in [0, 1].

    Called by:
        compute_cf_scores() — when the user has fewer than
        CF_MIN_INTERACTIONS ratings.
    """
    counts = defaultdict(int)
    for user_ratings in matrix.values():
        for mid, score in user_ratings.items():
            if score > 0:
                counts[mid] += 1
    max_count = max(counts.values(), default=1)
    return {mid: counts.get(mid, 0) / max_count
            for mid in eligible_meal_ids}


def compute_cf_scores(user_id, eligible_meal_ids, matrix):
    """
    Predict preference scores for each eligible meal using user-based CF.
    Returns: { meal_id: score (0.0–1.0) }
    """
    target_ratings = matrix.get(user_id, {})

    # FIX 8: Cold-start — use popularity scores instead of flat 0.5
    if len(target_ratings) < CF_MIN_INTERACTIONS:
        return get_popularity_scores(eligible_meal_ids, matrix)

    # Find neighbors: all other users with >= 2 common meals
    similarities = []
    for other_uid, other_ratings in matrix.items():
        if other_uid == user_id:
            continue
        common = set(target_ratings.keys()) & set(other_ratings.keys())
        if len(common) < 2:
            continue
        # FIX 7: Use Pearson correlation instead of cosine similarity
        sim = pearson_similarity(target_ratings, other_ratings, common)
        if sim > 0:
            similarities.append((other_uid, sim, other_ratings))

    # Sort by similarity descending, take top-K
    similarities.sort(key=lambda x: x[1], reverse=True)
    top_neighbors = similarities[:CF_TOP_K_NEIGHBORS]

    if not top_neighbors:
        # FIX 8: Fall back to popularity scores when no neighbors found
        return get_popularity_scores(eligible_meal_ids, matrix)

    # Predict score for each eligible meal
    scores = {}
    for mid in eligible_meal_ids:
        numerator = 0.0
        denominator = 0.0
        for (_, sim, neighbor_ratings) in top_neighbors:
            if mid in neighbor_ratings:
                numerator += sim * neighbor_ratings[mid]
                denominator += abs(sim)
        if denominator > 0:
            raw = numerator / denominator
        else:
            raw = 0.0
        scores[mid] = raw

    # Normalize to [0, 1]
    if scores:
        min_s = min(scores.values())
        max_s = max(scores.values())
        rng = max_s - min_s
        if rng > 0:
            scores = {k: (v - min_s) / rng for k, v in scores.items()}
        else:
            scores = {k: 0.5 for k in scores}

    return scores


# ─────────────────────────────────────────────────────────────────────────────
#  3. NUTRITIONAL RMSE SCORING
# ─────────────────────────────────────────────────────────────────────────────

def compute_rmse_score(meal, target_cal, target_prot):
    """
    Calculate normalized RMSE fitness score.
    Returns 0.0–1.0 where 1.0 = perfect nutritional match.
    """
    meal_cal  = meal.get('calories') or 0
    meal_prot = float(meal.get('protein') or 0)

    # Avoid division by zero
    cal_diff  = (meal_cal - target_cal) / max(target_cal, 1)
    prot_diff = (meal_prot - target_prot) / max(target_prot, 1)

    rmse = math.sqrt((cal_diff ** 2 + prot_diff ** 2) / 2)

    # CALFIX 2: Squared penalty — large deviations are punished
    # much harder than before (0.5 RMSE -> fitness 0.75 before,
    # now 0.65). This prevents CF from overriding bad nutrition.
    fitness = max(0.0, 1.0 - (rmse ** 1.5))
    return fitness


# ─────────────────────────────────────────────────────────────────────────────
#  4. WEIGHTED RANKING + SELECTION
# ─────────────────────────────────────────────────────────────────────────────

def select_best_meal(eligible_meals, cf_scores, target_cal, target_prot, goal_type, excluded_ids, user_boosts=None):
    """
    Combine CF score and RMSE score using goal-dependent weights,
    plus direct user interaction boosts and small noise for variety.
    Returns the top-scoring meal (dict) or None.
    """
    weights = GOAL_WEIGHTS.get(goal_type, DEFAULT_WEIGHTS)
    alpha = weights["alpha"]   # CF weight
    beta  = weights["beta"]    # Nutritional weight
    user_boosts = user_boosts or {}

    # CALFIX 1: Hard calorie floor + ceiling — reject meals too far from
    # the slot target to prevent CF score from overriding nutrition.
    # Floor scales adaptively: 50% for normal targets, drops to 30% for
    # very high targets (>800 cal/slot) where fewer meals exist.
    # Only apply when target_cal > 150 (skip for snacks).
    if target_cal > 150:
        CAL_FLOOR_PCT = 0.50 if target_cal <= 800 else 0.30
        CAL_CEIL_PCT  = 2.00
        floor_filtered = [
            m for m in eligible_meals
            if (m.get('calories') or 0) >= target_cal * CAL_FLOOR_PCT
            and (m.get('calories') or 0) <= target_cal * CAL_CEIL_PCT
        ]
        # Only apply filter if it leaves enough candidates
        if len(floor_filtered) >= 3:
            eligible_meals = floor_filtered

    candidates = []
    for meal in eligible_meals:
        mid = meal['meal_id']
        if mid in excluded_ids:
            continue

        cf   = cf_scores.get(mid, 0.5)
        rmse = compute_rmse_score(meal, target_cal, target_prot)

        # Direct user preference boost: saved/high-rated meals get a small
        # positive nudge; swapped meals get a small penalty. Rejected meals
        # are already hard-excluded via excluded_ids.
        # These boosts are additive to the final score but small enough
        # (~0.03–0.07) that they act as tiebreakers among nutritionally
        # similar meals without overriding RMSE (beta component ~0.65–0.85).
        boost = user_boosts.get(mid, 0.0)

        # Small noise to break ties so plans vary on each refresh/day.
        # Range 0–0.02 is smaller than any meaningful RMSE difference
        # but enough to shuffle meals with identical scores.
        noise = random.uniform(0, 0.02)

        final_score = (alpha * cf) + (beta * rmse) + boost + noise
        candidates.append((final_score, meal))

    if not candidates:
        return None

    # Sort descending by final score
    candidates.sort(key=lambda x: x[0], reverse=True)

    # FIX 9: Return the top scorer. Variety now comes from the noise
    # term above rather than random.choice(top_3).
    return candidates[0][1]


# ─────────────────────────────────────────────────────────────────────────────
#  5. PLAN GENERATION ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def generate_daily_plan(user_id, client, global_excluded_ids=None):
    """
    Generate a full daily meal plan for a user.
    Returns: {
      "slots": [
        { "slot_name": "Breakfast", "meal": {...}, "target_cal": 600, "target_prot": 45 },
        ...
      ],
      "totals": { "calories": 1980, "protein": 142 },
      "targets": { "calories": 2000, "protein": 150 }
    }
    """
    # Fetch user profile
    profile = get_user_profile(user_id, client)
    if not profile:
        raise ValueError("User profile not found")

    target_cal  = profile.get('target_calories') or 2000
    target_prot = profile.get('target_protein') or 100
    goal_type   = profile.get('goal_type') or 'Maintenance'
    user_dietary   = profile.get('dietary_preferences') or []
    user_allergies = profile.get('allergies') or []

    # Fetch all meals once
    all_meals = get_all_meals(client)

    # Build CF interaction matrix once
    matrix = build_interaction_matrix(client)

    # Fetch user's direct interaction signals:
    #   rejected_ids → hard-exclude from all slots
    #   user_boosts  → additive score adjustments in Stage 4
    rejected_ids, user_boosts = get_user_interaction_signals(user_id, client)

    # Generate plan slot by slot
    excluded_ids = set(global_excluded_ids or []) | rejected_ids
    plan_slots = []

    for slot_cfg in SLOT_CONFIG:
        slot_target_cal  = int(target_cal  * slot_cfg["cal_pct"])
        slot_target_prot = int(target_prot * slot_cfg["prot_pct"])

        # Step 1: Filter eligible meals for this slot
        eligible = get_eligible_meals(all_meals, user_allergies, user_dietary, slot_cfg)

        # Step 2: Get CF scores for eligible meals
        eligible_ids = [m['meal_id'] for m in eligible]
        cf_scores = compute_cf_scores(user_id, eligible_ids, matrix)

        # Step 3: Select best meal (with user boosts + noise)
        best_meal = select_best_meal(
            eligible, cf_scores,
            slot_target_cal, slot_target_prot,
            goal_type, excluded_ids, user_boosts
        )

        if best_meal:
            excluded_ids.add(best_meal['meal_id'])
            plan_slots.append({
                "slot_name":   slot_cfg["name"],
                "meal":        best_meal,
                "target_cal":  slot_target_cal,
                "target_prot": slot_target_prot,
            })
        else:
            plan_slots.append({
                "slot_name":   slot_cfg["name"],
                "meal":        None,
                "target_cal":  slot_target_cal,
                "target_prot": slot_target_prot,
            })

    # Check if there's caloric room for a second snack
    total_cal = sum(
        (s["meal"].get("calories") or 0) if s["meal"] else 0
        for s in plan_slots
    )
    remaining_cal = target_cal - total_cal

    if remaining_cal >= 100:
        # Try to add a second snack
        snack_cfg = SLOT_CONFIG[2]  # Snack config
        snack_target_cal  = min(int(remaining_cal), int(target_cal * 0.10))
        snack_target_prot = int(target_prot * 0.05)

        eligible = get_eligible_meals(all_meals, user_allergies, user_dietary, snack_cfg)
        eligible_ids = [m['meal_id'] for m in eligible]
        cf_scores = compute_cf_scores(user_id, eligible_ids, matrix)

        second_snack = select_best_meal(
            eligible, cf_scores,
            snack_target_cal, snack_target_prot,
            goal_type, excluded_ids, user_boosts
        )

        if second_snack:
            excluded_ids.add(second_snack['meal_id'])
            # Insert second snack after the first snack
            snack_idx = next(
                (i for i, s in enumerate(plan_slots) if s["slot_name"] == "Snack"),
                len(plan_slots) - 1
            )
            plan_slots.insert(snack_idx + 1, {
                "slot_name":   "Snack 2",
                "meal":        second_snack,
                "target_cal":  snack_target_cal,
                "target_prot": snack_target_prot,
            })

    # Compute totals
    total_calories = sum(
        (s["meal"].get("calories") or 0) if s["meal"] else 0
        for s in plan_slots
    )
    total_protein = sum(
        float(s["meal"].get("protein") or 0) if s["meal"] else 0
        for s in plan_slots
    )
    total_fat = sum(
        float(s["meal"].get("fats") or 0) if s["meal"] else 0
        for s in plan_slots
    )
    total_carbs = sum(
        float(s["meal"].get("carbs") or 0) if s["meal"] else 0
        for s in plan_slots
    )

    return {
        "slots": plan_slots,
        "totals": {
            "calories": int(total_calories),
            "protein":  round(total_protein, 1),
            "fat":      round(total_fat, 1),
            "carbs":    round(total_carbs, 1),
        },
        "targets": {
            "calories": target_cal,
            "protein":  target_prot,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
#  6. PER-MEAL SWAP
# ─────────────────────────────────────────────────────────────────────────────

def swap_single_meal(user_id, slot_name, excluded_meal_ids, client):
    """
    Re-select a single meal for a given slot, excluding specified meals.
    Returns the new meal dict or None.
    """
    profile = get_user_profile(user_id, client)
    if not profile:
        raise ValueError("User profile not found")

    target_cal  = profile.get('target_calories') or 2000
    target_prot = profile.get('target_protein') or 100
    goal_type   = profile.get('goal_type') or 'Maintenance'
    user_dietary   = profile.get('dietary_preferences') or []
    user_allergies = profile.get('allergies') or []

    # Find matching slot config
    slot_cfg = None
    for cfg in SLOT_CONFIG:
        if cfg["name"].lower() == slot_name.lower() or slot_name.lower().startswith(cfg["name"].lower()):
            slot_cfg = cfg
            break

    if not slot_cfg:
        # Default to a generic search
        slot_cfg = {"name": slot_name, "cal_pct": 0.25, "prot_pct": 0.25, "tags": []}

    slot_target_cal  = int(target_cal  * slot_cfg["cal_pct"])
    slot_target_prot = int(target_prot * slot_cfg["prot_pct"])

    all_meals = get_all_meals(client)
    eligible = get_eligible_meals(all_meals, user_allergies, user_dietary, slot_cfg)

    matrix = build_interaction_matrix(client)
    eligible_ids = [m['meal_id'] for m in eligible]
    cf_scores = compute_cf_scores(user_id, eligible_ids, matrix)

    # Fetch user's direct interaction signals for swap too
    rejected_ids, user_boosts = get_user_interaction_signals(user_id, client)

    excluded = set(excluded_meal_ids or []) | rejected_ids
    new_meal = select_best_meal(
        eligible, cf_scores,
        slot_target_cal, slot_target_prot,
        goal_type, excluded, user_boosts
    )

    return new_meal


# ─────────────────────────────────────────────────────────────────────────────
#  7. INTERACTION LOGGING
# ─────────────────────────────────────────────────────────────────────────────

def log_interaction(user_id, meal_id, action_type, client, explicit_rating=None, plan_id=None):
    """
    Log a user-meal interaction to the user_meal_interactions table.

    Parameters:
        user_id         (str):    UUID of the user.
        meal_id         (str):    ID of the meal.
        action_type     (str):    'eaten','saved','viewed','swapped','rejected'.
        client          (Client): Authenticated Supabase client.
        explicit_rating (int):    Optional 1-5 star rating.
        plan_id         (str):    Optional plan ID for context.

    Returns:
        None — row is inserted into user_meal_interactions.

    Called by:
        app.py /api/meal-plan/interact endpoint.
    """
    pref_score = PREF_SCORE_MAP.get(action_type, 0)
    is_explicit = action_type in ('saved', 'rejected')

    record = {
        "user_id":          user_id,
        "meal_id":          meal_id,
        "plan_id":          plan_id,
        "action_type":      action_type,
        "explicit_rating":  explicit_rating,
        "preference_score": pref_score,
        "is_implicit":      not is_explicit,
    }

    client.table('user_meal_interactions').insert(record).execute()
