#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
train_workout_model.py — Workout Schedule Random Forest Trainer
=================================================================
FILE:    train_workout_model.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    Trains a Random Forest classifier that predicts the optimal weekly
    workout schedule type (e.g. "Full Body", "PPL 2x") based on a
    user's profile (experience, goal, fitness level, age, BMI, etc.).

    Pipeline:
      1. Generate 5 000 synthetic user profiles with realistic
         distributions.
      2. Apply a deterministic labeling function to assign the
         correct schedule type to each profile.
      3. Engineer features (ordinal encoding, one-hot, etc.).
      4. Train/test split (80/20), fit a RandomForestClassifier.
      5. Evaluate (accuracy, classification report, 5-fold CV,
         feature importances).
      6. Save model artifacts to ml_models/.

HOW IT FITS IN THE PROJECT:
    The saved artifacts are loaded at startup by workout_planner.py
    to power the AI-mode schedule prediction endpoint
    (/api/workout/generate-plan).

OUTPUT FILES:
    ml_models/rf_workout_model.pkl  — trained RandomForestClassifier
    ml_models/label_encoder.pkl     — LabelEncoder for schedule labels
    ml_models/scaler.pkl            — StandardScaler for numeric features
    ml_models/feature_cols.pkl      — ordered feature column names

HOW TO RUN:
    1. pip install scikit-learn numpy pandas joblib
    2. Run:  python train_workout_model.py
    3. Artifacts are saved to backend/ml_models/.
"""


# ========================= IMPORTS ==========================
import os
import sys
import random
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, accuracy_score


# ===================== CONSTANTS & CONFIG =====================
# Force UTF-8 stdout on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

NUM_SAMPLES   = 5000   # Number of synthetic training profiles
RANDOM_SEED   = 42     # Fixed seed for reproducibility
OUTPUT_DIR    = os.path.join(os.path.dirname(__file__), "ml_models")


# ==================== HELPER FUNCTIONS =======================
# Labeling function and synthetic data generator.
# =============================================================

def assign_schedule(row):
    """
    Deterministic schedule assignment based on a user's profile.

    Parameters:
        row (pd.Series): A single user profile with keys:
            experience_level, goal_type, age, bmi, fitness_level.

    Returns:
        str: One of "Full Body", "Full Body 2x", "UL + Full Body",
             "UL 2x", "PPL + UL", or "PPL 2x".

    Called by:
        generate_synthetic_data() — applied row-wise to the DataFrame.
    """
    exp  = row["experience_level"]   # 'Beginner', 'Intermediate', 'Advanced'
    goal = row["goal_type"]          # 'muscle_gain', 'weight_loss', 'maintenance'
    age  = row["age"]
    bmi  = row["bmi"]
    fit  = row["fitness_level"]      # 'sedentary' ... 'extra_active'

    # ── Beginner rules ──
    if exp == "Beginner":
        if goal == "weight_loss":
            return "Full Body"
        elif fit in ["sedentary", "lightly_active"]:
            return "Full Body"
        else:
            return "Full Body 2x"

    # ── Intermediate rules ──
    elif exp == "Intermediate":
        if goal == "weight_loss":
            return "Full Body 2x"
        elif goal == "maintenance":
            return "UL + Full Body"
        elif goal == "muscle_gain":
            if fit in ["very_active", "extra_active"]:
                return "UL 2x"
            return "UL + Full Body"

    # ── Advanced rules ──
    elif exp == "Advanced":
        if goal == "weight_loss":
            return "UL + Full Body"
        elif goal == "maintenance":
            if age > 40 or bmi > 30:
                return "UL + Full Body"
            return "UL 2x"
        elif goal == "muscle_gain":
            if age > 40 or bmi > 30:
                return "UL 2x"
            if fit in ["very_active", "extra_active"]:
                return "PPL 2x"
            return "PPL + UL"

    # Fallback
    return "Full Body"


def generate_synthetic_data(n=NUM_SAMPLES):
    """
    Generate n synthetic user profiles with realistic distributions.

    Parameters:
        n (int): Number of profiles to generate.

    Returns:
        pd.DataFrame: DataFrame with profile columns plus a
                      'schedule_label' column from assign_schedule().

    Called by:
        train_model() — Step 1 of the training pipeline.
    """
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    experience_levels = ["Beginner", "Intermediate", "Advanced"]
    goal_types        = ["muscle_gain", "weight_loss", "maintenance"]
    fitness_levels    = ["sedentary", "lightly_active", "moderately_active",
                         "very_active", "extra_active"]
    genders           = ["male", "female"]
    equipment_options = ["gym", "home"]

    rows = []
    for _ in range(n):
        gender = random.choice(genders)
        age    = random.randint(16, 65)

        # Realistic height/weight distributions by gender
        if gender == "male":
            height = round(random.gauss(175, 8), 1)
            weight = round(random.gauss(80, 14), 1)
        else:
            height = round(random.gauss(163, 7), 1)
            weight = round(random.gauss(65, 12), 1)

        # Clamp to realistic ranges
        height = max(145, min(210, height))
        weight = max(40, min(150, weight))

        bmi = round(weight / ((height / 100) ** 2), 2)

        exp  = random.choice(experience_levels)
        goal = random.choice(goal_types)
        fit  = random.choice(fitness_levels)
        equip = random.choice(equipment_options)

        rows.append({
            "experience_level": exp,
            "goal_type":        goal,
            "fitness_level":    fit,
            "equipment_access": equip,
            "age":              age,
            "gender":           gender,
            "bmi":              bmi,
            "height":           height,
            "weight":           weight,
        })

    df = pd.DataFrame(rows)

    # Apply the deterministic labeling function to each row
    df["schedule_label"] = df.apply(assign_schedule, axis=1)

    return df


# ====================== AI / ML LOGIC ========================
# Feature engineering and model training pipeline.
# =============================================================

def engineer_features(df):
    """
    Convert raw profile columns into a numeric feature matrix
    suitable for scikit-learn.

    Parameters:
        df (pd.DataFrame): Raw profile data with categorical columns.

    Returns:
        pd.DataFrame: Numeric feature matrix with columns:
            experience_level (ordinal 1–3), fitness_level (ordinal 1–5),
            equipment_access (binary), gender (binary),
            goal_muscle_gain/weight_loss/maintenance (one-hot),
            age, bmi.

    Called by:
        train_model() — Step 2 of the training pipeline.
    """
    # Ordinal encodings
    exp_map = {"Beginner": 1, "Intermediate": 2, "Advanced": 3}
    fit_map = {
        "sedentary": 1, "lightly_active": 2, "moderately_active": 3,
        "very_active": 4, "extra_active": 5
    }

    df_feat = pd.DataFrame()

    # Ordinal features
    df_feat["experience_level"] = df["experience_level"].map(exp_map)
    df_feat["fitness_level"]    = df["fitness_level"].map(fit_map)

    # Binary features
    df_feat["equipment_access"] = (df["equipment_access"] == "gym").astype(int)
    df_feat["gender"]           = (df["gender"] == "male").astype(int)

    # One-hot encode goal_type
    goal_dummies = pd.get_dummies(df["goal_type"], prefix="goal")
    # Ensure all three columns exist even if a category is missing
    for col in ["goal_muscle_gain", "goal_weight_loss", "goal_maintenance"]:
        if col not in goal_dummies.columns:
            goal_dummies[col] = 0
    df_feat = pd.concat([df_feat, goal_dummies[["goal_muscle_gain", "goal_weight_loss", "goal_maintenance"]]], axis=1)

    # Numeric features (used as-is)
    df_feat["age"] = df["age"]
    df_feat["bmi"] = df["bmi"]

    return df_feat


def train_model():
    """
    Full training pipeline: generate data → engineer features →
    encode labels → train RF → evaluate → save artifacts.

    Parameters:
        None — all configuration comes from module-level constants.

    Returns:
        None — results are printed and artifacts saved to disk.

    When / why it is called:
        Run manually whenever the labeling logic or feature set
        changes.  The saved artifacts are loaded by workout_planner.py.
    """
    print("")
    print("=" * 60)
    print("  MUTAAFI — Workout Schedule RF Model Trainer")
    print("=" * 60)

    # Step 1: Generate synthetic data
    print("\n[Step 1/5] Generating synthetic training data...")
    df = generate_synthetic_data()
    print(f"  Generated {len(df)} samples.")
    print(f"  Label distribution:")
    for label, count in df["schedule_label"].value_counts().items():
        print(f"    {label:20s} : {count}")

    # Step 2: Feature engineering
    print("\n[Step 2/5] Engineering features...")
    X_df = engineer_features(df)
    feature_cols = list(X_df.columns)
    print(f"  Features: {feature_cols}")

    # Step 3: Encode labels + scale features
    print("\n[Step 3/5] Encoding labels and scaling features...")
    le = LabelEncoder()
    y  = le.fit_transform(df["schedule_label"])
    print(f"  Classes: {list(le.classes_)}")

    scaler = StandardScaler()
    X = scaler.fit_transform(X_df.values)

    # Step 4: Train/test split + train
    print("\n[Step 4/5] Training Random Forest...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=RANDOM_SEED,
        n_jobs=-1,
        class_weight="balanced"
    )
    rf.fit(X_train, y_train)

    # Evaluate on the hold-out test set
    y_pred = rf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"  Test Accuracy: {acc:.4f}")
    print("\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # 5-fold cross-validation for robustness check
    cv_scores = cross_val_score(rf, X, y, cv=5, scoring="accuracy")
    print(f"  5-Fold CV Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

    # Feature importance ranking
    print("\n  Feature Importances:")
    for name, imp in sorted(zip(feature_cols, rf.feature_importances_), key=lambda x: -x[1]):
        print(f"    {name:25s} : {imp:.4f}")

    # Step 5: Save artifacts
    print(f"\n[Step 5/5] Saving model artifacts to {OUTPUT_DIR}/...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    joblib.dump(rf, os.path.join(OUTPUT_DIR, "rf_workout_model.pkl"))
    joblib.dump(le, os.path.join(OUTPUT_DIR, "label_encoder.pkl"))
    joblib.dump(scaler, os.path.join(OUTPUT_DIR, "scaler.pkl"))
    joblib.dump(feature_cols, os.path.join(OUTPUT_DIR, "feature_cols.pkl"))

    print("  Saved:")
    print("    rf_workout_model.pkl")
    print("    label_encoder.pkl")
    print("    scaler.pkl")
    print("    feature_cols.pkl")

    print("\n" + "=" * 60)
    print("  TRAINING COMPLETE")
    print("=" * 60)
    print("")


# ======================== ENTRY POINT ========================
if __name__ == "__main__":
    train_model()
