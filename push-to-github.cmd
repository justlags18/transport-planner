@echo off
cd /d "%~dp0"

echo Setting git user for this repo...
git config user.email "Justlags18@users.noreply.github.com"
git config user.name "Justlags18"

echo Initializing git...
git init
git add .
git status
git commit -m "Initial commit: Transport Planner with light/dark theme"

echo.
echo Adding remote and pushing...
echo (Git may open a browser or ask for username/password - see GITHUB_SETUP.md "Log in to GitHub" if needed)
git remote add origin https://github.com/Justlags18/transport-planner.git 2>nul
if errorlevel 1 git remote set-url origin https://github.com/Justlags18/transport-planner.git
git branch -M main
git push -u origin main

echo.
echo Done. Pause...
pause
