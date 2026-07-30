# Pure Web E2E coverage

Run with `npm run test:e2e` from the repository root. Playwright starts the
Vite browser preview on `127.0.0.1:1420`, blocks every non-loopback HTTP(S)
request, and retains traces/screenshots/video on failure.

## What this suite proves

- System create, save, reload, duplicate, and delete through IndexedDB.
- Hero and champion loadout editing.
- The application drag/drop payload contract for adding a hero to a task.
- Visible progress and deterministic results from the Web Worker simulator.
- Basic rendering at 1440×900, 1280×800, 1024×768, and 390×844.
- No remote runtime requests or remote DOM resource URLs during these flows.
- Browser-native `.zyslineup` download and checksum-validated re-import.

The simulated drag uses the same browser `DataTransfer`
payload as a real card because source cards and task cards live on different
tabs and therefore cannot be pointer-dragged simultaneously.

At 390px the current stylesheet retains a 760px minimum application width. The
suite proves that the narrow viewport still renders and exposes core controls,
and records the resulting horizontal overflow as a Playwright annotation; it
does not claim a reflowed mobile layout.
