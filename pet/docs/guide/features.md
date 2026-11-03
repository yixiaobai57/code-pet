# Features and Controls

## Independent Mascots

The app now launches two separate mascot windows:

- a cat window
- a penguin window

Each mascot owns its own edge path, corner timing, and speed multiplier. That means they do not turn in sync, and their movement drifts naturally over time instead of looking locked together.

## Mascot Modes

The tray exposes four behavior modes:

- `Running`: both mascots walk automatically around the outer edges of the current display.
- `Idle`: both mascots stay visible but stop walking.
- `Random`: each mascot alternates between running and idle on a timer.
- `Codex`: both mascots poll `.codex/state_5.sqlite` and speed up when Codex has more recent active work.

The mascot windows stay always on top and click-through, so they remain visible without blocking clicks on other apps.

## Speed Control

You can change the base speed from the tray menu:

- `Speed: Fast`
- `Speed: Medium`
- `Speed: Slow`

The tray speed is shared, but each mascot still applies its own multiplier on top of that base value.

## Background Illustration

The tray item `Show Background` reveals a wide background illustration behind the mascots. The background is non-interactive so it does not block clicks on other windows.

## Tray Interaction

- Double-click the tray icon to reveal all mascot windows without taking focus.
- Use `Show` when the mascot windows are hidden.
- Use `Quit` to exit fully instead of minimizing to the tray.

## Developer Notes

- `main.js` manages one `BrowserWindow` per mascot from `MASCOT_WINDOW_CONFIGS`.
- `index.html` reads `window.location.search` to choose the mascot assets, size, and speed multiplier.
- `Codex` mode keeps using the shared Codex activity feed while each renderer continues to animate independently.
