#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_check_cardio.py — Quick Cardio Exercise Inspector
====================================================
FILE:    _check_cardio.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform 

WHAT THIS FILE DOES:
    A small diagnostic utility that queries the Supabase workout_data
    table for every exercise whose muscle_group is 'Cardio', then
    prints their IDs, gym requirement, difficulty, and name.

HOW IT FITS IN THE PROJECT:
    This is a ONE-OFF helper script used during development to verify
    that Cardio exercises were seeded correctly into the database.
    It is NOT imported by the main application.

HOW TO RUN:
    1. Ensure backend/.env has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    2. Run:  python _check_cardio.py
"""


# ========================= IMPORTS ==========================
from dotenv import load_dotenv
import os
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Load environment variables and create an authenticated Supabase client.
load_dotenv()

url = os.getenv('VITE_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
client = create_client(url, key)


# ====================== MAIN LOGIC ==========================
# Query all exercises tagged as 'Cardio' and print a summary line
# for each one, showing its ID, gym flag, difficulty, and name.
# ============================================================

res = client.table('workout_data').select('exercise_id, name, difficulty_level, gym').eq('muscle_group', 'Cardio').execute()
print(f"Total Cardio exercises: {len(res.data)}")
for r in res.data:
    print(f"  id={r['exercise_id']} gym={r['gym']} diff={r['difficulty_level']} name={r['name']}")
