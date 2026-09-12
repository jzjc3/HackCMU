# Dynamic Continent Map Implementation

## Result

This project now includes a CPU-only local desktop app that renders a 2D map with seven continent-level shapes:

- Africa
- Antarctica
- Asia
- Europe
- North America
- Australia / Oceania
- South America

Each continent has independently editable color and opacity. The controls and JSON editor update the map live.

The earlier browser prototype files are still present, but the preferred output is now the desktop app:

```powershell
python continent_map_app.py
```

## Steps Taken

1. Downloaded Natural Earth `ne_110m_admin_0_countries.geojson` from the official Natural Earth vector repository mirror on GitHub.
2. Read each country feature's `CONTINENT` property.
3. Grouped country geometries into seven continent-level `GeometryCollection` features.
4. Wrote the grouped map data to `data/continents.geojson`.
5. Built a local Python/Tkinter desktop app that loads the local GeoJSON file.
6. Converted longitude and latitude coordinates into flat canvas coordinates using a simple equirectangular projection.
7. Rendered all source rings for each continent as canvas polygons grouped by continent ID.
8. Added live color controls, opacity sliders, and a JSON editor for direct parameter editing.
9. Kept the browser prototype as a reference implementation, but it is no longer required to use the map.

## Tools Used

- Natural Earth 110m Admin 0 country GeoJSON for real map geometry.
- Node.js built-in `fetch` and file APIs for data preparation.
- Python standard-library Tkinter for the local desktop app UI.
- Tkinter Canvas for CPU-only 2D rendering.
- Browser SVG and vanilla JavaScript for the optional browser prototype.
- No GPU, WebGL, map API key, pip package, npm package, or AI image generation is required.

## Files

- `data/continents.geojson`: generated continent geometry data.
- `scripts/build-continents-data.mjs`: repeatable data-preparation script.
- `continent_map_app.py`: local desktop app.
- `launch_continent_map_app.bat`: Windows launcher for the desktop app.
- `index.html`: app entry point.
- `src/app.js`: map rendering and live parameter logic.
- `src/styles.css`: app layout and visual styling.

## Runtime Constraints

The desktop app does not need a web server. No external API is called at runtime.

Run the desktop app with:

```powershell
python continent_map_app.py
```

Or double-click:

```text
launch_continent_map_app.bat
```

The optional browser prototype needs a small local web server because browsers usually block `fetch("data/continents.geojson")` from a direct `file://` page.

## Verification Checklist

- The map uses local generated data after preprocessing.
- Runtime map rendering has no API key or remote service dependency.
- Only seven continent groups are styled live, so the graphics load is small.
- Changing a color control immediately changes that continent's color.
- Moving an opacity slider immediately changes that continent's transparency effect.
- Editing the JSON parameter block applies valid color and opacity changes live.

Tkinter Canvas does not support true per-polygon alpha blending. The app implements the same visual transparency effect by blending each continent color with the ocean background color according to the opacity value.
