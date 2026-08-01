param(
  [Parameter(Position = 0)]
  [string]$OldProject
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[Hoi Am] $Message" -ForegroundColor Cyan
}

function Confirm-Overwrite([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $true
  }

  $answer = Read-Host "File $Path already exists. Overwrite? (y/N)"
  return $answer -match '^(y|yes)$'
}

function Get-EnvNames([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }

  $names = @()
  foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      $names += $Matches[1]
    }
  }

  return $names | Sort-Object -Unique
}

$CurrentProject = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

if ([string]::IsNullOrWhiteSpace($OldProject)) {
  Write-Host 'Enter the path to the previous version.'
  Write-Host 'Example: C:\Users\hi\hoiam-main'
  $OldProject = Read-Host 'Old folder'
}

if ([string]::IsNullOrWhiteSpace($OldProject)) {
  Write-Error 'The old folder path is empty.'
}

try {
  $OldProject = (Resolve-Path -LiteralPath $OldProject -ErrorAction Stop).Path
} catch {
  Write-Error "Folder not found: $OldProject"
}

if (-not (Test-Path -LiteralPath $OldProject -PathType Container)) {
  Write-Error 'The supplied path is not a folder.'
}

if ([string]::Equals($OldProject, $CurrentProject, [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Error 'The old and new folders must be different.'
}

Write-Step "Importing configuration from: $OldProject"

$Copied = @()
$EnvFiles = @('.env.local', '.env.development.local', '.env.production.local')

foreach ($Name in $EnvFiles) {
  $Source = Join-Path $OldProject $Name
  $Destination = Join-Path $CurrentProject $Name

  if (Test-Path -LiteralPath $Source -PathType Leaf) {
    if (Confirm-Overwrite $Destination) {
      Copy-Item -LiteralPath $Source -Destination $Destination -Force
      $Copied += $Name
      Write-Step "Copied $Name"
    }
  }
}

$OldProjectLink = Join-Path $OldProject '.vercel\project.json'
$NewVercelDirectory = Join-Path $CurrentProject '.vercel'
$NewProjectLink = Join-Path $NewVercelDirectory 'project.json'

if (Test-Path -LiteralPath $OldProjectLink -PathType Leaf) {
  if (Confirm-Overwrite $NewProjectLink) {
    New-Item -ItemType Directory -Path $NewVercelDirectory -Force | Out-Null
    Copy-Item -LiteralPath $OldProjectLink -Destination $NewProjectLink -Force
    $Copied += '.vercel\project.json'
    Write-Step 'Copied the Vercel project link'
  }
}

if ($Copied.Count -eq 0) {
  Write-Error 'No .env.local or .vercel\project.json was found in the old folder.'
}

$LocalEnv = Join-Path $CurrentProject '.env.local'
$Names = Get-EnvNames $LocalEnv
$Missing = @()

if ($Names -notcontains 'SUPABASE_URL') {
  $Missing += 'SUPABASE_URL'
}

if (($Names -notcontains 'SUPABASE_SECRET_KEY') -and ($Names -notcontains 'SUPABASE_SERVICE_ROLE_KEY')) {
  $Missing += 'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY'
}

if ($Names -notcontains 'ADMIN_PASSWORD') {
  $Missing += 'ADMIN_PASSWORD'
}

if ($Names -notcontains 'ADMIN_SESSION_SECRET') {
  $Missing += 'ADMIN_SESSION_SECRET'
}

if ($Missing.Count -gt 0) {
  Write-Warning ('Missing: ' + ($Missing -join ', '))

  if (Test-Path -LiteralPath $NewProjectLink) {
    Write-Host 'Run refresh-env.cmd to pull production variables from Vercel.' -ForegroundColor Yellow
  } else {
    Write-Host 'Add the missing variables to .env.local.' -ForegroundColor Yellow
  }
} else {
  Write-Step 'All required environment variables were found'
}

Write-Host ''
Write-Host 'Imported:' -ForegroundColor Green
$Copied | ForEach-Object { Write-Host "  - $_" }
Write-Host ''
Write-Host 'Secret values were not displayed or sent anywhere.' -ForegroundColor DarkGray
