# VideoNote Taker: запуск локального сервера (Windows PowerShell 5.1+)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = 'VideoNote Taker - сервер'

function Stop-WithPause([int]$code) {
  Write-Host ''
  Read-Host 'Нажмите Enter, чтобы закрыть окно' | Out-Null
  exit $code
}
function Test-Command([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}
function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}
function Say([string]$text, [string]$color = 'Gray') {
  Write-Host $text -ForegroundColor $color
}

$serverDir = Join-Path $PSScriptRoot 'server'
if (-not (Test-Path (Join-Path $serverDir 'dist\server.js'))) {
  Say '[!] Не найдена папка server.' Red
  Say '    Сначала распакуйте архив целиком (в WinRAR: кнопка «Извлечь…»),' Yellow
  Say '    затем запустите start-backend.bat из распакованной папки.' Yellow
  Stop-WithPause 1
}
Set-Location $serverDir

# 1. Node.js
if (-not (Test-Command 'node')) {
  Say '[!] Не найден Node.js. Сейчас откроется сайт: скачайте версию LTS, установите и запустите этот файл снова.' Red
  Start-Process 'https://nodejs.org'
  Stop-WithPause 1
}
$nodeMajor = [int](((node -v) -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 20) {
  Say "[!] Установлен устаревший Node.js (версия $nodeMajor). Нужна версия 20 или новее: https://nodejs.org" Red
  Stop-WithPause 1
}

# 2. yt-dlp и ffmpeg
if (-not (Test-Command 'yt-dlp') -or -not (Test-Command 'ffmpeg')) {
  if (-not (Test-Command 'winget')) {
    Say '[!] Не найден winget. Установите «App Installer» из Microsoft Store или поставьте yt-dlp и ffmpeg вручную.' Red
    Stop-WithPause 1
  }
  if (-not (Test-Command 'yt-dlp')) {
    Say '[i] Устанавливаю yt-dlp (скачивает субтитры)...' Cyan
    winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
  }
  if (-not (Test-Command 'ffmpeg')) {
    Say '[i] Устанавливаю ffmpeg (обработка звука)...' Cyan
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  }
  Update-PathFromRegistry
  if (-not (Test-Command 'yt-dlp')) {
    Say '[i] yt-dlp установлен. Закройте это окно и запустите start-backend.bat ещё раз.' Yellow
    Stop-WithPause 0
  }
}

# 3. Настройки и компоненты сервера
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
if (-not (Test-Path 'node_modules')) {
  Say '[i] Первый запуск: устанавливаю компоненты сервера (1-2 минуты)...' Cyan
  & npm.cmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Say '[!] Не удалось установить компоненты. Проверьте интернет и запустите снова.' Red
    if (Test-Path 'node_modules') { Remove-Item 'node_modules' -Recurse -Force }
    Stop-WithPause 1
  }
}

# 4. Запуск
Write-Host ''
Say ' VideoNote Taker: сервер запускается.' Green
Say ' Не закрывайте это окно, пока пользуетесь расширением (можно свернуть).' Green
Write-Host ''
& node --env-file=.env dist/server.js
Say '[!] Сервер остановлен.' Yellow
Stop-WithPause $LASTEXITCODE
