@echo off
powershell -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -UiOnly
