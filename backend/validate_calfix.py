#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_calfix.py — Calorie Accuracy Validator
==================================================
FILE:    validate_calfix.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    Finds the user with the HIGHEST calorie target in the database,
    generates a daily meal plan for them, and checks whether the plan
    meets nutritional accuracy thresholds:
      - Total calories >= 85 % of target
      - Each main-meal slot >= 50 % of its slot-level calorie target

HOW IT FITS IN THE PROJECT:
    A quick validation script used after modifying the meal planner's
    calorie-floor / RMSE weighting logic (the "CALFIX" changes in
    meal_planner.py) to ensure high-target users are served adequately.
    NOT imported by any production module.

HOW TO RUN:
    1. Ensure backend/.env has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    2. Run:  python validate_calfix.py
"""


# ========================= IMPORTS ==========================
import os
import sys

# Force UTF-8 stdout on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Load environment variables and create a service-role client.
load_dotenv()

client = create_client(os.getenv('VITE_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))


# ====================== MAIN LOGIC ==========================
# Step 1: Find the user with the highest calorie target.
# Step 2: Generate a daily meal plan using the CF + RMSE engine.
# Step 3: Print a formatted plan table.
# Step 4: Run pass/fail validation checks.
# =============================================================

# ── Step 1: Find the highest-target user ──
res = client.table('user_data').select('user_id, target_calories, target_protein, goal_type').execute()
users = sorted(res.data, key=lambda x: x.get('target_calories') or 0, reverse=True)

user = users[0]
uid = user['user_id']
target_cal = user['target_calories']
target_prot = user['target_protein']
goal = user['goal_type']
print(f"User: {uid[:12]}...")
print(f"Goal: {goal}")
print(f"Target: {target_cal} cal, {target_prot}g protein")
print()

# ── Step 2: Generate a daily meal plan ──
from meal_planner import generate_daily_plan
plan = generate_daily_plan(uid, client)

total_cal = plan['totals']['calories']
total_prot = plan['totals']['protein']
t_cal = plan['targets']['calories']
t_prot = plan['targets']['protein']

# ── Step 3: Print the plan ──
print("=" * 70)
print("  MEAL PLAN")
print("=" * 70)
for slot in plan['slots']:
    m = slot['meal']
    if m:
        mc = m.get('calories') or 0
        mp = float(m.get('protein') or 0)
        sc = slot['target_cal']
        pct = mc / sc * 100 if sc > 0 else 0
        name = m['meal_name'][:30]
        print(f"  {slot['slot_name']:12s} | {name:30s} | {mc:4d} cal (target {sc:4d}, {pct:.0f}%) | {mp:.0f}g prot")
    else:
        print(f"  {slot['slot_name']:12s} | NO MEAL FOUND")

print()
print("=" * 70)
print(f"  Calories: {total_cal} / {t_cal} ({total_cal/t_cal:.0%})")
print(f"  Protein:  {total_prot}g / {t_prot}g ({total_prot/t_prot:.0%})")
print("=" * 70)

# ── Step 4: Validation checks ──
print()

# Check 1: Total calories must be at least 85% of target
if total_cal >= t_cal * 0.85:
    print("  [PASS] Total calories >= 85% of target")
else:
    print(f"  [FAIL] Total calories only {total_cal/t_cal:.0%} of target (need >= 85%)")

# Check 2: Every main-meal slot must be at least 50% of its slot target
all_pass = True
for slot in plan['slots']:
    m = slot['meal']
    if m:
        mc = m.get('calories') or 0
        sc = slot['target_cal']
        if sc > 150 and mc < sc * 0.50:
            print(f"  [FAIL] {slot['slot_name']}: {mc} cal < 50% of {sc} target")
            all_pass = False
if all_pass:
    print("  [PASS] All slot meals >= 50% of slot calorie target")
