#Requires -Version 5.1
<#
.SYNOPSIS
  127.0.0.1 の DB ポートを Mac へ横流しする portproxy を管理する。

.DESCRIPTION
  移設後も Windows 側の設定 (Excubitor catalog の env、Infisical の secret、
  各サービスの既定値) を一切書き換えずに済ませるためのフォワーダ。

    127.0.0.1:5432 -> <mac>:5432   PostgreSQL (共有)
    127.0.0.1:6379 -> <mac>:6379   Redis (共有)
    127.0.0.1:8931 -> <mac>:8931   Infisical backend  (-IncludeInfisical)

  管理者権限が必要。設定は再起動後も残る。

.EXAMPLE
  .\portproxy.ps1 -Action add -MacHost <mac-tailscale-ip>
  .\portproxy.ps1 -Action status
  .\portproxy.ps1 -Action remove
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('add', 'remove', 'status')]
  [string]$Action,

  [string]$MacHost,

  [switch]$IncludeInfisical
)

$ErrorActionPreference = 'Stop'

$ports = @(5432, 6379)
if ($IncludeInfisical) { $ports += 8931 }

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'この操作には管理者権限が必要です。管理者として PowerShell を開き直してください'
  }
}

function Assert-IpHelper {
  $svc = Get-Service -Name iphlpsvc -ErrorAction SilentlyContinue
  if ($null -eq $svc) { throw 'IP Helper (iphlpsvc) サービスが見つかりません。portproxy は動作しません' }
  if ($svc.Status -ne 'Running') {
    throw "IP Helper (iphlpsvc) が停止しています (現在: $($svc.Status))。portproxy は IP Helper 依存です。Start-Service iphlpsvc で開始してください"
  }
}

switch ($Action) {

  'status' {
    Write-Host '=== portproxy 設定 ==='
    netsh interface portproxy show v4tov4
    Write-Host ''
    Write-Host '=== 到達確認 ==='
    foreach ($p in $ports) {
      $r = Test-NetConnection -ComputerName 127.0.0.1 -Port $p -WarningAction SilentlyContinue
      $mark = if ($r.TcpTestSucceeded) { 'OK  ' } else { 'NG  ' }
      Write-Host ("  {0}127.0.0.1:{1}" -f $mark, $p)
    }
    Write-Host ''
    Write-Host 'NG のときの確認順序 (MAC-MIGRATION.md §8):'
    Write-Host '  1. Mac は生きているか      tailscale status'
    Write-Host '  2. portproxy は張られているか (上の一覧)'
    Write-Host '  3. Mac 側の container      ssh <mac> docker ps'
  }

  'add' {
    if (-not $MacHost) { throw '-MacHost に Mac のアドレス (Tailscale の 100.x など) を指定してください' }
    Assert-Admin
    Assert-IpHelper

    # ローカルの container がまだ同じポートを掴んでいると listen できない
    foreach ($p in $ports) {
      $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
      if ($busy) {
        throw "port $p を既に何かが LISTEN しています。先に旧コンテナを止めてください: docker compose stop postgres redis"
      }
    }

    foreach ($p in $ports) {
      netsh interface portproxy add v4tov4 `
        listenaddress=127.0.0.1 listenport=$p `
        connectaddress=$MacHost connectport=$p | Out-Null
      Write-Host ("added  127.0.0.1:{0} -> {1}:{0}" -f $p, $MacHost)
    }

    Write-Host ''
    Write-Host '設定しました。到達確認:'
    if ($IncludeInfisical) { & $PSCommandPath -Action status -IncludeInfisical }
    else                   { & $PSCommandPath -Action status }
  }

  'remove' {
    Assert-Admin
    foreach ($p in $ports) {
      netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$p 2>$null | Out-Null
      Write-Host ("removed 127.0.0.1:{0}" -f $p)
    }
    Write-Host ''
    Write-Host '切り戻すには旧コンテナを起動してください:'
    Write-Host '  cd E:\Document\Ars\infra'
    Write-Host '  docker compose start postgres redis'
  }
}
