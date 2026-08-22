# M4 — Live WebSocket

**Sketch:** `04_websocket_live.ino` *(not written yet)*

WebSocket at `/live`, 10 Hz `Reading` frames.

**Acceptance:** the app renders live guidance from the real board and the numbers respond
correctly to moving the stand.

> The client **validates every frame and silently drops** malformed ones. "The app shows
> nothing" is the expected symptom of one wrong field type — suspect frame shape first.
> Field-by-field rules: `../../docs/01-API-CONTRACT.md` §3.
