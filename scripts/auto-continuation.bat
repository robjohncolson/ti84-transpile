@echo off
REM Auto-continuation launcher for TI-84 ROM transpilation work.
REM Fired by Windows Task Scheduler every 2 hours.
REM Each run starts a fresh headless Claude Code session (Opus 4.6) that
REM reads CONTINUATION_PROMPT_CODEX.md, dispatches Codex in parallel,
REM falls back to Sonnet subagents on failure, verifies results, and
REM commits+pushes to master. See .auto-continuation-prompt.md for the
REM full wrapper prompt.

setlocal

set PROJECT_DIR=C:\Users\rober\Downloads\Projects\school\follow-alongs
set PROMPT_FILE=%PROJECT_DIR%\.auto-continuation-prompt.md
set LOG_DIR=%PROJECT_DIR%\logs
set TIMESTAMP=%DATE:~10,4%%DATE:~4,2%/%DATE:~7,2%-%TIME:~0,2%%TIME:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%
set TIMESTAMP=%TIMESTAMP:/=%
set LOG_FILE=%LOG_DIR%\auto-session-%TIMESTAMP%.log

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%PROJECT_DIR%"

echo [%DATE% %TIME%] Auto-continuation session starting > "%LOG_FILE%"
echo [%DATE% %TIME%] Project dir: %PROJECT_DIR% >> "%LOG_FILE%"
echo [%DATE% %TIME%] Prompt file: %PROMPT_FILE% >> "%LOG_FILE%"
echo ---------------------------------------------- >> "%LOG_FILE%"

type "%PROMPT_FILE%" | claude --print ^
  --model claude-opus-4-6 ^
  --fallback-model claude-sonnet-4-6 ^
  --permission-mode bypassPermissions ^
  --no-session-persistence ^
  --max-budget-usd 25 ^
  >> "%LOG_FILE%" 2>&1

echo ---------------------------------------------- >> "%LOG_FILE%"
echo [%DATE% %TIME%] Session exited with code %ERRORLEVEL% >> "%LOG_FILE%"

endlocal
exit /b %ERRORLEVEL%
