#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_test_dates.py — Weekly Date Calculation Tester
=================================================
FILE:    _test_dates.py
PROJECT: MUTAAFI — AI-Powered Fitness & Nutrition Platform

WHAT THIS FILE DOES:
    A small diagnostic script that computes the most recent Sunday
    from today's date and then prints all 7 days of that week
    (Sunday → Saturday).  This was used to verify the week-boundary
    logic shared by the workout planner's accept_plan() function.

HOW IT FITS IN THE PROJECT:
    This is a ONE-OFF developer utility.  It is NOT imported by
    any production module.

HOW TO RUN:
    python _test_dates.py
"""


# ========================= IMPORTS ==========================
from datetime import date, timedelta


# ====================== MAIN LOGIC ==========================
# Calculate the most recent Sunday and print all 7 days of
# that week with their weekday names.
# ============================================================

# Get today's date
today = date.today()

# Python weekday(): Mon=0 … Sun=6
# Shift so that Sunday becomes 0 (matching JS convention)
pw = today.weekday()
dss = (pw + 1) % 7  # This shifts the index so that Sunday becomes 0

# Subtract that many days from today to land on the most recent Sunday
ts = today - timedelta(days=dss)

print("Today:", today, today.strftime("%A"))
print("This Sunday:", ts, ts.strftime("%A"))

# Print every day of the week starting from Sunday
for wd in range(7):
    d = ts + timedelta(days=wd)
    print(f"  wd={wd} -> {d} {d.strftime('%A')}")
