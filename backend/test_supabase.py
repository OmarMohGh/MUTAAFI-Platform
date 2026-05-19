#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_supabase.py — Supabase Import Smoke Test
================================================
FILE:    test_supabase.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    A minimal smoke test that verifies whether the supabase-py library
    (including the ClientOptions class) can be imported correctly from
    the project's virtual environment.

HOW IT FITS IN THE PROJECT:
    Used once during initial environment setup to confirm that the
    Supabase SDK was installed properly.  NOT imported by any
    production module.

HOW TO RUN:
    python test_supabase.py
"""


# ========================= IMPORTS ==========================
import os
import sys


# ====================== MAIN LOGIC ==========================
# Prepend the virtual-environment's site-packages directory to
# sys.path so the supabase package can be found even if the
# venv is not activated.  Then attempt to import ClientOptions.
# ============================================================

# Add venv to path
sys.path.insert(0, os.path.abspath('venv/Lib/site-packages'))

try:
    from supabase import create_client, ClientOptions
    print("ClientOptions imported successfully")
except Exception as e:
    print(f"Error: {e}")
