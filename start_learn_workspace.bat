@echo off
setlocal
title Ukid Learning Workspace
color 0E
cd /d "%~dp0"

set "WORKSPACE_PORT=5501"
set "WORKSPACE_OLLAMA_URL=http://127.0.0.1:11434/api/generate"
set "WORKSPACE_OPEN_BROWSER=1"
set "OLLAMA_EXE="

echo.
echo ==========================================
echo       UKID LEARNING WORKSPACE
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js was not found. Install Node.js 20 or newer.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found.
    pause
    exit /b 1
)

echo Choose the Ollama connection:
echo   1. Local Ollama (uses this computer)
echo   2. Ollama Cloud (uses your OLLAMA_API_KEY)
set "WORKSPACE_MODE_CHOICE="
set /p "WORKSPACE_MODE_CHOICE=Enter 1 or 2 [1]: "
if /i "%WORKSPACE_MODE_CHOICE%"=="2" goto cloud_mode

set "WORKSPACE_OLLAMA_MODE=local"
if not defined WORKSPACE_MODEL set "WORKSPACE_MODEL=qwen2.5-coder:3b"
where ollama >nul 2>&1
if not errorlevel 1 set "OLLAMA_EXE=ollama"
if not defined OLLAMA_EXE if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not defined OLLAMA_EXE (
    echo ERROR: Ollama was not found. Install it from https://ollama.com/download/windows
    pause
    exit /b 1
)
"%OLLAMA_EXE%" list >nul 2>&1
if errorlevel 1 start "Ollama" /min "%OLLAMA_EXE%" serve
"%OLLAMA_EXE%" show %WORKSPACE_MODEL% >nul 2>&1
if errorlevel 1 (
    echo Downloading %WORKSPACE_MODEL%...
    "%OLLAMA_EXE%" pull %WORKSPACE_MODEL%
    if errorlevel 1 (
        echo ERROR: Model download failed.
        pause
        exit /b 1
    )
)
goto run_workspace

:cloud_mode
set "WORKSPACE_OLLAMA_MODE=cloud"
if not defined WORKSPACE_MODEL set "WORKSPACE_MODEL=glm-5.3"
if not defined OLLAMA_API_KEY (
    echo ERROR: OLLAMA_API_KEY is not set. Add it to your Windows user environment variables.
    pause
    exit /b 1
)

:run_workspace
echo.
echo Starting Ukid Studio at http://127.0.0.1:%WORKSPACE_PORT%/
echo Learning workspace: http://127.0.0.1:%WORKSPACE_PORT%/learn-workspace.html
echo Ollama model: %WORKSPACE_MODEL%
echo Press Ctrl+C in this window to stop the local site.
echo.
call npm.cmd run start:learn-workspace
if errorlevel 1 (
    echo The Ukid Studio server stopped or could not start.
    pause
)