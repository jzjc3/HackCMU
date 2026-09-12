# HackCMU

Mind travel prototype: a local desktop app that renders a live, CPU-only 2D continent map.

Each continent, including Antarctica, can be recolored and visually faded live through controls or direct JSON parameter edits. The map geometry comes from Natural Earth data.

## Run The App

```powershell
python continent_map_app.py
```

On Windows, you can also double-click:

```text
launch_continent_map_app.bat
```

## What It Uses

- Python standard-library Tkinter for the desktop UI.
- Tkinter Canvas for 2D map rendering.
- `data/continents.geojson` for the local continent geometry data.
- No GPU, map API, web server, pip package, or AI image generation is required.

## Key Files

- `continent_map_app.py`: desktop app.
- `data/continents.geojson`: generated map datapoints.
- `scripts/build-continents-data.mjs`: repeatable Natural Earth data generation script.
- `IMPLEMENTATION.md`: implementation steps and tools used.
