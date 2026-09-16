# 安装 dsh-workspace-groups 到指定 DSH profile。
#
#   .\scripts\install.ps1                 # 默认 web profile，从本仓库所在目录安装
#   .\scripts\install.ps1 -Profile web    # 指定 profile
#   .\scripts\install.ps1 -FromNpm        # 改为从 npm 安装（正式发布后可用）
#
# 从本地目录安装时使用 pnpm 的 link 协议，源码改动只需重启 DSH 生效，不需要重新安装。

param(
  [string]$Profile = 'web',
  [switch]$FromNpm,
  [string]$DshHome = "$env:APPDATA\dsh-desktop\harness"
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $DshHome "profiles\$Profile"

if (-not (Test-Path $profileDir)) {
  throw "找不到 profile 目录：$profileDir（用 -DshHome 指定 DSH_HOME）"
}

$dsh = Get-Command dsh -ErrorAction SilentlyContinue
$target = if ($FromNpm) { 'dsh-workspace-groups' } else { $repo }

if ($dsh) {
  Write-Host "运行: dsh plugin --profile $Profile add $target"
  & $dsh.Source plugin --profile $Profile add $target
} else {
  Write-Host '未找到 dsh 命令；改用手工装配（package.json + cordis.patch.yml + node_modules 联接）。'
  & (Join-Path $PSScriptRoot 'link-dev.ps1') -Profile $Profile -DshHome $DshHome
}

Write-Host ''
Write-Host '完成。请重启 DSH Desktop / dsh web —— 客户端包只在启动时进入模块图。'
