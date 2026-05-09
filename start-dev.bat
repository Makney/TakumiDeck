@echo off
REM Schnellstart für TakumiDeck im Dev-Modus.
REM Setzt NODE_ENV auf development; AppData-Ordner bekommt -dev-Suffix.
set NODE_ENV=development
cd /d "%~dp0"
call npm start
