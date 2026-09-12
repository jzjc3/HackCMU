const width = 980;
const height = 540;
const padding = 28;

const defaultStyles = {
  africa: { color: "#d75f35", opacity: 0.76 },
  antarctica: { color: "#f4f1e8", opacity: 0.62 },
  asia: { color: "#d9a441", opacity: 0.78 },
  europe: { color: "#477db3", opacity: 0.78 },
  "north-america": { color: "#3f8d6b", opacity: 0.78 },
  oceania: { color: "#8b6fc2", opacity: 0.78 },
  "south-america": { color: "#62a84f", opacity: 0.78 },
};

const svg = document.querySelector("#continent-map");
const controls = document.querySelector("#continent-controls");
const jsonEditor = document.querySelector("#style-json");
const jsonStatus = document.querySelector("#json-status");
const resetButton = document.querySelector("#reset-controls");

let continentData;
let currentStyles = structuredClone(defaultStyles);
let pathElements = new Map();

svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

init();

async function init() {
  const response = await fetch("data/continents.geojson");

  if (!response.ok) {
    throw new Error(`Could not load continent map data: ${response.status}`);
  }

  continentData = await response.json();
  renderMap();
  renderControls();
  syncJsonFromState();
}

function renderMap() {
  const mapLayer = createSvgElement("g", { class: "map-layer" });
  svg.append(mapLayer);

  for (const feature of continentData.features) {
    const path = createSvgElement("path", {
      id: `continent-${feature.id}`,
      class: "continent",
      d: featureToPath(feature),
      tabindex: "0",
      "aria-label": feature.properties.displayName,
    });

    pathElements.set(feature.id, path);
    mapLayer.append(path);
  }

  updateMapStyles();
}

function renderControls() {
  controls.innerHTML = "";

  for (const feature of continentData.features) {
    const style = currentStyles[feature.id];
    const row = document.createElement("section");
    row.className = "control-row";
    row.innerHTML = `
      <div class="control-title">
        <span>${feature.properties.displayName}</span>
        <output id="${feature.id}-opacity-output">${Math.round(style.opacity * 100)}%</output>
      </div>
      <div class="control-fields">
        <label>
          <span>Color</span>
          <input type="color" data-continent="${feature.id}" data-field="color" value="${style.color}" />
        </label>
        <label>
          <span>Opacity</span>
          <input type="range" data-continent="${feature.id}" data-field="opacity" min="0.05" max="1" step="0.01" value="${style.opacity}" />
        </label>
      </div>
    `;
    controls.append(row);
  }

  controls.addEventListener("input", handleControlInput);
  jsonEditor.addEventListener("input", handleJsonInput);
  resetButton.addEventListener("click", () => {
    currentStyles = structuredClone(defaultStyles);
    renderControls();
    updateMapStyles();
    syncJsonFromState();
    jsonStatus.textContent = "Reset to the default continent styles.";
  });
}

function handleControlInput(event) {
  const input = event.target;
  const continent = input.dataset.continent;
  const field = input.dataset.field;

  if (!continent || !field) {
    return;
  }

  currentStyles[continent][field] = field === "opacity" ? Number(input.value) : input.value;

  if (field === "opacity") {
    document.querySelector(`#${continent}-opacity-output`).textContent = `${Math.round(Number(input.value) * 100)}%`;
  }

  updateMapStyles();
  syncJsonFromState();
  jsonStatus.textContent = "JSON is synced with the controls.";
}

function handleJsonInput() {
  try {
    const nextStyles = JSON.parse(jsonEditor.value);
    validateStyles(nextStyles);
    currentStyles = nextStyles;
    updateMapStyles();
    refreshControlValues();
    jsonStatus.textContent = "Applied live JSON parameters.";
    jsonStatus.classList.remove("error");
  } catch (error) {
    jsonStatus.textContent = error.message;
    jsonStatus.classList.add("error");
  }
}

function validateStyles(styles) {
  for (const id of Object.keys(defaultStyles)) {
    if (!styles[id]) {
      throw new Error(`Missing style for "${id}".`);
    }

    if (!/^#[0-9a-f]{6}$/i.test(styles[id].color)) {
      throw new Error(`"${id}" needs a hex color like #3f8d6b.`);
    }

    const opacity = Number(styles[id].opacity);
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new Error(`"${id}" opacity must be between 0 and 1.`);
    }
  }
}

function updateMapStyles() {
  for (const [id, path] of pathElements) {
    const style = currentStyles[id];
    path.style.fill = style.color;
    path.style.opacity = style.opacity;
  }
}

function refreshControlValues() {
  for (const [id, style] of Object.entries(currentStyles)) {
    const colorInput = document.querySelector(`[data-continent="${id}"][data-field="color"]`);
    const opacityInput = document.querySelector(`[data-continent="${id}"][data-field="opacity"]`);
    const output = document.querySelector(`#${id}-opacity-output`);

    colorInput.value = style.color;
    opacityInput.value = style.opacity;
    output.textContent = `${Math.round(style.opacity * 100)}%`;
  }
}

function syncJsonFromState() {
  jsonEditor.value = JSON.stringify(currentStyles, null, 2);
  jsonStatus.classList.remove("error");
}

function featureToPath(feature) {
  const commands = [];
  walkGeometry(feature.geometry, (ring) => {
    ring.forEach(([longitude, latitude], index) => {
      const [x, y] = project(longitude, latitude);
      commands.push(`${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
    });
    commands.push("Z");
  });
  return commands.join(" ");
}

function walkGeometry(geometry, onRing) {
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((child) => walkGeometry(child, onRing));
  }

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(onRing);
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach(onRing));
  }
}

function project(longitude, latitude) {
  const x = padding + ((longitude + 180) / 360) * (width - padding * 2);
  const y = padding + ((90 - latitude) / 180) * (height - padding * 2);
  return [x, y];
}

function createSvgElement(tagName, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  return element;
}
