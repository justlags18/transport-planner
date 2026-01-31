@echo off
cd /d "%~dp0"

echo ============================================
echo   Transport Planner - Run everything
echo ============================================
echo.

echo [1/6] Backend: npm install...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 ( echo Backend npm install failed. Is Node.js installed? && pause && exit /b 1 )

echo.
echo [2/6] Backend: Prisma generate...
call npx prisma generate
if errorlevel 1 ( echo Prisma generate failed. && pause && exit /b 1 )

echo.
echo [3/6] Backend: Prisma migrate...
call npx prisma migrate dev --name init
if errorlevel 1 ( echo Prisma migrate failed - may be OK if already done. )

echo.
echo [4/6] Frontend: npm install...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 ( echo Frontend npm install failed. && pause && exit /b 1 )

echo.
echo [5/6] Starting BACKEND (new window)...
start "Transport Planner - Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo Waiting 4 seconds...
ping 127.0.0.1 -n 5 >nul

echo [6/6] Starting FRONTEND (new window)...
start "Transport Planner - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Done. Two windows opened.
echo Open http://localhost:5173 in your browser when the frontend window shows "Local: http://localhost:5173/"
echo.
pause
