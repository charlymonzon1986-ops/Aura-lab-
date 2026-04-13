# Aura Lab - Local Runner Script for PowerShell
# Este script automatiza el inicio del entorno de desarrollo local.

Clear-Host
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   AURA LAB - LABORATORIO PROFESIONAL    " -ForegroundColor Amber
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar si Node.js está instalado
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js no está instalado. Por favor, instálalo desde https://nodejs.org/" -ForegroundColor Red
    Pause
    exit
}

# 2. Verificar node_modules
if (!(Test-Path "node_modules")) {
    Write-Host "[INFO] No se encontró la carpeta node_modules. Instalando dependencias..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Falló la instalación de dependencias." -ForegroundColor Red
        Pause
        exit
    }
}

# 3. Verificar archivo .env
if (!(Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "[WARN] No se encontró el archivo .env. Creando uno basado en .env.example..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
        Write-Host "[!] Por favor, edita el archivo .env con tus credenciales de Firebase y Gemini." -ForegroundColor Cyan
    } else {
        Write-Host "[WARN] No se encontró el archivo .env ni .env.example." -ForegroundColor Red
    }
}

# 4. Iniciar el servidor
Write-Host "[OK] Iniciando servidor de desarrollo..." -ForegroundColor Green
Write-Host "La aplicación estará disponible en: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener el servidor." -ForegroundColor Gray
Write-Host ""

npm run dev
