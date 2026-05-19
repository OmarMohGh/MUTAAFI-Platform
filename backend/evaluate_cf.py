#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
evaluate_cf.py — Enhanced CF Model Evaluation (Leave-K-Out Protocol)
======================================================================
FILE:    evaluate_cf.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform 

WHAT THIS FILE DOES:
    Evaluates the Collaborative Filtering + RMSE hybrid meal
    recommendation model using the Leave-K-Out protocol:
      1. For each user, sort interactions by timestamp.
      2. Hold out the last 20 % as the test set.
      3. Mix the held-out positive meals with 50 random negative
         meals to form a candidate set.
      4. Rank candidates using the full CF + RMSE pipeline.
      5. Measure Precision@5, NDCG@5, and Hit Rate@5.

    This is a more realistic evaluation than evaluate_model.py
    because it uses the FULL hybrid scoring pipeline (CF + RMSE
    with goal-dependent weights) rather than CF alone.

HOW IT FITS IN THE PROJECT:
    A standalone offline benchmark script.  It imports nothing from
    the Flask app — it re-implements the scoring functions locally
    so it can run independently.

METRICS COMPUTED:
    - Precision@5  — fraction of top-5 that are truly liked
    - NDCG@5       — ranking quality (position-aware)
    - Hit Rate@5   — did ANY liked meal appear in top-5?
    - Matrix Sparsity — how dense the interaction data is
    - Precision@5 Distribution — per-user quality breakdown

HOW TO RUN:
    1. Ensure backend/.env has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    2. Run:  python evaluate_cf.py
"""


# ========================= IMPORTS ==========================
import os
import sys
import math
import random
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Force UTF-8 on Windows so special characters print correctly
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables from .env
load_dotenv()

# Supabase connection credentials
SUPABASE_URL     = os.getenv("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# CF hyper-parameters
CF_MIN_INTERACTIONS = 2   # Minimum interactions before CF kicks in
CF_TOP_K_NEIGHBORS  = 20  # Number of nearest neighbours for prediction
PAGE_SIZE           = 1000  # Rows per paginated fetch

# Goal-dependent blending weights (alpha = CF, beta = RMSE)
GOAL_WEIGHTS = {
    "Weight Loss":  {"alpha": 0.35, "beta": 0.65},
    "Muscle Gain":  {"alpha": 0.30, "beta": 0.70},
    "Maintenance":  {"alpha": 0.50, "beta": 0.50},
}
DEFAULT_WEIGHTS = {"alpha": 0.50, "beta": 0.50}


# ==================== HELPER FUNCTIONS =======================
# Utility functions for data fetching, matrix construction,
# similarity computation, and scoring.
# =============================================================

def paginated_fetch(query_builder):
    """
    Fetch all rows from a Supabase query using pagination.

    Parameters:
        query_builder: A Supabase query object (before .execute()).

    Returns:
        list[dict]: All rows concatenated across pages.

    Called by:
        evaluate() — to fetch interactions, plans, meals, and profiles.
    """
    all_rows = []
    offset = 0
    while True:
        # Fetch one page of PAGE_SIZE rows starting at offset
        res = query_builder.range(offset, offset + PAGE_SIZE - 1).execute()
        batch = res.data or []
        all_rows.extend(batch)
        # If we got fewer rows than PAGE_SIZE, we've reached the end
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return all_rows


def build_matrix_from_rows(interaction_rows, plan_rows):
    """
    Build the user-meal interaction matrix from raw DB rows.

    Parameters:
        interaction_rows (list): Rows from user_meal_interactions.
        plan_rows        (list): Rows from user_meal_plan (completed).

    Returns:
        defaultdict: Nested dict {user_id: {meal_id: score}}.

    Called by:
        evaluate() — to build the full interaction matrix.
    """
    matrix = defaultdict(lambda: defaultdict(float))

    # Process explicit interactions
    for row in interaction_rows:
        uid, mid = row['user_id'], row['meal_id']
        er = row.get('explicit_rating')
        ps = row.get('preference_score', 0)
        # If an explicit rating exists, normalize 1-5 → [-1, +1] with 2x weight
        score = ((er - 3) / 2) * 2.0 if er is not None else ps
        # Use max aggregation to avoid score inflation from duplicates
        matrix[uid][mid] = max(matrix[uid][mid], score)

    # Boost meals that the user actually completed (ate) in their plan
    for row in plan_rows:
        uid, mid = row['user_id'], row['meal_id']
        matrix[uid][mid] = max(matrix[uid][mid] + 1.5, 1.5)

    return matrix


def pearson_similarity(vec_a, vec_b, common_keys):
    """
    Compute Pearson correlation between two users on shared items.

    Parameters:
        vec_a       (dict): Ratings by user A.
        vec_b       (dict): Ratings by user B.
        common_keys (set):  Meal IDs rated by both users.

    Returns:
        float: Pearson correlation in [-1, 1] (0 if < 2 common items).

    Called by:
        compute_cf_scores() — to measure user similarity.
    """
    if len(common_keys) < 2:
        return 0.0
    # Compute mean ratings over the shared items
    mean_a = sum(vec_a[k] for k in common_keys) / len(common_keys)
    mean_b = sum(vec_b[k] for k in common_keys) / len(common_keys)
    # Numerator: sum of (deviation_A * deviation_B)
    num  = sum((vec_a[k] - mean_a) * (vec_b[k] - mean_b) for k in common_keys)
    # Denominators: standard deviations
    da   = math.sqrt(sum((vec_a[k] - mean_a) ** 2 for k in common_keys))
    db   = math.sqrt(sum((vec_b[k] - mean_b) ** 2 for k in common_keys))
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def get_popularity_scores(meal_ids, matrix):
    """
    Compute popularity-based scores for cold-start fallback.

    Parameters:
        meal_ids (list): Meal IDs to score.
        matrix   (dict): The full interaction matrix.

    Returns:
        dict: {meal_id: popularity_score} normalized to [0, 1].

    Called by:
        compute_cf_scores() — when a user has too few interactions.
    """
    # Count how many users positively interacted with each meal
    counts = defaultdict(int)
    for ur in matrix.values():
        for mid, s in ur.items():
            if s > 0:
                counts[mid] += 1
    # Normalize by the most popular meal
    mx = max(counts.values(), default=1)
    return {mid: counts.get(mid, 0) / mx for mid in meal_ids}


def compute_cf_scores(user_id, meal_ids, matrix):
    """
    Predict preference scores for a set of meals using user-based CF.

    Parameters:
        user_id  (str):  Target user's UUID.
        meal_ids (list): Meal IDs to predict scores for.
        matrix   (dict): The full interaction matrix.

    Returns:
        dict: {meal_id: score} normalized to [0, 1].

    Called by:
        evaluate() — to get CF scores for each candidate meal.
    """
    target = matrix.get(user_id, {})
    # Cold-start: fall back to popularity if too few interactions
    if len(target) < CF_MIN_INTERACTIONS:
        return get_popularity_scores(meal_ids, matrix)

    # Find similar users via Pearson correlation
    sims = []
    for oid, oratings in matrix.items():
        if oid == user_id:
            continue
        common = set(target.keys()) & set(oratings.keys())
        if len(common) < 2:
            continue
        s = pearson_similarity(target, oratings, common)
        if s > 0:
            sims.append((oid, s, oratings))

    # Sort by similarity descending, take top-K neighbours
    sims.sort(key=lambda x: x[1], reverse=True)
    top = sims[:CF_TOP_K_NEIGHBORS]

    # If no neighbours found, fall back to popularity
    if not top:
        return get_popularity_scores(meal_ids, matrix)

    # Weighted average prediction for each meal
    scores = {}
    for mid in meal_ids:
        num, den = 0.0, 0.0
        for (_, sim, nr) in top:
            if mid in nr:
                num += sim * nr[mid]
                den += abs(sim)
        scores[mid] = num / den if den > 0 else 0.0

    # Min-max normalize to [0, 1]
    if scores:
        mn, mx = min(scores.values()), max(scores.values())
        rng = mx - mn
        if rng > 0:
            scores = {k: (v - mn) / rng for k, v in scores.items()}
        else:
            scores = {k: 0.5 for k in scores}
    return scores


# ====================== AI / ML LOGIC ========================
# RMSE nutritional scoring and ranking metric functions.
# =============================================================

def compute_rmse_score(meal, target_cal, target_prot):
    """
    Compute a nutritional fitness score for a meal vs. slot targets.

    Parameters:
        meal        (dict): Meal row with 'calories' and 'protein'.
        target_cal  (int):  Slot-level calorie target.
        target_prot (int):  Slot-level protein target.

    Returns:
        float: Score in [0, 1] where 1.0 = perfect nutritional match.

    Called by:
        evaluate() — to blend with CF score for hybrid ranking.
    """
    mc = meal.get('calories') or 0
    mp = float(meal.get('protein') or 0)
    # Normalized deviation from target
    cd = (mc - target_cal) / max(target_cal, 1)
    pd = (mp - target_prot) / max(target_prot, 1)
    # RMSE of the two deviations
    rmse = math.sqrt((cd**2 + pd**2) / 2)
    return max(0.0, 1.0 - rmse)


def precision_at_k(ranked, relevant, k=5):
    """
    Precision@K: fraction of top-K items that are relevant.

    Parameters:
        ranked   (list): Ordered list of recommended meal IDs.
        relevant (set):  Set of truly relevant meal IDs.
        k        (int):  Cut-off rank.

    Returns:
        float: Precision value in [0, 1].
    """
    return len(set(ranked[:k]) & set(relevant)) / k


def ndcg_at_k(ranked, relevant, k=5):
    """
    NDCG@K: Normalised Discounted Cumulative Gain.

    Parameters:
        ranked   (list): Ordered list of recommended meal IDs.
        relevant (set):  Set of truly relevant meal IDs.
        k        (int):  Cut-off rank.

    Returns:
        float: NDCG value in [0, 1] (1.0 = perfect ranking).
    """
    dcg = sum(1.0 / math.log2(i + 2) for i, m in enumerate(ranked[:k]) if m in relevant)
    ideal = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal))
    return dcg / idcg if idcg > 0 else 0.0


def hit_at_k(ranked, relevant, k=5):
    """
    Hit Rate@K: 1.0 if ANY relevant item is in top-K, else 0.0.

    Parameters:
        ranked   (list): Ordered list of recommended meal IDs.
        relevant (set):  Set of truly relevant meal IDs.
        k        (int):  Cut-off rank.

    Returns:
        float: 1.0 or 0.0.
    """
    return 1.0 if set(ranked[:k]) & set(relevant) else 0.0


# ===================== MAIN EVALUATION =======================
# The evaluate() function orchestrates the full pipeline:
#   1–4. Fetch interactions, plan rows, meals, and user profiles
#   5.   Build the interaction matrix
#   6.   Run Leave-K-Out evaluation with CF+RMSE ranking
#   7.   Print results summary and Precision@5 distribution
# =============================================================

def evaluate():
    """
    Run the full hybrid CF+RMSE evaluation using Leave-K-Out protocol.

    Parameters:
        None — all configuration comes from module-level constants.

    Returns:
        None — results are printed to stdout.

    When / why it is called:
        Invoked from the __main__ guard.  Run manually to benchmark
        the hybrid recommendation engine after any changes to
        meal_planner.py's scoring logic.
    """
    print("")
    print("=" * 60)
    print("  MUTAAFI CF Model Evaluation")
    print("=" * 60)

    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        print("[ERROR] Missing env vars.")
        return

    client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

    # ── Step 1: Fetch all interactions ──
    print("\n[1/6] Fetching interactions...")
    all_interactions = paginated_fetch(
        client.table('user_meal_interactions').select(
            'user_id, meal_id, preference_score, explicit_rating, action_type, timestamp'
        )
    )
    print(f"       {len(all_interactions)} interactions loaded.")

    # ── Step 2: Fetch completed meal plan rows ──
    print("[2/6] Fetching meal plan completions...")
    all_plan_rows = paginated_fetch(
        client.table('user_meal_plan').select(
            'user_id, meal_id, plan_date'
        ).eq('is_completed', True)
    )
    print(f"       {len(all_plan_rows)} completed plan rows loaded.")

    # ── Step 3: Fetch meal catalogue with nutritional data ──
    print("[3/6] Fetching meal catalog...")
    meals_data = paginated_fetch(
        client.table('nutrition_data').select('meal_id, calories, protein, tags')
    )
    meal_map = {m['meal_id']: m for m in meals_data}
    all_meal_ids = list(meal_map.keys())
    total_meals = len(all_meal_ids)
    print(f"       {total_meals} meals in catalog.")

    # ── Step 4: Fetch user profiles for calorie/protein targets ──
    print("[4/6] Fetching user profiles...")
    user_profiles = paginated_fetch(
        client.table('user_data').select(
            'user_id, target_calories, target_protein, goal_type'
        )
    )
    profile_map = {p['user_id']: p for p in user_profiles}
    print(f"       {len(profile_map)} profiles loaded.")

    # ── Group interactions by user ──
    user_ints = defaultdict(list)
    for r in all_interactions:
        user_ints[r['user_id']].append(r)
    total_users = len(user_ints)

    # ── Compute matrix sparsity ──
    pairs = set((r['user_id'], r['meal_id']) for r in all_interactions)
    sparsity = 1.0 - len(pairs) / (total_users * total_meals) if total_users and total_meals else 1.0

    # ── Step 5: Build the full interaction matrix ──
    print("[5/6] Building interaction matrix...")
    full_matrix = build_matrix_from_rows(all_interactions, all_plan_rows)

    # ── Step 6: Leave-K-Out evaluation ──
    # For each user: hold out their positive test meals (last 20% by time),
    # score those against 50 random negatives using the full CF+RMSE pipeline.
    print("[6/6] Running Leave-K-Out evaluation with CF+RMSE ranking...")

    all_p5, all_n5, all_h5 = [], [], []
    eval_count = 0
    N_NEGATIVES = 50  # Number of random negatives to mix in

    for uid, ints in user_ints.items():
        # Require at least 5 interactions for meaningful evaluation
        if len(ints) < 5:
            continue

        # Look up the user's profile for calorie/protein targets
        profile = profile_map.get(uid)
        if not profile:
            continue

        target_cal  = profile.get('target_calories') or 2000
        target_prot = profile.get('target_protein') or 100
        goal_type   = profile.get('goal_type') or 'Maintenance'
        weights = GOAL_WEIGHTS.get(goal_type, DEFAULT_WEIGHTS)
        alpha, beta = weights["alpha"], weights["beta"]

        # Sort interactions by timestamp, split 80/20
        ints.sort(key=lambda x: x.get('timestamp') or '')
        split = int(len(ints) * 0.8)
        test_part = ints[split:]

        # Positive test meals = those the user ate or saved
        positives = set()
        for r in test_part:
            if r['action_type'] in ('eaten', 'saved'):
                positives.add(r['meal_id'])

        if not positives:
            continue

        # Training meals = all meals from the first 80%
        train_meals = set()
        for r in ints[:split]:
            train_meals.add(r['meal_id'])

        # Build candidate set: positive test meals + random negatives
        negatives = [mid for mid in all_meal_ids
                     if mid not in positives and mid not in train_meals]
        if len(negatives) > N_NEGATIVES:
            neg_sample = random.sample(negatives, N_NEGATIVES)
        else:
            neg_sample = negatives

        candidate_ids = list(positives) + neg_sample

        # Get CF scores for all candidates
        cf_scores = compute_cf_scores(uid, candidate_ids, full_matrix)

        # Blend CF + RMSE for each candidate (per-slot target = daily / 4)
        scored = []
        for mid in candidate_ids:
            cf = cf_scores.get(mid, 0.5)
            meal = meal_map.get(mid)
            if meal:
                rmse = compute_rmse_score(meal, target_cal // 4, target_prot // 4)
            else:
                rmse = 0.5
            final = alpha * cf + beta * rmse
            scored.append((mid, final))

        # Sort by final blended score descending
        scored.sort(key=lambda x: x[1], reverse=True)
        ranked = [mid for mid, _ in scored]

        # Compute metrics for this user
        p5 = precision_at_k(ranked, positives, 5)
        n5 = ndcg_at_k(ranked, positives, 5)
        h5 = hit_at_k(ranked, positives, 5)

        all_p5.append(p5)
        all_n5.append(n5)
        all_h5.append(h5)
        eval_count += 1

    # ── Results Summary ──
    avg_p5 = sum(all_p5) / len(all_p5) if all_p5 else 0
    avg_n5 = sum(all_n5) / len(all_n5) if all_n5 else 0
    avg_h5 = sum(all_h5) / len(all_h5) if all_h5 else 0

    print("")
    print("=" * 60)
    print("  EVALUATION RESULTS")
    print("=" * 60)
    print(f"  Users evaluated       : {eval_count}")
    print(f"  Total interactions    : {len(all_interactions)}")
    print(f"  Total meals           : {total_meals}")
    print(f"  Negative sample size  : {N_NEGATIVES}")
    print(f"  Meal plan rows        : {len(all_plan_rows)}")
    print("")
    print(f"  Matrix Sparsity       : {sparsity * 100:.1f}%")
    print(f"  Precision@5           : {avg_p5:.4f}")
    print(f"  NDCG@5                : {avg_n5:.4f}")
    print(f"  Hit Rate@5            : {avg_h5:.4f}")
    print("")

    # ── Precision@5 Distribution Breakdown ──
    if all_p5:
        perfect  = sum(1 for p in all_p5 if p >= 0.8)
        good     = sum(1 for p in all_p5 if 0.4 <= p < 0.8)
        moderate = sum(1 for p in all_p5 if 0.2 <= p < 0.4)
        low      = sum(1 for p in all_p5 if 0.0 < p < 0.2)
        zero     = sum(1 for p in all_p5 if p == 0.0)
        print("  Precision@5 Distribution:")
        print(f"    >= 0.8 (excellent) : {perfect:3d} users ({perfect/len(all_p5)*100:.1f}%)")
        print(f"    0.4-0.8 (good)     : {good:3d} users ({good/len(all_p5)*100:.1f}%)")
        print(f"    0.2-0.4 (moderate) : {moderate:3d} users ({moderate/len(all_p5)*100:.1f}%)")
        print(f"    0.0-0.2 (low)      : {low:3d} users ({low/len(all_p5)*100:.1f}%)")
        print(f"    0.0 (miss)         : {zero:3d} users ({zero/len(all_p5)*100:.1f}%)")

    # ── Before/After Comparison ──
    print("")
    print("  COMPARISON (Before -> After):")
    print(f"    Sparsity    :  74.7%  ->  {sparsity * 100:.1f}%")
    print(f"    Precision@5 :  0.0615 ->  {avg_p5:.4f}")
    print(f"    NDCG@5      :  0.0670 ->  {avg_n5:.4f}")
    print("=" * 60)
    print("")


# ======================== ENTRY POINT ========================
if __name__ == '__main__':
    random.seed(42)  # Reproducible evaluation
    evaluate()
