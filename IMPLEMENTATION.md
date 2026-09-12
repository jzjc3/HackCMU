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

Each continent has independently editable color and opacity. The controls and JSON editor update the map live. The app also includes a user-experience input form backed by MongoDB when a MongoDB server or Atlas connection string is available.

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
10. Added a MongoDB persistence layer in `experience_store.py`.
11. Added an experience input form to the desktop app with seven categories matching the seven continent groups.
12. Added safe-save behavior: entries are only considered saved after MongoDB acknowledges the insert.
13. Added startup reload of recent saved experiences from MongoDB so stored inputs persist across app restarts.

## Tools Used

- Natural Earth 110m Admin 0 country GeoJSON for real map geometry.
- Node.js built-in `fetch` and file APIs for data preparation.
- Python standard-library Tkinter for the local desktop app UI.
- Tkinter Canvas for CPU-only 2D rendering.
- MongoDB for persistent user input storage.
- PyMongo for connecting the desktop app to MongoDB.
- Browser SVG and vanilla JavaScript for the optional browser prototype.
- No GPU, WebGL, map API key, npm package, or AI image generation is required.

## Files

- `data/continents.geojson`: generated continent geometry data.
- `scripts/build-continents-data.mjs`: repeatable data-preparation script.
- `continent_map_app.py`: local desktop app.
- `experience_store.py`: MongoDB persistence layer.
- `requirements.txt`: Python dependency list.
- `launch_continent_map_app.bat`: Windows launcher for the desktop app.
- `index.html`: app entry point.
- `src/app.js`: map rendering and live parameter logic.
- `src/styles.css`: app layout and visual styling.

## Runtime Constraints

The desktop app does not need a web server. MongoDB must be available either locally or through a MongoDB Atlas connection string.

Install dependencies with:

```powershell
python -m pip install -r requirements.txt
```

For local MongoDB, the app defaults to:

```text
mongodb://localhost:27017
```

For MongoDB Atlas, set this environment variable before running the app:

```powershell
$env:MONGODB_URI="mongodb+srv://USER:PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority"
```

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
- Saving an experience writes it to MongoDB only when the insert is acknowledged.
- Restarting the app reloads recent saved experiences from MongoDB.

Tkinter Canvas does not support true per-polygon alpha blending. The app implements the same visual transparency effect by blending each continent color with the ocean background color according to the opacity value.

Current local machine note: PyMongo is installed, but `mongod`/`mongosh` are not available on PATH. End-to-end MongoDB persistence needs either a running local MongoDB server or a MongoDB Atlas `MONGODB_URI`.
