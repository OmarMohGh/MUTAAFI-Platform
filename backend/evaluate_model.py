#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MUTAAFI CF Model Evaluation
============================
FILE:    evaluate_model.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform 

WHAT THIS FILE DOES:
    This script evaluates the quality of the Collaborative Filtering (CF)
    meal recommendation model used by the MUTAAFI platform.  It connects to
    the Supabase database, downloads every user-meal interaction, splits
    the data 80/20 into training and test sets, then measures how well the
    CF engine can predict user preferences and rank meals.

HOW IT FITS IN THE PROJECT:
    The main application (app.py / meal_planner.py) serves meal
    recommendations at runtime.  This script is a *standalone offline tool*
    used to benchmark that recommendation logic.  It copies the core CF
    prediction functions so it can run independently without starting the
    Flask server.

METRICS COMPUTED:
    - RMSE  (Root Mean Square Error)   — prediction error magnitude
    - MAE   (Mean Absolute Error)      — average prediction error
    - Precision@K                      — fraction of top-K that are relevant
    - Recall@K                         — fraction of relevant items in top-K
    - F1@K                             — harmonic mean of Precision & Recall
    - NDCG@K                           — ranking quality (position-aware)
    - Coverage                         — % of catalog the model recommends
    - Sparsity                         — how sparse the interaction matrix is

HOW TO RUN:
    1. Make sure a .env file exists in the backend/ directory with:
         VITE_SUPABASE_URL=<your-supabase-url>
         SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
    2. Install dependencies:  pip install python-dotenv supabase
    3. Run:  python evaluate_model.py
    4. Results are printed to the terminal in a summary table.
"""


# ========================= IMPORTS ==========================
# Standard library modules for math, randomness, and I/O.
# Third-party modules for environment variables and Supabase.
# ============================================================

import os
import sys
import math
import random
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Runtime configuration: database credentials loaded from .env,
# evaluation hyper-parameters, and the random seed for
# reproducibility of the train/test split.
# ==============================================================

# Force UTF-8 on Windows so emoji / Arabic characters print correctly
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables from the .env file
load_dotenv()

# Supabase connection credentials (read from .env)
SUPABASE_URL     = os.getenv("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Evaluation parameters
TEST_RATIO   = 0.20    # 20% held out for testing
TOP_K        = 5       # K for Precision@K, Recall@K, NDCG@K
CF_TOP_K_NEIGHBORS = 10  # Number of nearest neighbours used by CF
RANDOM_SEED  = 42      # Fixed seed so results are reproducible


# ==================== HELPER FUNCTIONS =======================
# Core Collaborative Filtering (CF) engine, copied from
# meal_planner.py so this script can run as a standalone
# evaluation without importing the Flask application.
# =============================================================

def cosine_similarity(vec_a, vec_b, common_keys):
    """
    Compute the cosine similarity between two rating vectors.

    Parameters:
        vec_a       (dict): Ratings by user A, keyed by meal_id.
        vec_b       (dict): Ratings by user B, keyed by meal_id.
        common_keys (set):  Meal IDs that both users have rated.

    Returns:
        float: A value between -1 and 1 (0 when no overlap or zero
               magnitude). Higher means the two users have more
               similar taste.

    Called by:
        predict_score() — to find how similar two users are.
    """
    # If there are no meals in common, similarity is undefined → 0
    if not common_keys:
        return 0.0

    # Dot product of the two vectors over the shared meals
    dot = sum(vec_a[k] * vec_b[k] for k in common_keys)

    # Magnitude (Euclidean length) of each vector
    mag_a = math.sqrt(sum(vec_a[k] ** 2 for k in common_keys))
    mag_b = math.sqrt(sum(vec_b[k] ** 2 for k in common_keys))

    # Avoid division by zero if either vector is all zeros
    if mag_a == 0 or mag_b == 0:
        return 0.0

    # cosine = dot(A,B) / (|A| * |B|)
    return dot / (mag_a * mag_b)


def predict_score(target_user, target_meal, train_matrix):
    """
    Predict a preference score for a (user, meal) pair using
    user-based Collaborative Filtering with weighted k-NN.

    Parameters:
        target_user  (str):  The UUID of the user we are predicting for.
        target_meal  (str):  The meal_id we want to predict a score for.
        train_matrix (dict): Nested dict {user_id: {meal_id: score}},
                             built from the training split only.

    Returns:
        float: Predicted preference score (0.0 if cold-start or no
               similar users found).

    Called by:
        - The RMSE / MAE loop in evaluate() for prediction accuracy.
        - predict_top_k_for_user() for ranking metrics.
    """
    # Look up the target user's known ratings in the training set
    target_ratings = train_matrix.get(target_user, {})

    # If the user has no training data at all, return 0 (cold start)
    if not target_ratings:
        return 0.0

    # Collect (similarity, rating) pairs from every other user who
    # has rated the target meal
    similarities = []
    for other_uid, other_ratings in train_matrix.items():
        # Skip comparing the user to themselves
        if other_uid == target_user:
            continue
        # The other user must have rated the target meal
        if target_meal not in other_ratings:
            continue
        # Find meals both users have rated
        common = set(target_ratings.keys()) & set(other_ratings.keys())
        # Require at least 2 common meals for a meaningful similarity
        if len(common) < 2:
            continue
        # Compute cosine similarity over the common meals
        sim = cosine_similarity(target_ratings, other_ratings, common)
        # Only keep positively correlated neighbours
        if sim > 0:
            similarities.append((sim, other_ratings[target_meal]))

    # If no useful neighbours were found, we cannot predict
    if not similarities:
        return 0.0

    # Sort neighbours by similarity (highest first) and keep top-K
    similarities.sort(key=lambda x: x[0], reverse=True)
    top = similarities[:CF_TOP_K_NEIGHBORS]

    # Weighted average: sum(sim_i * rating_i) / sum(|sim_i|)
    numerator = sum(sim * rating for sim, rating in top)
    denominator = sum(abs(sim) for sim, _ in top)
    return numerator / denominator if denominator > 0 else 0.0


def predict_top_k_for_user(user_id, all_meal_ids, train_matrix, k=TOP_K):
    """
    Predict scores for every meal the user has NOT yet rated,
    then return the top-K highest-scoring meals.

    Parameters:
        user_id      (str):  UUID of the target user.
        all_meal_ids (list): Every meal_id in the catalogue.
        train_matrix (dict): The training interaction matrix.
        k            (int):  How many top recommendations to return.

    Returns:
        list[tuple]: Up to k (meal_id, predicted_score) pairs,
                     sorted descending by score.

    Called by:
        evaluate() — for computing Precision@K, Recall@K, NDCG@K,
                      and catalog coverage.
    """
    # Meals the user already rated in training — we won't re-recommend
    known_meals = set(train_matrix.get(user_id, {}).keys())

    # Score every unseen meal
    predictions = []
    for mid in all_meal_ids:
        if mid in known_meals:
            continue
        score = predict_score(user_id, mid, train_matrix)
        predictions.append((mid, score))

    # Sort by predicted score descending, return top-K
    predictions.sort(key=lambda x: x[1], reverse=True)
    return predictions[:k]


# ====================== AI / ML LOGIC ========================
# Pure metric functions.  Each takes ground-truth and predicted
# values and returns a single number summarising one aspect of
# model quality.
# =============================================================

def rmse(actuals, predictions):
    """
    Compute Root Mean Square Error between actual and predicted scores.

    Parameters:
        actuals     (list[float]): Ground-truth preference scores.
        predictions (list[float]): Model-predicted preference scores.

    Returns:
        float: RMSE value (lower is better, 0 = perfect).

    Called by:
        evaluate() — to measure overall prediction accuracy.
    """
    if not actuals:
        return 0.0
    return math.sqrt(sum((a - p) ** 2 for a, p in zip(actuals, predictions)) / len(actuals))


def mae(actuals, predictions):
    """
    Compute Mean Absolute Error between actual and predicted scores.

    Parameters:
        actuals     (list[float]): Ground-truth preference scores.
        predictions (list[float]): Model-predicted preference scores.

    Returns:
        float: MAE value (lower is better, 0 = perfect).

    Called by:
        evaluate() — to measure average prediction error.
    """
    if not actuals:
        return 0.0
    return sum(abs(a - p) for a, p in zip(actuals, predictions)) / len(actuals)


def precision_at_k(recommended_ids, relevant_ids, k):
    """
    Precision@K — of the top-K recommended meals, how many are relevant?

    Parameters:
        recommended_ids (list): Ordered list of recommended meal IDs.
        relevant_ids    (set):  Set of meal IDs the user truly likes.
        k               (int):  Cut-off rank.

    Returns:
        float: Value between 0.0 and 1.0 (higher is better).

    Called by:
        evaluate() — per-user ranking evaluation loop.
    """
    rec_set = set(recommended_ids[:k])
    rel_set = set(relevant_ids)
    if not rec_set:
        return 0.0
    return len(rec_set & rel_set) / len(rec_set)


def recall_at_k(recommended_ids, relevant_ids, k):
    """
    Recall@K — of all relevant meals, how many appear in the top-K?

    Parameters:
        recommended_ids (list): Ordered list of recommended meal IDs.
        relevant_ids    (set):  Set of meal IDs the user truly likes.
        k               (int):  Cut-off rank.

    Returns:
        float: Value between 0.0 and 1.0 (higher is better).

    Called by:
        evaluate() — per-user ranking evaluation loop.
    """
    rec_set = set(recommended_ids[:k])
    rel_set = set(relevant_ids)
    if not rel_set:
        return 0.0
    return len(rec_set & rel_set) / len(rel_set)


def f1_at_k(precision, recall):
    """
    F1@K — harmonic mean of Precision and Recall at K.

    Parameters:
        precision (float): Precision@K value.
        recall    (float): Recall@K value.

    Returns:
        float: F1 score between 0.0 and 1.0 (higher is better).

    Called by:
        evaluate() — per-user ranking evaluation loop.
    """
    if precision + recall == 0:
        return 0.0
    return 2 * (precision * recall) / (precision + recall)


def dcg_at_k(recommended_ids, relevant_ids, k):
    """
    Discounted Cumulative Gain at K — rewards relevant items that
    appear earlier in the ranked list more heavily.

    Parameters:
        recommended_ids (list): Ordered list of recommended meal IDs.
        relevant_ids    (set):  Set of truly relevant meal IDs.
        k               (int):  Cut-off rank.

    Returns:
        float: DCG score (higher is better).

    Called by:
        ndcg_at_k() — used to compute both the actual and ideal DCG.
    """
    score = 0.0
    for i, mid in enumerate(recommended_ids[:k]):
        # Binary relevance: 1.0 if the meal is relevant, else 0.0
        rel = 1.0 if mid in relevant_ids else 0.0
        # Discount by log2(rank+1); i+2 because i is 0-indexed
        score += rel / math.log2(i + 2)
    return score


def ndcg_at_k(recommended_ids, relevant_ids, k):
    """
    Normalised DCG at K — DCG divided by the ideal (perfect) DCG.

    Parameters:
        recommended_ids (list): Ordered list of recommended meal IDs.
        relevant_ids    (set):  Set of truly relevant meal IDs.
        k               (int):  Cut-off rank.

    Returns:
        float: NDCG between 0.0 and 1.0 (1.0 = perfect ranking).

    Called by:
        evaluate() — per-user ranking evaluation loop.
    """
    # DCG of the model's actual ranking
    actual_dcg = dcg_at_k(recommended_ids, relevant_ids, k)
    # Ideal DCG: pretend all relevant items are ranked first
    ideal_order = list(relevant_ids)[:k]
    ideal_dcg = dcg_at_k(ideal_order, relevant_ids, k)
    if ideal_dcg == 0:
        return 0.0
    return actual_dcg / ideal_dcg


# ===================== MAIN EVALUATION =======================
# The evaluate() function orchestrates the full pipeline:
#   1. Fetch data from Supabase
#   2. Split into train / test
#   3. Compute prediction accuracy (RMSE, MAE)
#   4. Compute ranking metrics (P@K, R@K, F1@K, NDCG@K)
#   5. Compute catalog coverage
#   6. Print a formatted results summary table
# =============================================================

def evaluate():
    """
    Run the full offline evaluation of the CF recommendation model.

    Parameters:
        None — all configuration comes from module-level constants.

    Returns:
        None — results are printed to stdout.

    When / why it is called:
        Invoked from the __main__ guard at the bottom of this file.
        Developers run this script manually whenever they want to
        benchmark the recommendation engine after changing the CF
        logic or after new interaction data has been collected.
    """
    print("")
    print("=" * 65)
    print("  MUTAAFI CF Model Evaluation")
    print("=" * 65)

    # Abort early if credentials are missing
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        print("[ERROR] Missing env vars.")
        return

    # Create an authenticated Supabase client using the service role key
    client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

    # ----- Step 1: Fetch all interactions from the database -----
    print("\n[1/5] Fetching interaction data...")
    res = client.table('user_meal_interactions').select(
        'user_id, meal_id, preference_score, action_type'
    ).execute()
    all_interactions = res.data or []
    print(f"       Total interactions: {len(all_interactions)}")

    # Fetch the full meal catalogue so we know the universe of meals
    meals_res = client.table('nutrition_data').select('meal_id').execute()
    all_meal_ids = [m['meal_id'] for m in (meals_res.data or [])]
    print(f"       Total meals in catalog: {len(all_meal_ids)}")

    # ----- Build full interaction matrix & compute sparsity -----
    # full_matrix[user_id][meal_id] = cumulative preference score
    full_matrix = defaultdict(lambda: defaultdict(float))
    for row in all_interactions:
        uid = row['user_id']
        mid = row['meal_id']
        score = row.get('preference_score', 0)
        full_matrix[uid][mid] += score

    # Count users, meals, and filled cells to calculate sparsity
    n_users = len(full_matrix)
    n_meals = len(all_meal_ids)
    n_pairs = sum(len(v) for v in full_matrix.values())
    sparsity = 1.0 - (n_pairs / (n_users * n_meals)) if (n_users * n_meals) > 0 else 1.0

    print(f"       Users with interactions: {n_users}")
    print(f"       Unique (user, meal) pairs: {n_pairs}")
    print(f"       Matrix sparsity: {sparsity * 100:.1f}%")

    # ----- Step 2: Train / Test Split -----
    print(f"\n[2/5] Splitting data ({int((1 - TEST_RATIO) * 100)}/{int(TEST_RATIO * 100)} train/test)...")
    random.seed(RANDOM_SEED)

    train_data = []
    test_data  = []

    # Group interactions by user so each user's data is split fairly
    user_interactions = defaultdict(list)
    for row in all_interactions:
        user_interactions[row['user_id']].append(row)

    # For each user, shuffle their interactions, then put the first
    # 80% into training and the remaining 20% into testing
    for uid, interactions in user_interactions.items():
        random.shuffle(interactions)
        split_idx = max(1, int(len(interactions) * (1 - TEST_RATIO)))
        train_data.extend(interactions[:split_idx])
        test_data.extend(interactions[split_idx:])

    print(f"       Train set: {len(train_data)} interactions")
    print(f"       Test set:  {len(test_data)} interactions")

    # Build the training-only interaction matrix for the CF engine
    train_matrix = defaultdict(lambda: defaultdict(float))
    for row in train_data:
        train_matrix[row['user_id']][row['meal_id']] += row.get('preference_score', 0)

    # ----- Step 3: Prediction Accuracy (RMSE, MAE) -----
    print("\n[3/5] Computing prediction accuracy (RMSE, MAE)...")
    actuals = []
    predictions = []
    skipped = 0

    for row in test_data:
        uid = row['user_id']
        mid = row['meal_id']
        actual = row.get('preference_score', 0)

        # Skip users with fewer than 3 training ratings (cold start)
        if uid not in train_matrix or len(train_matrix[uid]) < 3:
            skipped += 1
            continue

        # Predict the score using CF and store both actual and predicted
        pred = predict_score(uid, mid, train_matrix)
        actuals.append(float(actual))
        predictions.append(pred)

    # Calculate aggregate error metrics
    test_rmse = rmse(actuals, predictions)
    test_mae  = mae(actuals, predictions)
    print(f"       Evaluated {len(actuals)} predictions (skipped {skipped} cold-start)")
    print(f"       RMSE: {test_rmse:.4f}")
    print(f"       MAE:  {test_mae:.4f}")

    # ----- Step 4: Ranking Metrics (Precision@K, Recall@K, F1@K, NDCG@K) -----
    print(f"\n[4/5] Computing ranking metrics (P@{TOP_K}, R@{TOP_K}, F1@{TOP_K}, NDCG@{TOP_K})...")

    precisions = []
    recalls    = []
    f1s        = []
    ndcgs      = []

    # Group test interactions by user for per-user evaluation
    test_by_user = defaultdict(list)
    for row in test_data:
        test_by_user[row['user_id']].append(row)

    evaluated_users = 0
    for uid, user_test_rows in test_by_user.items():
        # Skip cold-start users (fewer than 3 training ratings)
        if uid not in train_matrix or len(train_matrix[uid]) < 3:
            continue

        # Relevant = meals the user liked in the test set (score > 0)
        relevant_ids = set(
            r['meal_id'] for r in user_test_rows if r.get('preference_score', 0) > 0
        )
        if not relevant_ids:
            continue

        # Get top-K predictions from the CF model
        top_k = predict_top_k_for_user(uid, all_meal_ids, train_matrix, TOP_K)
        recommended_ids = [mid for mid, _ in top_k]

        # Compute all four ranking metrics for this user
        p = precision_at_k(recommended_ids, relevant_ids, TOP_K)
        r = recall_at_k(recommended_ids, relevant_ids, TOP_K)
        f = f1_at_k(p, r)
        n = ndcg_at_k(recommended_ids, relevant_ids, TOP_K)

        precisions.append(p)
        recalls.append(r)
        f1s.append(f)
        ndcgs.append(n)
        evaluated_users += 1

    # Average each metric across all evaluated users
    avg_precision = sum(precisions) / len(precisions) if precisions else 0
    avg_recall    = sum(recalls) / len(recalls) if recalls else 0
    avg_f1        = sum(f1s) / len(f1s) if f1s else 0
    avg_ndcg      = sum(ndcgs) / len(ndcgs) if ndcgs else 0

    print(f"       Evaluated {evaluated_users} users")
    print(f"       Precision@{TOP_K}: {avg_precision:.4f}")
    print(f"       Recall@{TOP_K}:    {avg_recall:.4f}")
    print(f"       F1@{TOP_K}:        {avg_f1:.4f}")
    print(f"       NDCG@{TOP_K}:      {avg_ndcg:.4f}")

    # ----- Step 5: Catalog Coverage -----
    print(f"\n[5/5] Computing catalog coverage...")
    recommended_all = set()
    for uid in train_matrix:
        # Only evaluate users with enough data
        if len(train_matrix[uid]) < 3:
            continue
        top_k = predict_top_k_for_user(uid, all_meal_ids, train_matrix, TOP_K)
        for mid, _ in top_k:
            recommended_all.add(mid)

    # Coverage = unique meals recommended / total meals in catalogue
    coverage = len(recommended_all) / len(all_meal_ids) * 100 if all_meal_ids else 0

    print(f"       Unique meals recommended: {len(recommended_all)} / {len(all_meal_ids)}")
    print(f"       Catalog Coverage: {coverage:.1f}%")

    # ----- Results Summary Table -----
    print("\n" + "=" * 65)
    print("  EVALUATION RESULTS SUMMARY")
    print("=" * 65)
    print(f"  {'Metric':<25} {'Value':<15} {'Interpretation'}")
    print(f"  {'-' * 25} {'-' * 15} {'-' * 20}")
    print(f"  {'RMSE':<25} {test_rmse:<15.4f} {'Lower is better'}")
    print(f"  {'MAE':<25} {test_mae:<15.4f} {'Lower is better'}")
    print(f"  {f'Precision@{TOP_K}':<25} {avg_precision:<15.4f} {'Higher is better'}")
    print(f"  {f'Recall@{TOP_K}':<25} {avg_recall:<15.4f} {'Higher is better'}")
    print(f"  {f'F1@{TOP_K}':<25} {avg_f1:<15.4f} {'Higher is better'}")
    print(f"  {f'NDCG@{TOP_K}':<25} {avg_ndcg:<15.4f} {'Higher is better'}")
    print(f"  {'Catalog Coverage':<25} {coverage:<14.1f}% {'Higher is better'}")
    print(f"  {'Matrix Sparsity':<25} {sparsity * 100:<14.1f}% {'Lower = denser'}")
    print("=" * 65)

    # ----- Human-readable Interpretation -----
    print("\n  INTERPRETATION:")
    if test_rmse < 0.5:
        print("  [+] RMSE < 0.5 -- Excellent prediction accuracy")
    elif test_rmse < 0.8:
        print("  [+] RMSE < 0.8 -- Good prediction accuracy")
    else:
        print("  [-] RMSE >= 0.8 -- Prediction accuracy needs improvement")

    if avg_precision >= 0.3:
        print(f"  [+] Precision@{TOP_K} >= 0.30 -- Strong recommendation relevance")
    elif avg_precision >= 0.15:
        print(f"  [~] Precision@{TOP_K} >= 0.15 -- Moderate recommendation relevance")
    else:
        print(f"  [-] Precision@{TOP_K} < 0.15 -- Low, but expected with synthetic data")

    if coverage >= 50:
        print(f"  [+] Coverage >= 50% -- Good variety in recommendations")
    else:
        print(f"  [-] Coverage < 50% -- Model tends to recommend same meals")

    if sparsity * 100 > 95:
        print(f"  [!] Sparsity > 95% -- Very sparse matrix, more interactions needed")
    else:
        print(f"  [+] Sparsity <= 95% -- Sufficient data density")

    print("")


# ======================== ENTRY POINT ========================
# Standard Python entry guard. When this file is run directly
# (python evaluate_model.py), the evaluate() function executes.
# If this file were imported as a module, nothing runs
# automatically.
# =============================================================

if __name__ == '__main__':
    evaluate()
