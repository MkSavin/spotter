@echo off
rem Thin launcher: all logic lives in the TypeScript CLI.
where bun >nul 2>nul
if errorlevel 1 (
  echo spotter: bun is required - https://bun.sh 1>&2
  exit /b 1
)
bun "%~dp0.integration\cli.ts" %*
