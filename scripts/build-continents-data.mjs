import { mkdir, writeFile } from "node:fs/promises";

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

const CONTINENT_ORDER = [
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
];

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`Failed to download Natural Earth data: ${response.status} ${response.statusText}`);
}

const countries = await response.json();
const grouped = new Map(CONTINENT_ORDER.map((name) => [name, []]));

for (const feature of countries.features) {
  const continent = feature.properties?.CONTINENT;

  if (!grouped.has(continent)) {
    continue;
  }

  grouped.get(continent).push(feature.geometry);
}

const continents = {
  type: "FeatureCollection",
  name: "continents_from_natural_earth_110m",
  metadata: {
    source: SOURCE_URL,
    sourceDataset: "Natural Earth ne_110m_admin_0_countries.geojson",
    processing: "Grouped country geometries by the CONTINENT field into one GeometryCollection per continent.",
    generatedAt: new Date().toISOString(),
    note: "Country and city labels are intentionally omitted. Countries are only used as source geometry.",
  },
  features: CONTINENT_ORDER.map((continent) => ({
    type: "Feature",
    id: continent.toLowerCase().replaceAll(" ", "-"),
    properties: {
      name: continent,
      displayName: continent === "Oceania" ? "Australia / Oceania" : continent,
      sourceFeatureCount: grouped.get(continent).length,
    },
    geometry: {
      type: "GeometryCollection",
      geometries: grouped.get(continent),
    },
  })),
};

await mkdir("data", { recursive: true });
await writeFile("data/continents.geojson", `${JSON.stringify(continents)}\n`);

console.log(`Created data/continents.geojson with ${continents.features.length} continent features.`);
for (const feature of continents.features) {
  console.log(`- ${feature.properties.displayName}: ${feature.properties.sourceFeatureCount} source features`);
}
