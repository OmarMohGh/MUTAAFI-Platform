#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed_templates.py — Workout Split Template Seeder
====================================================
FILE:    seed_templates.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    Inserts the full set of workout split templates into the Supabase
    workout_split_templates table.  Templates define which muscle groups
    are trained on each day of the week for every supported schedule
    (1-day through 6-day splits).

    After insertion, the script verifies by printing the day labels
    for each split.

HOW IT FITS IN THE PROJECT:
    The workout_planner.py module reads these templates at plan-
    generation time to determine which muscles to train on each
    weekday.  This script only needs to run ONCE to populate the
    table; it is NOT imported by any production module.

HOW TO RUN:
    1. Ensure backend/.env has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    2. Run:  python seed_templates.py

SCHEMA NOTE:
    week_day uses JavaScript convention: 0 = Sunday … 6 = Saturday.
"""


# ========================= IMPORTS ==========================
from dotenv import load_dotenv
import os
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Load environment variables and create a service-role Supabase client.
load_dotenv()

url = os.getenv('VITE_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
client = create_client(url, key)


# ====================== TEMPLATE DATA ========================
# Each dict defines one day within a split:
#   days_available : how many training days the user picked (1–6)
#   week_day       : 0=Sun, 1=Mon, … 6=Sat
#   day_label      : "Push", "Pull", "Legs", "Upper", "Lower",
#                    "Full Body", or "Rest"
#   muscle_groups  : list of muscles to train (None on rest days)
# =============================================================

templates = [
  # 1 day/week
  {"days_available":1,"week_day":0,"day_label":"Full Body","muscle_groups":["Chest","Back","Shoulders","Quadriceps","Hamstrings","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":1,"week_day":1,"day_label":"Rest","muscle_groups":None},
  {"days_available":1,"week_day":2,"day_label":"Rest","muscle_groups":None},
  {"days_available":1,"week_day":3,"day_label":"Rest","muscle_groups":None},
  {"days_available":1,"week_day":4,"day_label":"Rest","muscle_groups":None},
  {"days_available":1,"week_day":5,"day_label":"Rest","muscle_groups":None},
  {"days_available":1,"week_day":6,"day_label":"Rest","muscle_groups":None},
  # 2 days/week
  {"days_available":2,"week_day":0,"day_label":"Full Body","muscle_groups":["Chest","Back","Shoulders","Quadriceps","Hamstrings","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":2,"week_day":1,"day_label":"Rest","muscle_groups":None},
  {"days_available":2,"week_day":2,"day_label":"Rest","muscle_groups":None},
  {"days_available":2,"week_day":3,"day_label":"Full Body","muscle_groups":["Chest","Back","Shoulders","Quadriceps","Hamstrings","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":2,"week_day":4,"day_label":"Rest","muscle_groups":None},
  {"days_available":2,"week_day":5,"day_label":"Rest","muscle_groups":None},
  {"days_available":2,"week_day":6,"day_label":"Rest","muscle_groups":None},
  # 3 days/week
  {"days_available":3,"week_day":0,"day_label":"Upper","muscle_groups":["Chest","Back","Shoulders","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":3,"week_day":1,"day_label":"Rest","muscle_groups":None},
  {"days_available":3,"week_day":2,"day_label":"Lower","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":3,"week_day":3,"day_label":"Rest","muscle_groups":None},
  {"days_available":3,"week_day":4,"day_label":"Full Body","muscle_groups":["Chest","Back","Shoulders","Quadriceps","Hamstrings","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":3,"week_day":5,"day_label":"Rest","muscle_groups":None},
  {"days_available":3,"week_day":6,"day_label":"Rest","muscle_groups":None},
  # 4 days/week
  {"days_available":4,"week_day":0,"day_label":"Upper","muscle_groups":["Chest","Back","Shoulders","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":4,"week_day":1,"day_label":"Lower","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":4,"week_day":2,"day_label":"Rest","muscle_groups":None},
  {"days_available":4,"week_day":3,"day_label":"Upper","muscle_groups":["Chest","Back","Shoulders","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":4,"week_day":4,"day_label":"Lower","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":4,"week_day":5,"day_label":"Rest","muscle_groups":None},
  {"days_available":4,"week_day":6,"day_label":"Rest","muscle_groups":None},
  # 5 days/week
  {"days_available":5,"week_day":0,"day_label":"Push","muscle_groups":["Chest","Shoulders","Triceps","Abs","Cardio"]},
  {"days_available":5,"week_day":1,"day_label":"Pull","muscle_groups":["Back","Biceps","Abs","Cardio"]},
  {"days_available":5,"week_day":2,"day_label":"Legs","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":5,"week_day":3,"day_label":"Upper","muscle_groups":["Chest","Back","Shoulders","Biceps","Triceps","Abs","Cardio"]},
  {"days_available":5,"week_day":4,"day_label":"Lower","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":5,"week_day":5,"day_label":"Rest","muscle_groups":None},
  {"days_available":5,"week_day":6,"day_label":"Rest","muscle_groups":None},
  # 6 days/week
  {"days_available":6,"week_day":0,"day_label":"Push","muscle_groups":["Chest","Shoulders","Triceps","Abs","Cardio"]},
  {"days_available":6,"week_day":1,"day_label":"Pull","muscle_groups":["Back","Biceps","Abs","Cardio"]},
  {"days_available":6,"week_day":2,"day_label":"Legs","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":6,"week_day":3,"day_label":"Push","muscle_groups":["Chest","Shoulders","Triceps","Abs","Cardio"]},
  {"days_available":6,"week_day":4,"day_label":"Pull","muscle_groups":["Back","Biceps","Abs","Cardio"]},
  {"days_available":6,"week_day":5,"day_label":"Legs","muscle_groups":["Quadriceps","Hamstrings","Glutes","Abs","Cardio"]},
  {"days_available":6,"week_day":6,"day_label":"Rest","muscle_groups":None},
]


# ====================== MAIN LOGIC ==========================
# Insert all template rows into Supabase and verify the results.
# =============================================================

# Bulk-insert all templates in one request
res = client.table("workout_split_templates").insert(templates).execute()
print(f"Inserted {len(res.data)} template rows")

# Verify: print the day labels for each split (1-day through 6-day)
for d in [1,2,3,4,5,6]:
    check = client.table("workout_split_templates").select("week_day, day_label").eq("days_available", d).order("week_day").execute()
    labels = [f"{r['week_day']}:{r['day_label']}" for r in check.data]
    print(f"  {d}-day: {', '.join(labels)}")
