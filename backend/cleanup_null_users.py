#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cleanup_null_users.py — Null-Age Row Cleaner
==============================================
FILE:    cleanup_null_users.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform (CPCS 499)

WHAT THIS FILE DOES:
    Scans the user_data table for rows where the 'age' column is NULL
    (typically caused by incomplete registrations) and deletes them.

HOW IT FITS IN THE PROJECT:
    A maintenance utility run manually when orphaned/incomplete user
    records need to be purged.  NOT imported by any production module.

HOW TO RUN:
    1. Ensure backend/.env has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
    2. Run:  python cleanup_null_users.py
"""


# ========================= IMPORTS ==========================
import os
from dotenv import load_dotenv
from supabase import create_client


# ===================== CONSTANTS & CONFIG =====================
# Load environment variables and read Supabase credentials.
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


# ===================== HELPER FUNCTIONS =======================

def cleanup():
    """
    Find and delete all user_data rows where age is NULL.

    Parameters:
        None — credentials are read from module-level constants.

    Returns:
        None — results are printed to stdout.

    When / why it is called:
        Run manually from the command line whenever the developer
        suspects orphaned user rows exist after failed registrations.
    """
    # Abort if credentials are missing
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        print("Missing env vars")
        return

    # Create an authenticated Supabase client using the service role key
    client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

    # Query for rows where age is NULL
    print("Checking for rows with NULL age...")
    res = client.table('user_data').select('user_id').is_('age', 'null').execute()
    count = len(res.data)
    print(f"Found {count} null rows.")

    # Delete the offending rows if any were found
    if count > 0:
        print("Deleting null rows...")
        client.table('user_data').delete().is_('age', 'null').execute()
        print("Cleanup complete.")
    else:
        print("No null rows found.")


# ======================== ENTRY POINT ========================
if __name__ == "__main__":
    cleanup()
