@echo off
cd /d "%~dp0"

echo Making sure remote is set...
git remote add origin https://github.com/Justlags18/transport-planner.git 2>nul
git remote set-url origin https://github.com/Justlags18/transport-planner.git

echo.
echo Adding and committing local changes...
git add .
git status
git commit -m "Update: sync local changes" 2>nul
if errorlevel 1 (
  echo No changes to commit, or already committed.
) else (
  echo Committed.
)

echo.
echo Syncing with GitHub (pull then push)...
git branch -M main 2>nul
git pull origin main --rebase 2>nul
git push origin main

echo.
echo Done.
pause
