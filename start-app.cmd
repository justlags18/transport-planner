@echo off
cd /d "%~dp0"

echo ============================================
echo   Transport Planner - Starting servers
echo ============================================
echo.

echo Opening BACKEND window (port 3001)...
start "Transport Planner - Backend" cmd /k "cd /d "%~dp0backend" && echo Backend folder: %CD% && npm run dev"

echo Waiting 3 seconds for backend to start...
ping 127.0.0.1 -n 4 >nul

echo Opening FRONTEND window (port 5173)...
start "Transport Planner - Frontend" cmd /k "cd /d "%~dp0frontend" && echo Frontend folder: %CD% && npm run dev"

echo.
echo Two windows should have opened.
echo.
echo In the FRONTEND window, wait until you see:
echo   "Local:   http://localhost:5173/"
echo Then open that URL in your browser.
echo.
echo If you see "npm is not recognized", install Node.js from https://nodejs.org
echo If a window shows errors, run these manually in two separate terminals:
echo   Terminal 1:  cd backend   then  npm run dev
echo   Terminal 2:  cd frontend  then  npm run dev
echo.
pause
