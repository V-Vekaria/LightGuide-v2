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

def adb(*args, timeout=30):
    return subprocess.check_output(['adb', *args], timeout=timeout, stderr=subprocess.STDOUT)

def tree():
    # uiautomator can exit zero without writing when the UI never goes idle.
    # Never reuse the previous screen's XML after such a failed dump.
    for attempt in range(3):
        adb('shell', 'rm', '-f', '/sdcard/lightguide-ui.xml')
        output = adb('shell', 'uiautomator', 'dump', '/sdcard/lightguide-ui.xml')
        (OUT / 'ui-dump.txt').write_bytes(output)
        if b'UI hierchary dumped to:' in output:
            raw = adb('shell', 'cat', '/sdcard/lightguide-ui.xml')
            root = ET.fromstring(raw)
            (OUT / 'latest-ui.xml').write_bytes(raw)
            return root
        print('UI dump did not produce a fresh tree: ' + output.decode(errors='replace'), flush=True)
        time.sleep(1)
    raise AssertionError('Unable to obtain a fresh Android accessibility tree')

def find(label, scroll=False, contains=False, node_class=None, focused=False):
    for attempt in range(18):
        for node in tree().iter('node'):
            if node_class and node.get('class') != node_class:
                continue
            if focused and node.get('focused') != 'true':
                continue
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

def tap(label, scroll=False, contains=False, node_class=None):
    x1,y1,x2,y2 = find(label,scroll,contains,node_class)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def launch():
    output = adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity', timeout=90)
    print(output.decode(errors='replace'), flush=True)
    if b'Error:' in output or b'Status: timeout' in output:
        raise AssertionError('Android activity launch failed')

try:
    apk=Path('android/app/build/outputs/apk/release/app-release.apk')
    if not apk.is_file():
        candidates=list(Path('android/app/build/outputs/apk/release').glob('*.apk'))
        if len(candidates)!=1: raise AssertionError('Expected exactly one evaluation APK')
        apk=candidates[0]
    baseline = Path('artifacts/upgrade-baseline/app-release.apk')
    if baseline.is_file():
        evidence['baseline_apk_sha256'] = hashlib.sha256(baseline.read_bytes()).hexdigest()
        if b'Success' not in adb('install','-r',str(baseline),timeout=180):
            raise AssertionError('Baseline installation failed')
        launch()
        tap('Save a setup')
        tap('Setup name',node_class='android.widget.EditText')
        find('Setup name',node_class='android.widget.EditText',focused=True)
        # The old APK can drop characters from a zero-delay ADB key burst
        # during synchronous draft writes. Seed it at human typing speed,
        # verifying the exact value before testing the upgrade. The candidate
        # still receives the existing whole-name input test below.
        for character in 'LegacyUpgrade':
            adb('shell','input','text',character)
            time.sleep(.2)
        find('LegacyUpgrade',node_class='android.widget.EditText')
        ime=adb('shell','dumpsys','input_method').decode(errors='replace')
        if re.search(r'mInputShown=true\b|mIsInputViewShown=true\b',ime):
            adb('shell','input','keyevent','KEYCODE_BACK')
        tap('Save setup',scroll=True)
        find('LegacyUpgrade',contains=True)
        (OUT/'baseline-saved.png').write_bytes(adb('exec-out','screencap','-p'))
        adb('shell','am','force-stop',PACKAGE)
        passed('baseline v0.1.3 setup saved before upgrade')
    evidence['apk_sha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
    # A freshly booted CI emulator may need more than 30 seconds to install
    # the 66 MB universal APK while Android finishes its own first boot work.
    install_output = adb('install','-r',str(apk), timeout=180)
    (OUT/'install.txt').write_bytes(install_output)
    print(install_output.decode(errors='replace'), flush=True)
    if b'Success' not in install_output:
        raise AssertionError('APK installer did not report Success')
    if not adb('shell','pm','path',PACKAGE).strip().startswith(b'package:'):
        raise AssertionError('Installed Codex package was not found')
    passed('install')
    adb('logcat','-c')
    launch()
    find('Save a setup')
    passed('launch')
    if baseline.is_file():
        tap('LegacyUpgrade',scroll=True,contains=True)
        find('Recreate this version',scroll=True)
        passed('v0.1.3 to v0.1.4 in-place upgrade retained saved setup')
        adb('shell','input','keyevent','KEYCODE_BACK')
        # Home may retain its scroll position; relaunching gives a fresh Home.
        adb('shell','am','force-stop',PACKAGE)
        launch()
        find('Save a setup')
    # Repeated Settings presses must not add duplicate native stack entries.
    for back_control in ('hardware', 'onscreen'):
        tap('Settings')
        find('Your workspace. Your data.')
        for _ in range(4):
            tap('Settings')
        if back_control == 'hardware':
            adb('shell','input','keyevent','KEYCODE_BACK')
        else:
            tap('← Back')
        find('Save a setup')
        passed('repeated Settings taps: one ' + back_control + ' Back returns Home')
    tap('Save a setup')
    # The visible label and editable control share an accessibility name.
    # Require the native input, then prove focus and entry before proceeding.
    tap('Setup name', node_class='android.widget.EditText')
    find('Setup name', node_class='android.widget.EditText', focused=True)
    adb('shell','input','text','CodexNativeSmoke')
    find('CodexNativeSmoke', node_class='android.widget.EditText', focused=True)
    passed('setup name entered')
    # Back navigates out of the form if the keyboard is already hidden.
    ime = adb('shell','dumpsys','input_method').decode(errors='replace')
    if re.search(r'mInputShown=true\b|mIsInputViewShown=true\b', ime):
        adb('shell','input','keyevent','KEYCODE_BACK')
    find('CodexNativeSmoke', node_class='android.widget.EditText')
    (OUT/'setup-entered.png').write_bytes(adb('exec-out','screencap','-p'))
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
    find('MANUAL RECREATION')
    for step in range(1, 5):
        find(f'STEP {step} OF 4')
        tap('Mark step complete',scroll=True)
        if step < 4:
            find(f'STEP {step + 1} OF 4')
        else:
            find('Steps completed')
        passed(f'manual recreation step {step}')
    tap('not evaluated',scroll=True)
    passed('explicit unevaluated outcome selected')
    tap('Finish and record outcome',scroll=True)
    find('Recreation recorded.',contains=True)
    passed('manual recreate and record outcome')
    (OUT/'completed.png').write_bytes(adb('exec-out','screencap','-p'))
    (OUT/'result.txt').write_text('PASS: install, launch, save, offline force-stop/restart, manual recreation outcome.\n')
    print('PASS: Android offline save/restart/recreation journey')
except Exception as error:
    evidence['error'] = repr(error)
    raise
finally:
    (OUT/'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    # Diagnostic failures must not hide the original test failure or prevent
    # the other evidence from being collected.
    for name, command in [('last-screen.png', ('exec-out','screencap','-p')),
                          ('logcat.txt', ('logcat','-d','-t','2000'))]:
        try:
            (OUT/name).write_bytes(adb(*command))
        except Exception as error:
            print(f'Could not collect {name}: {error}', flush=True)
    for service in ('wifi', 'data'):
        try:
            adb('shell','svc',service,'enable')
        except Exception as error:
            print(f'Could not restore {service}: {error}', flush=True)
