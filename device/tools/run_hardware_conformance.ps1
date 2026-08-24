# Run the conformance suite against the real board, unattended.
#
# The board is a SoftAP with no internet, so a machine talking to it is offline
# for the duration - which would also cut the assistant session driving this.
# So the whole sequence runs as one detached job: join the board's network, run
# the suite, write the results to a file, and put the home network back.
#
# The restore is in a finally block on purpose. A failing test must not be able
# to leave the machine stranded on a network with no internet.
#
#   powershell -ExecutionPolicy Bypass -File device/tools/run_hardware_conformance.ps1
#
# Results land in device/reports/conformance_hardware.txt

param(
  [string]$DeviceSsid = 'LightGuide 3B04',
  [string]$HomeSsid   = 'CommunityFibre10Gb_7EF45',
  [string]$DeviceUrl  = 'http://192.168.4.1'
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out  = Join-Path $repo 'device\reports\conformance_hardware.txt'
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

function Log($m) { Add-Content -Path $out -Value $m -Encoding utf8 }

"LightGuide hardware conformance" | Set-Content -Path $out -Encoding utf8
Log ("started: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Log ""

try {
  # --- join the board -------------------------------------------------------
  Log "connecting to '$DeviceSsid'..."
  netsh wlan connect name="$DeviceSsid" | Out-Null

  $ip = $null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
           Where-Object { $_.IPAddress -like '192.168.4.*' }).IPAddress
    if ($ip) { break }
  }
  if (-not $ip) { Log "FAILED: never got a 192.168.4.x address"; return }
  Log "on the board's network as $ip"

  # Prove the board answers before blaming the suite for anything.
  try {
    $info = Invoke-RestMethod -Uri "$DeviceUrl/api/info" -TimeoutSec 8
    Log ("device: " + $info.device_id + "  fw " + $info.firmware + "  proto " + $info.protocol)
  } catch {
    Log "FAILED: /api/info did not answer - $($_.Exception.Message)"
    return
  }
  Log ""

  # --- run the suite --------------------------------------------------------
  Log "running conformance..."
  Log ""
  Push-Location $repo
  $env:LG_DEVICE_URL = $DeviceUrl
  $result = & npx vitest run src/device/conformance.hardware.test.ts --reporter=verbose 2>&1
  $code = $LASTEXITCODE
  Pop-Location
  $result | ForEach-Object { Log ($_ -replace "`e\[[0-9;]*m", '') }
  Log ""
  Log "vitest exit code: $code"
}
finally {
  # Always put the network back, whatever happened above.
  Log ""
  Log "restoring '$HomeSsid'..."
  netsh wlan set profileparameter name="$HomeSsid" connectionmode=auto | Out-Null
  netsh wlan connect name="$HomeSsid" | Out-Null
  Start-Sleep -Seconds 10
  $ssid = (netsh wlan show interfaces | Select-String '^\s+SSID\s+:').Line
  Log ("back on: " + $ssid.Trim())
  Log ("finished: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
}
