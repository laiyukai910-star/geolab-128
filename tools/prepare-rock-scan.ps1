$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root 'artifacts/rock-scan-source'
New-Item -ItemType Directory -Path (Join-Path $destination 'textures') -Force | Out-Null
$files = @(
  @('rock_09_2k.gltf', 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/rock_09/rock_09_2k.gltf', '8b5710ab01c1e4425b898757e5cdbcf2'),
  @('rock_09.bin', 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/rock_09/rock_09.bin', '6f2f71c9ca594566c1a3b29da27293a1'),
  @('textures/rock_09_diff_2k.jpg', 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_09/rock_09_diff_2k.jpg', '7e40809bf4257cc23795d18b349fbfe9'),
  @('textures/rock_09_nor_gl_2k.jpg', 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_09/rock_09_nor_gl_2k.jpg', '3af48ac431dd3a8ea323772a51553f63'),
  @('textures/rock_09_arm_2k.jpg', 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_09/rock_09_arm_2k.jpg', '4c994d22563b80849454e86bd4dfb6e4')
)
foreach ($file in $files) {
  $path = Join-Path $destination $file[0]
  if (!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm MD5).Hash -ne $file[2]) {
    Invoke-WebRequest -Uri $file[1] -OutFile $path -Headers @{'User-Agent'='GeoLab-128 offline asset preparation'}
  }
  if ((Get-FileHash -LiteralPath $path -Algorithm MD5).Hash -ne $file[2]) { throw "Source checksum failed: $($file[0])" }
}
& blender --background --factory-startup --python (Join-Path $PSScriptRoot 'prepare-rock-scan.py') -- $root
if ($LASTEXITCODE -ne 0) { throw 'Blender asset preparation failed' }
