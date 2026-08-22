#Requires -Version 5.1
<#
.SYNOPSIS
  Mac 移設用に Windows 側の PostgreSQL を論理 dump する。

.DESCRIPTION
  共有 infra postgres (infra-postgres-1) と、任意で Infisical の DB (infisical-db) を
  pg_dumpall で吸い出す。volume の tar コピーではなく論理 dump を使うのは、
  移設先の Mac が arm64 でアーキテクチャが変わるため。

  Redis は移設対象外 (キャッシュ / queue なので捨ててよい)。

.NOTES
  リダイレクトは cmd /c 経由で行う。PowerShell 5.1 の `>` は UTF-16 に、
  Out-File -Encoding utf8 は BOM 付きになり、どちらも psql が読めない。
#>
[CmdletBinding()]
param(
  [string]$OutRoot = (Join-Path $env:USERPROFILE 'mac-migration-dump'),
  [switch]$IncludeInfisical,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Assert-Container {
  param([string]$Name)
  $state = docker inspect -f '{{.State.Status}}' $Name 2>$null
  if ($LASTEXITCODE -ne 0) { throw "container '$Name' が見つかりません。Rancher Desktop / OrbStack は起動していますか" }
  if ($state -ne 'running') { throw "container '$Name' が running ではありません (現在: $state)。先に docker start してください" }
}

function Invoke-Dump {
  param([string]$Container, [string]$UserExpr, [string]$OutFile)
  # $UserExpr はコンテナ内で評価される式 (リテラルのユーザ名か $POSTGRES_USER)
  $inner = "docker exec $Container sh -c ""pg_dumpall -U $UserExpr"" > ""$OutFile"""
  cmd /c $inner
  if ($LASTEXITCODE -ne 0) { throw "pg_dumpall が失敗しました (container=$Container, exit=$LASTEXITCODE)" }
  $size = (Get-Item $OutFile).Length
  if ($size -eq 0) { throw "dump が空です: $OutFile" }
  Write-Host ("  -> {0} ({1:N1} MB)" -f (Split-Path $OutFile -Leaf), ($size / 1MB))
}

Write-Host '=== Mac 移設 dump ==='

docker version --format '{{.Server.Version}}' > $null 2>&1
if ($LASTEXITCODE -ne 0) { throw 'docker daemon に接続できません。Rancher Desktop を起動してください' }

$targets = @(
  [pscustomobject]@{ Container = 'infra-postgres-1'; UserExpr = 'ludiars';         File = 'infra-all.sql';     Label = '共有 infra postgres' }
)
if ($IncludeInfisical) {
  $targets += [pscustomobject]@{ Container = 'infisical-db'; UserExpr = '$POSTGRES_USER'; File = 'infisical-all.sql'; Label = 'Infisical postgres' }
}

if ($DryRun) {
  Write-Host '[DryRun] 対象:'
  foreach ($t in $targets) {
    $state = docker inspect -f '{{.State.Status}}' $t.Container 2>$null
    if ($LASTEXITCODE -ne 0) { $state = '(not found)' }
    Write-Host ("  {0,-20} {1,-22} state={2}" -f $t.Container, $t.Label, $state)
  }
  Write-Host ''
  Write-Host '出力先 (実行時): ' -NoNewline
  Write-Host (Join-Path $OutRoot '<timestamp>')
  if (-not $IncludeInfisical) {
    Write-Host ''
    Write-Host 'Infisical も取るなら -IncludeInfisical を付けてください。'
  }
  return
}

foreach ($t in $targets) { Assert-Container $t.Container }

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $OutRoot $stamp
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Write-Host "出力先: $outDir"

$manifest = @("# Mac 移設 dump", "取得日時: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "取得元: $env:COMPUTERNAME", "")

foreach ($t in $targets) {
  Write-Host ("{0} を dump 中..." -f $t.Label)
  $out = Join-Path $outDir $t.File
  Invoke-Dump -Container $t.Container -UserExpr $t.UserExpr -OutFile $out
  $image = docker inspect -f '{{.Config.Image}}' $t.Container
  $manifest += "$($t.File)  <- $($t.Container)  image=$image"
}

$manifest += ''
$manifest += 'restore: Mac 側で bash scripts/mac-migration/restore-mac.sh <このディレクトリ>'
$manifest += ''
$manifest += 'Infisical を移す場合は .env (ENCRYPTION_KEY / AUTH_SECRET を含む) を'
$manifest += '別経路で安全に運ぶこと。本スクリプトは事故防止のため .env をコピーしない。'

[System.IO.File]::WriteAllLines((Join-Path $outDir 'MANIFEST.txt'), $manifest, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host '完了。次にこのディレクトリを Mac へ転送し、restore-mac.sh を実行してください。'
if ($IncludeInfisical) {
  Write-Host ''
  Write-Host '注意: Infisical の .env は別途手で運んでください。' -ForegroundColor Yellow
  Write-Host '      ENCRYPTION_KEY が変わると DB 内の全 secret が復号できなくなります。' -ForegroundColor Yellow
}
