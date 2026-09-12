from __future__ import annotations

import json
from pathlib import Path
from tkinter import BOTH, END, LEFT, RIGHT, Button, Canvas, Frame, Label, Scale, Text, Tk, colorchooser
from tkinter import HORIZONTAL, StringVar


APP_DIR = Path(__file__).resolve().parent
DATA_PATH = APP_DIR / "data" / "continents.geojson"

MAP_WIDTH = 980
MAP_HEIGHT = 540
PADDING = 28
WATER_COLOR = "#dfeaf0"

DEFAULT_STYLES = {
    "africa": {"color": "#d75f35", "opacity": 0.76},
    "antarctica": {"color": "#f4f1e8", "opacity": 0.62},
    "asia": {"color": "#d9a441", "opacity": 0.78},
    "europe": {"color": "#477db3", "opacity": 0.78},
    "north-america": {"color": "#3f8d6b", "opacity": 0.78},
    "oceania": {"color": "#8b6fc2", "opacity": 0.78},
    "south-america": {"color": "#62a84f", "opacity": 0.78},
}


def load_continents(path: Path = DATA_PATH) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def project(longitude: float, latitude: float) -> tuple[float, float]:
    x = PADDING + ((longitude + 180) / 360) * (MAP_WIDTH - PADDING * 2)
    y = PADDING + ((90 - latitude) / 180) * (MAP_HEIGHT - PADDING * 2)
    return x, y


def walk_rings(geometry: dict):
    geometry_type = geometry["type"]

    if geometry_type == "GeometryCollection":
        for child in geometry["geometries"]:
            yield from walk_rings(child)
    elif geometry_type == "Polygon":
        for ring in geometry["coordinates"]:
            yield ring
    elif geometry_type == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            for ring in polygon:
                yield ring


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    clean = hex_color.removeprefix("#")
    return int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def blend_color(foreground: str, opacity: float, background: str = WATER_COLOR) -> str:
    fg = hex_to_rgb(foreground)
    bg = hex_to_rgb(background)
    clamped = min(1, max(0, opacity))
    blended = tuple(round(fg_part * clamped + bg_part * (1 - clamped)) for fg_part, bg_part in zip(fg, bg))
    return rgb_to_hex(blended)


def validate_styles(styles: dict) -> None:
    for continent_id in DEFAULT_STYLES:
        if continent_id not in styles:
            raise ValueError(f'Missing style for "{continent_id}".')

        color = styles[continent_id].get("color")
        opacity = styles[continent_id].get("opacity")

        if not isinstance(color, str) or len(color) != 7 or not color.startswith("#"):
            raise ValueError(f'"{continent_id}" needs a color like #3f8d6b.')

        int(color[1:], 16)

        if not isinstance(opacity, int | float) or opacity < 0 or opacity > 1:
            raise ValueError(f'"{continent_id}" opacity must be between 0 and 1.')


class ContinentMapApp:
    def __init__(self) -> None:
        self.root = Tk()
        self.root.title("Live Continent Map")
        self.root.geometry("1320x760")
        self.root.minsize(1040, 650)

        self.continent_data = load_continents()
        self.styles = json.loads(json.dumps(DEFAULT_STYLES))
        self.polygon_items: dict[str, list[int]] = {}
        self.opacity_vars: dict[str, StringVar] = {}
        self.color_buttons: dict[str, Button] = {}
        self.json_update_job = None

        self.build_ui()
        self.draw_map()
        self.render_controls()
        self.sync_json_from_styles()

    def build_ui(self) -> None:
        main = Frame(self.root, bg="#f5f3ee")
        main.pack(fill=BOTH, expand=True)

        map_frame = Frame(main, bg="#f5f3ee", padx=24, pady=24)
        map_frame.pack(side=LEFT, fill=BOTH, expand=True)

        self.canvas = Canvas(
            map_frame,
            width=MAP_WIDTH,
            height=MAP_HEIGHT,
            bg=WATER_COLOR,
            highlightbackground="#d7d5ce",
            highlightthickness=1,
        )
        self.canvas.pack(fill=BOTH, expand=True)

        self.controls_frame = Frame(main, width=360, bg="#ffffff", padx=18, pady=18)
        self.controls_frame.pack(side=RIGHT, fill=BOTH)
        self.controls_frame.pack_propagate(False)

        header = Frame(self.controls_frame, bg="#ffffff")
        header.pack(fill="x", pady=(0, 12))

        Label(
            header,
            text="Continent Controls",
            bg="#ffffff",
            fg="#18222b",
            font=("Segoe UI", 14, "bold"),
        ).pack(side=LEFT)

        Button(header, text="Reset", command=self.reset_styles).pack(side=RIGHT)

        self.control_rows = Frame(self.controls_frame, bg="#ffffff")
        self.control_rows.pack(fill="x")

        Label(
            self.controls_frame,
            text="Live parameter JSON",
            bg="#ffffff",
            fg="#65707a",
            anchor="w",
            font=("Segoe UI", 9, "bold"),
        ).pack(fill="x", pady=(14, 4))

        self.json_text = Text(
            self.controls_frame,
            height=16,
            wrap="none",
            bg="#fbfbf8",
            fg="#18222b",
            relief="solid",
            borderwidth=1,
            font=("Consolas", 9),
        )
        self.json_text.pack(fill=BOTH, expand=True)
        self.json_text.bind("<KeyRelease>", self.schedule_json_apply)

        self.status = StringVar(value="JSON is synced with the controls.")
        Label(
            self.controls_frame,
            textvariable=self.status,
            bg="#ffffff",
            fg="#65707a",
            anchor="w",
            wraplength=320,
        ).pack(fill="x", pady=(8, 0))

    def draw_map(self) -> None:
        self.canvas.delete("continent")
        self.polygon_items.clear()

        for feature in self.continent_data["features"]:
            continent_id = feature["id"]
            item_ids = []

            for ring in walk_rings(feature["geometry"]):
                points = []
                for longitude, latitude in ring:
                    x, y = project(longitude, latitude)
                    points.extend([x, y])

                if len(points) >= 6:
                    item_id = self.canvas.create_polygon(points, tags=("continent", continent_id), width=0)
                    item_ids.append(item_id)

            self.polygon_items[continent_id] = item_ids

        self.update_map_styles()

    def render_controls(self) -> None:
        for child in self.control_rows.winfo_children():
            child.destroy()

        for feature in self.continent_data["features"]:
            continent_id = feature["id"]
            display_name = feature["properties"]["displayName"]
            style = self.styles[continent_id]

            row = Frame(self.control_rows, bg="#ffffff", pady=6)
            row.pack(fill="x")

            title = Frame(row, bg="#ffffff")
            title.pack(fill="x")

            Label(title, text=display_name, bg="#ffffff", fg="#18222b", font=("Segoe UI", 9, "bold")).pack(side=LEFT)

            opacity_var = StringVar(value=f"{round(style['opacity'] * 100)}%")
            self.opacity_vars[continent_id] = opacity_var
            Label(title, textvariable=opacity_var, bg="#ffffff", fg="#65707a").pack(side=RIGHT)

            fields = Frame(row, bg="#ffffff")
            fields.pack(fill="x", pady=(4, 0))

            color_button = Button(
                fields,
                text="Color",
                command=lambda selected_id=continent_id: self.pick_color(selected_id),
                bg=style["color"],
                fg=self.readable_text_color(style["color"]),
                width=8,
            )
            color_button.pack(side=LEFT, padx=(0, 8))
            self.color_buttons[continent_id] = color_button

            slider = Scale(
                fields,
                from_=0.05,
                to=1,
                resolution=0.01,
                orient=HORIZONTAL,
                showvalue=False,
                command=lambda value, selected_id=continent_id: self.set_opacity(selected_id, value),
                bg="#ffffff",
                highlightthickness=0,
            )
            slider.set(style["opacity"])
            slider.pack(side=LEFT, fill="x", expand=True)

    def update_map_styles(self) -> None:
        for continent_id, item_ids in self.polygon_items.items():
            style = self.styles[continent_id]
            visual_color = blend_color(style["color"], style["opacity"])

            for item_id in item_ids:
                self.canvas.itemconfig(item_id, fill=visual_color, outline=visual_color)

    def set_opacity(self, continent_id: str, value: str) -> None:
        self.styles[continent_id]["opacity"] = float(value)
        self.opacity_vars[continent_id].set(f"{round(float(value) * 100)}%")
        self.update_map_styles()
        self.sync_json_from_styles()
        self.status.set("JSON is synced with the controls.")

    def pick_color(self, continent_id: str) -> None:
        chosen = colorchooser.askcolor(initialcolor=self.styles[continent_id]["color"], title="Choose continent color")

        if not chosen or not chosen[1]:
            return

        self.styles[continent_id]["color"] = chosen[1]
        button = self.color_buttons[continent_id]
        button.configure(bg=chosen[1], fg=self.readable_text_color(chosen[1]))
        self.update_map_styles()
        self.sync_json_from_styles()
        self.status.set("JSON is synced with the controls.")

    def schedule_json_apply(self, _event=None) -> None:
        if self.json_update_job is not None:
            self.root.after_cancel(self.json_update_job)

        self.json_update_job = self.root.after(220, self.apply_json_styles)

    def apply_json_styles(self) -> None:
        self.json_update_job = None

        try:
            next_styles = json.loads(self.json_text.get("1.0", END))
            validate_styles(next_styles)
        except Exception as error:
            self.status.set(str(error))
            return

        self.styles = next_styles
        self.update_map_styles()
        self.refresh_controls()
        self.status.set("Applied live JSON parameters.")

    def refresh_controls(self) -> None:
        for continent_id, style in self.styles.items():
            self.opacity_vars[continent_id].set(f"{round(style['opacity'] * 100)}%")
            button = self.color_buttons[continent_id]
            button.configure(bg=style["color"], fg=self.readable_text_color(style["color"]))

    def sync_json_from_styles(self) -> None:
        self.json_text.delete("1.0", END)
        self.json_text.insert("1.0", json.dumps(self.styles, indent=2))

    def reset_styles(self) -> None:
        self.styles = json.loads(json.dumps(DEFAULT_STYLES))
        self.render_controls()
        self.update_map_styles()
        self.sync_json_from_styles()
        self.status.set("Reset to the default continent styles.")

    @staticmethod
    def readable_text_color(hex_color: str) -> str:
        red, green, blue = hex_to_rgb(hex_color)
        brightness = (red * 299 + green * 587 + blue * 114) / 1000
        return "#18222b" if brightness > 150 else "#ffffff"

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    ContinentMapApp().run()
