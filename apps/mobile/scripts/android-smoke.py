"""Exercise the installed release APK through Android's accessibility tree."""
import os
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = 'com.lightguide.codex'
OUT = Path('artifacts/android-smoke')
OUT.mkdir(parents=True, exist_ok=True)
evidence = {'source_sha': os.environ.get('GITHUB_SHA'), 'package': PACKAGE, 'checks': []}

def passed(check):
    evidence['checks'].append(check)
    print('PASS: ' + check, flush=True)

def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=30)

def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/lightguide-ui.xml')
    raw = adb('shell', 'cat', '/sdcard/lightguide-ui.xml')
    (OUT / 'latest-ui.xml').write_bytes(raw)
    return ET.fromstring(raw)

def find(label, scroll=False, contains=False):
    for attempt in range(18):
        for node in tree().iter('node'):
            values = [node.get('text', ''), node.get('content-desc', '')]
            if (any(label in v for v in values) if contains else label in values):
                bounds = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
                if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
                    return bounds
        if scroll and attempt > 1:
            width, height = map(int, re.findall(r'\d+', adb('shell', 'wm', 'size').decode())[-2:])
            adb('shell', 'input', 'swipe', str(width//2), str(height*3//4), str(width//2), str(height//3), '350')
        time.sleep(.5)
    raise AssertionError(f'Visible control not found: {label}')

def tap(label, scroll=False, contains=False):
    x1,y1,x2,y2 = find(label,scroll,contains)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def launch():
    adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')

try:
    apk=Path('android/app/build/outputs/apk/release/app-release.apk')
    if not apk.is_file():
        candidates=list(Path('android/app/build/outputs/apk/release').glob('*.apk'))
        if len(candidates)!=1: raise AssertionError('Expected exactly one evaluation APK')
        apk=candidates[0]
    evidence['apk_sha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
    adb('install','-r',str(apk))
    passed('install')
    adb('logcat','-c')
    launch()
    tap('Save a setup')
    passed('launch')
    tap('Setup name')
    adb('shell','input','text','CodexNativeSmoke')
    adb('shell','input','keyevent','KEYCODE_BACK')
    tap('Save setup',scroll=True)
    find('CodexNativeSmoke',contains=True)
    passed('save')
    adb('shell','am','force-stop',PACKAGE)
    pid = subprocess.run(['adb', 'shell', 'pidof', PACKAGE], capture_output=True, timeout=30)
    if pid.returncode != 1 or pid.stdout.strip():
        raise AssertionError('App process remained running after force-stop')
    passed('force-close')
    adb('shell','svc','wifi','disable')
    adb('shell','svc','data','disable')
    launch()
    tap('CodexNativeSmoke',scroll=True,contains=True)
    passed('offline reopen with saved setup')
    tap('Recreate this version',scroll=True)
    for _ in range(4): tap('Mark step complete',scroll=True)
    tap('Finish and record outcome',scroll=True)
    find('Recreation recorded.',contains=True)
    passed('manual recreate and record outcome')
    (OUT/'completed.png').write_bytes(adb('exec-out','screencap','-p'))
    (OUT/'result.txt').write_text('PASS: install, launch, save, offline force-stop/restart, manual recreation outcome.\n')
    print('PASS: Android offline save/restart/recreation journey')
finally:
    (OUT/'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    (OUT/'last-screen.png').write_bytes(adb('exec-out','screencap','-p'))
    (OUT/'logcat.txt').write_bytes(adb('logcat','-d','-t','2000'))
    adb('shell','svc','wifi','enable')
    adb('shell','svc','data','enable')
