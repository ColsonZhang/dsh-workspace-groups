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

# 1) node_modules 联接（断链会被自动修复）
#
# DSH Desktop 升级会重排自己的插件目录：profile 里的联接可能变成悬空链接
# （指向一个已不存在的目录），此时插件静默消失。这里以"联接能否解析出
# package.json"为准重建，而不是只比对 Target 字符串。
$linkHealthy = $false
if (Test-Path $linkDir) {
  $item = Get-Item $linkDir -Force
  $targetResolves = $false
  foreach ($t in @($item.Target)) { if ($t -and (Test-Path (Join-Path $t 'package.json'))) { $targetResolves = $true } }
  if ($item.LinkType -eq 'Junction' -and $targetResolves -and (Test-Path (Join-Path $linkDir 'package.json'))) {
    $linkHealthy = $true
    Write-Host "联接健康：$linkDir -> $($item.Target -join ', ')"
  } else {
    Write-Host "移除失效联接：$linkDir（原目标：$($item.Target -join ', ')）"
    if ($item.LinkType -eq 'Junction') { cmd /c rmdir "$linkDir" | Out-Null } else { Remove-Item $linkDir -Recurse -Force }
  }
}
if (-not $linkHealthy) {
  New-Item -ItemType Junction -Path $linkDir -Target $repo | Out-Null
  Write-Host "已创建联接：$linkDir -> $repo"
}

# 2) profile package.json：依赖 + bundles
$pkgPath = Join-Path $profileDir 'package.json'
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$changed = $false
if (-not $pkg.dependencies.'dsh-workspace-groups') {
  # 依赖 spec 用本机默认布局（插件仓库位于 harness 的 ../../../plugins 下）。
  # 仓库挪到别处时这个 spec 会指向旧位置，但 node_modules 联接已指向真实仓库，
  # 而 loader 正是从联接解析包的，所以插件照常工作；换机器请改用
  # `dsh plugin --profile web add <仓库绝对路径>`。
  $pkg.dependencies | Add-Member -NotePropertyName 'dsh-workspace-groups' -NotePropertyValue 'link:../../../plugins/dsh-workspace-groups' -Force
  $changed = $true
}
if ($pkg.dsh.profile.bundles -notcontains 'dsh-workspace-groups') {
  # DSH Desktop 升级时会在安装损坏的情况下把本包从 bundles 里剔除，这里补回。
  $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + 'dsh-workspace-groups'
  $changed = $true
}
if ($changed) {
  Copy-Item $pkgPath "$pkgPath.bak-dsh-workspace-groups" -Force
  $json = $pkg | ConvertTo-Json -Depth 32
  # 必须写无 BOM 的 UTF-8：严格 JSON 解析（含本仓库的自检脚本）不接受 BOM。
  [System.IO.File]::WriteAllText($pkgPath, $json, (New-Object System.Text.UTF8Encoding($false)))
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
