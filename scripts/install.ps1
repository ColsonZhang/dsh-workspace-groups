# 安装 dsh-workspace-groups 到指定 DSH profile。
#
#   .\scripts\install.ps1                  # 自动识别 profile 与 DSH_HOME
#   .\scripts\install.ps1 -Profile desktop # 指定 profile（官方桌面端默认 desktop）
#   .\scripts\install.ps1 -FromNpm         # 改为从 npm 安装（发布后可用）
#
# 自动识别规则：
#   DSH_HOME   = $env:DSH_HOME，否则 ~/.dsh（官方 DeepSeek Harness），
#                否则 %APPDATA%\dsh-desktop\harness（社区 DSH Desktop）
#   Profile    = $env:DSH_PROFILE，否则 desktop / web / tui 中第一个存在的
#
# 从本地目录安装使用 pnpm 的 link 协议，源码改动只需重启 DSH 生效。

param(
  [string]$Profile = '',
  [switch]$FromNpm,
  [string]$DshHome = ''
)

$ErrorActionPreference = 'Stop'

function Get-DefaultDshHome {
  if ($env:DSH_HOME) { return $env:DSH_HOME }
  $official = Join-Path $env:USERPROFILE '.dsh'
  if (Test-Path $official) { return $official }
  return (Join-Path $env:APPDATA 'dsh-desktop\harness')
}

function Get-DefaultProfile([string]$Home) {
  if ($env:DSH_PROFILE) { return $env:DSH_PROFILE }
  foreach ($name in @('desktop', 'web', 'tui')) {
    if (Test-Path (Join-Path $Home "profiles\$name\package.json")) { return $name }
  }
  return 'web'
}

$repo = Split-Path -Parent $PSScriptRoot
if (-not $DshHome) { $DshHome = Get-DefaultDshHome }
if (-not $Profile) { $Profile = Get-DefaultProfile $DshHome }
$profileDir = Join-Path $DshHome "profiles\$Profile"

if (-not (Test-Path $profileDir)) {
  throw "找不到 profile 目录：$profileDir（用 -DshHome 指定 DSH_HOME，用 -Profile 指定 profile）"
}

# 官方桌面端自带 dsh 命令；社区版没有时退回手工装配。
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
$target = if ($FromNpm) { 'dsh-workspace-groups' } else { $repo }

Write-Host "DSH_HOME = $DshHome"
Write-Host "profile  = $Profile"

if ($dsh) {
  Write-Host "运行: dsh plugin --profile $Profile add $target"
  & $dsh.Source plugin --profile $Profile add $target
} else {
  Write-Host '未找到 dsh 命令；改用手工装配（package.json + cordis.patch.yml + node_modules 联接）。'
  & (Join-Path $PSScriptRoot 'link-dev.ps1') -Profile $Profile -DshHome $DshHome
}

Write-Host ''
Write-Host '完成。请重启 DSH —— 客户端包只在启动时进入模块图，刷新页面不够。'
