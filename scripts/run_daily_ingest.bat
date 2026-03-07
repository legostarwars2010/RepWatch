@echo off
REM Run from repo root so .env is loaded. Use this as the "Program" in Task Scheduler
REM with "Start in" set to this script's directory (or repo root).
cd /d "%~dp0.."
node scripts/daily_ingest.js
