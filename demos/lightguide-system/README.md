# LightGuide system demonstration

Open `index.html` in a modern browser; no server, installation or network connection is required.

User-approved concept demo: save a setup, move the virtual light, recreate it and check the result. Top view explains lateral/front position; side view explains height/tilt. Signal path shows candidate sensors, controller, phone and optional stand feedback. All readings are synthetic, and saves last only for the open session. No camera, Bluetooth or hardware is accessed.

This preserves the accepted pitch example. The maintained app implements the shared native workspace in `apps/mobile/src/ui/RecreationGuide.tsx`; actual manual recreation keeps unknown measurements unknown. The standalone illustration uses per-coordinate demonstration tolerances; the app practice screen uses the existing total-position/quaternion comparison. Neither proves real sensor accuracy.

Private repository storage is not public website hosting.
