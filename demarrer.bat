@echo off
chcp 65001 > nul
echo ============================================
echo   Methode Langue — serveur local
echo ============================================
echo.
echo Ouverture de l'app dans le navigateur...
timeout /t 1 /nobreak > nul
start "" "http://localhost:8000/app/"
echo.
echo Serveur demarre sur http://localhost:8000
echo Appuie sur Ctrl+C pour arreter.
echo.
python -m http.server 8000
