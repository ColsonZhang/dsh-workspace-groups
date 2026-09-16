# 开发模式装配：不改 dsh 安装目录，把本仓库联接到 profile 的 node_modules，
# 并在 profile 的 cordis.patch.yml 里插入挂载行。用于没有 dsh CLI 的桌面端。
#
#   .\scripts\link-dev.ps1
#   .\scripts\link-dev.ps1 -Profile web -DshHome "$env:APPDATA\dsh-desktop\harness"

param(
  [string]$Profile = 'web',
  [string]$DshHome = "$env:APPDATA\dsh-desktop\harness"
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $DshHome "profiles\$Profile"
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$linkDir = Join-Path $profileDir 'node_modules\dsh-workspace-groups'

if (-not (Test-Path $profileDir)) { throw "找不到 profile 目录：$profileDir" }

# 1) node_modules 联接
if (Test-Path $linkDir) {
  $item = Get-Item $linkDir -Force
  if ($item.LinkType -eq 'Junction' -and $item.Target -contains $repo) {
    Write-Host "联接已存在且指向本仓库：$linkDir"
  } else {
    Write-Host "移除旧条目：$linkDir"
    if ($item.LinkType -eq 'Junction') { cmd /c rmdir "$linkDir" } else { Remove-Item $linkDir -Recurse -Force }
  }
}
if (-not (Test-Path $linkDir)) {
  New-Item -ItemType Junction -Path $linkDir -Target $repo | Out-Null
  Write-Host "已创建联接：$linkDir -> $repo"
}

# 2) profile package.json：依赖 + bundles
$pkgPath = Join-Path $profileDir 'package.json'
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $pkg.dependencies.'dsh-workspace-groups') {
  Copy-Item $pkgPath "$pkgPath.bak-dsh-workspace-groups" -Force
  $pkg.dependencies | Add-Member -NotePropertyName 'dsh-workspace-groups' -NotePropertyValue 'link:../../../plugins/dsh-workspace-groups' -Force
  if ($pkg.dsh.profile.bundles -notcontains 'dsh-workspace-groups') {
    $pkg.dsh.profile.bundles += 'dsh-workspace-groups'
  }
  $pkg | ConvertTo-Json -Depth 32 | Set-Content $pkgPath -Encoding UTF8
  Write-Host "已更新 $pkgPath（备份：$pkgPath.bak-dsh-workspace-groups）"
} else {
  Write-Host 'profile package.json 已包含本插件，跳过。'
}

# 3) profile cordis.patch.yml：只有在没有 bundle 挂载时才需要手工行。
#
# 本插件的 package.json 声明了 dsh.bundle.patch（./cordis.patch.yml），所以只要
# dsh.profile.bundles 里有本插件，bundle 就会插入 `id: workspace-groups` 这一行。
# 此时再写一条手工行，loader 会以 "duplicate loader entry id: workspace-groups"
# 拒绝启动整个插件树（DSH Desktop 会落到安全模式）。
$declaresBundle = $false
$repoPkgPath = Join-Path $repo 'package.json'
if (Test-Path $repoPkgPath) {
  $repoPkg = Get-Content $repoPkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $declaresBundle = $null -ne $repoPkg.dsh.bundle.patch
}
$patch = Get-Content $patchPath -Raw -Encoding UTF8
if ($patch -match "name:\s*'dsh-workspace-groups'") {
  Write-Host 'cordis.patch.yml 已提到本插件，跳过（若该行未停用，请设 disabled: true 或删除）。'
} elseif ($declaresBundle) {
  Write-Host '本插件自带 dsh.bundle.patch，挂载由 bundle 提供：不写手工挂载行（避免 id 冲突）。'
} else {
  Copy-Item $patchPath "$patchPath.bak-dsh-workspace-groups" -Force
  $addition = @"

# dsh-workspace-groups（本地开发挂载）
- insert:
    - id: workspace-groups
      name: 'dsh-workspace-groups'
"@
  Add-Content -Path $patchPath -Value $addition -Encoding UTF8
  Write-Host "已更新 $patchPath（备份：$patchPath.bak-dsh-workspace-groups）"
}

Write-Host ''
Write-Host '完成。请重启 DSH Desktop / dsh web。'
Write-Host "自检：node `"$repo\scripts\check-profile-mount.mjs`" --profile $Profile"
