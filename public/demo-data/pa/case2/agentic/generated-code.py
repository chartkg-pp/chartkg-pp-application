import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


BASE = Path(__file__).resolve().parent
bundle = json.loads((BASE / "coda-data.json").read_text(encoding="utf-8"))
views = bundle.get("views", [])
palette = ["#1F4E79", "#D95F02", "#1B9E77", "#7570B3", "#E7298A", "#66A61E"]

def _numeric_values(values_map):
    return [value for value in values_map.values() if isinstance(value, (int, float)) and not isinstance(value, bool)]

def _encoded_keys(encodings):
    return [item.get("variable_id") for item in encodings if item.get("variable_id")]

def _encoding_key(encodings, aliases):
    aliases = {str(alias).lower() for alias in aliases}
    for item in encodings:
        attribute = str(item.get("attribute", "")).lower()
        field = item.get("variable_id")
        if field and (attribute in aliases or any(alias in attribute for alias in aliases)):
            return field
    return None

_category_order = []

def _category_color(category):
    if category not in _category_order:
        _category_order.append(category)
    return palette[_category_order.index(category) % len(palette)]

def _draw_radial(ax, records, encodings, hole=False):
    height_key = _encoding_key(encodings, {"height", "radius", "yposition", "y"})
    color_key = _encoding_key(encodings, {"color", "hue", "group"})
    slot_key = _encoding_key(encodings, {"angularposition", "angular", "xposition", "x"})
    segments = []
    for record in records:
        values_map = record.get("values", {})
        height = values_map.get(height_key) if height_key else None
        if not isinstance(height, (int, float)) or isinstance(height, bool):
            height = next(iter(_numeric_values(values_map)), None)
        if not isinstance(height, (int, float)) or isinstance(height, bool):
            continue
        category = values_map.get(color_key) if color_key else None
        category = str(category if category is not None else record.get("mark_id", "record"))
        slot = values_map.get(slot_key) if slot_key else None
        segments.append(("" if slot is None else str(slot), category, max(0.0, float(height))))
    if not segments:
        ax.text(0.5, 0.5, "No radial values", ha="center", va="center", transform=ax.transAxes)
        ax.set_axis_off()
        return 0.0
    for _, category, _ in segments:
        _category_color(category)
    if slot_key:
        slot_labels = list(dict.fromkeys(slot for slot, _, _ in segments))
        slots = [(label, [item for item in segments if item[0] == label]) for label in slot_labels]
    else:
        # No angular variable: one repeating category cycle per slot, only
        # when every cycle is complete; otherwise each record is its own slot.
        cycle = len(_category_order)
        complete = cycle > 1 and len(segments) % cycle == 0 and all(
            {category for _, category, _ in segments[start:start + cycle]} == set(_category_order)
            for start in range(0, len(segments), cycle)
        )
        if complete:
            slots = [
                (f"Slot {index + 1}", segments[start:start + cycle])
                for index, start in enumerate(range(0, len(segments), cycle))
            ]
        else:
            slots = [(f"Slot {index + 1}", [segment]) for index, segment in enumerate(segments)]
    rmax = max(sum(height for _, _, height in slot_segments) for _, slot_segments in slots) or 1.0
    count = max(1, len(slots))
    width = 2 * math.pi / count * 0.78
    for slot_index, (_, slot_segments) in enumerate(slots):
        angle = 2 * math.pi * slot_index / count
        bottom = 0.0
        for _, category, height in sorted(slot_segments, key=lambda item: _category_order.index(item[1])):
            ax.bar(angle, height, width=width, bottom=bottom, color=_category_color(category), edgecolor="white", linewidth=0.4, label=category)
            bottom += height
    ax.set_theta_offset(math.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_xticks([])
    if hole:
        ax.set_rorigin(-rmax * 0.55)
    ticks = [fraction * rmax for fraction in (0.25, 0.5, 0.75, 1.0)]
    ax.set_rgrids(ticks, labels=[f"{value:.0f}" for value in ticks], angle=90, fontsize=7)
    ax.grid(alpha=0.2)
    return rmax

def _draw_ternary(ax, records, encodings, compact=False):
    negative_key = _encoding_key(encodings, {"nposition", "negative"})
    positive_key = _encoding_key(encodings, {"pposition", "positive"})
    uncertainty_key = _encoding_key(encodings, {"uposition", "uncertainty"})
    color_key = _encoding_key(encodings, {"color", "hue", "group"})
    grouped = {}
    for record in records:
        values_map = record.get("values", {})
        derived = record.get("derived", {})
        category = str(values_map.get(color_key, "observations")) if color_key else "observations"
        x = derived.get("ternary_x")
        y = derived.get("ternary_y")
        if not (isinstance(x, (int, float)) and isinstance(y, (int, float)) and not isinstance(x, bool) and not isinstance(y, bool)):
            components = [values_map.get(key) for key in (negative_key, positive_key, uncertainty_key)]
            if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in components):
                continue
            total = float(sum(components))
            if total <= 0:
                continue
            negative, positive, uncertainty = [float(value) / total for value in components]
            x = positive + 0.5 * uncertainty
            y = math.sqrt(3.0) * 0.5 * uncertainty
        _category_color(category)
        grouped.setdefault(category, []).append((float(x), float(y)))
    height = math.sqrt(3.0) * 0.5
    triangle = [(0.0, 0.0), (1.0, 0.0), (0.5, height), (0.0, 0.0)]
    ax.plot([point[0] for point in triangle], [point[1] for point in triangle], color="#3A3A3A", linewidth=1.2, zorder=3)
    for fraction in ((0.25, 0.5, 0.75) if compact else (0.2, 0.4, 0.6, 0.8)):
        ax.plot([0.5 * fraction, 1.0 - 0.5 * fraction], [height * fraction, height * fraction], color="#D9D9D9", linewidth=0.6, zorder=1)
        ax.plot([fraction, fraction + 0.5 * (1.0 - fraction)], [0.0, height * (1.0 - fraction)], color="#D9D9D9", linewidth=0.6, zorder=1)
        ax.plot([0.5 * (1.0 - fraction), 1.0 - fraction], [height * (1.0 - fraction), 0.0], color="#D9D9D9", linewidth=0.6, zorder=1)
    for category, points in grouped.items():
        ax.scatter([point[0] for point in points], [point[1] for point in points], s=24 if compact else 38, alpha=0.85, color=_category_color(category), edgecolor="white", linewidth=0.5, zorder=2)
    label_size = 8 if compact else 9
    ax.text(-0.02, -0.05, str(negative_key or "N"), ha="center", va="top", fontsize=label_size)
    ax.text(1.02, -0.05, str(positive_key or "P"), ha="center", va="top", fontsize=label_size)
    ax.text(0.5, height + 0.03, str(uncertainty_key or "U"), ha="center", va="bottom", fontsize=label_size)
    ax.set_xlim(-0.08, 1.08)
    ax.set_ylim(-0.08, height + 0.08)
    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")

def _draw_flow(ax, records, encodings, color):
    keys = _encoded_keys(encodings)
    source_key = keys[0] if keys else None
    target_key = keys[1] if len(keys) > 1 else None
    value_key = keys[2] if len(keys) > 2 else None
    edges = []
    for record in records:
        values_map = record.get("values", {})
        source = values_map.get(source_key)
        target = values_map.get(target_key)
        numeric = _numeric_values(values_map)
        value = values_map.get(value_key) if value_key else (numeric[0] if numeric else 1)
        if source is not None and target is not None:
            edges.append((str(source), str(target), float(value) if isinstance(value, (int, float)) else 1.0))
    sources = list(dict.fromkeys(edge[0] for edge in edges))
    targets = list(dict.fromkeys(edge[1] for edge in edges))
    for index, label in enumerate(sources):
        y = 1.0 - (index + 1) / (len(sources) + 1)
        ax.add_patch(FancyBboxPatch((-0.16, y - 0.025), 0.25, 0.05, boxstyle="round,pad=0.01", facecolor=color, alpha=0.85))
        ax.text(-0.035, y, label, ha="center", va="center", fontsize=8, color="white", clip_on=False)
    for index, label in enumerate(targets):
        y = 1.0 - (index + 1) / (len(targets) + 1)
        ax.add_patch(FancyBboxPatch((0.91, y - 0.025), 0.25, 0.05, boxstyle="round,pad=0.01", facecolor="#444444", alpha=0.85))
        ax.text(1.035, y, label, ha="center", va="center", fontsize=8, color="white", clip_on=False)
    source_y = {label: 1.0 - (index + 1) / (len(sources) + 1) for index, label in enumerate(sources)}
    target_y = {label: 1.0 - (index + 1) / (len(targets) + 1) for index, label in enumerate(targets)}
    max_value = max([edge[2] for edge in edges] or [1.0])
    for source, target, value in edges:
        ax.add_patch(FancyArrowPatch((0.11, source_y[source]), (0.91, target_y[target]), arrowstyle="-|>", mutation_scale=9, linewidth=0.8 + 3.0 * value / max_value, color=color, alpha=0.35, connectionstyle="arc3,rad=0.08"))
    ax.set_xlim(-0.2, 1.2)
    ax.set_ylim(0, 1)
    ax.axis("off")

def _draw_network(ax, records, encodings, color):
    keys = _encoded_keys(encodings)
    source_key = keys[0] if keys else None
    target_key = keys[1] if len(keys) > 1 else None
    edges = []
    for record in records:
        values_map = record.get("values", {})
        source = values_map.get(source_key)
        target = values_map.get(target_key)
        if source is not None and target is not None:
            edges.append((str(source), str(target)))
    nodes = list(dict.fromkeys([item for edge in edges for item in edge]))
    positions = {}
    for index, node in enumerate(nodes):
        angle = 2 * math.pi * index / max(1, len(nodes))
        positions[node] = (0.5 + 0.38 * math.cos(angle), 0.5 + 0.38 * math.sin(angle))
    for source, target in edges:
        ax.add_patch(FancyArrowPatch(positions[source], positions[target], arrowstyle="-|>", mutation_scale=8, linewidth=1.0, color=color, alpha=0.45, connectionstyle="arc3,rad=0.12"))
    for node, position in positions.items():
        ax.scatter([position[0]], [position[1]], s=220, color=color, edgecolor="white", linewidth=1.0, zorder=3)
        ax.text(position[0], position[1], node, ha="center", va="center", fontsize=7, color="white", zorder=4)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

def _draw_heatmap(ax, records, encodings, color):
    rows = [_numeric_values(record.get("values", {})) for record in records]
    width = max([len(row) for row in rows] or [1])
    matrix = [row + [0.0] * (width - len(row)) for row in rows] or [[0.0]]
    image = ax.imshow(matrix, aspect="auto", cmap="viridis")
    ax.figure.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    ax.set_xlabel("Numeric dimensions")
    ax.set_ylabel("Records")

def _draw_pie(ax, records, encodings, color):
    keys = _encoded_keys(encodings)
    labels, values = [], []
    for index, record in enumerate(records):
        values_map = record.get("values", {})
        label = values_map.get(keys[0]) if keys else record.get("mark_id", index + 1)
        numeric = _numeric_values(values_map)
        value = values_map.get(keys[1]) if len(keys) > 1 else (numeric[0] if numeric else 0)
        if isinstance(value, (int, float)) and value >= 0:
            labels.append(str(label))
            values.append(float(value))
    if values and sum(values) > 0:
        ax.pie(values, labels=labels if len(labels) <= 10 else None, autopct="%1.0f%%" if len(labels) <= 10 else None, colors=palette[:len(values)])

def _draw_parallel(ax, records, encodings, color):
    dimensions = list(dict.fromkeys(item.get("variable_id") for item in encodings if item.get("variable_id")))
    if not dimensions:
        dimensions = list(dict.fromkeys(key for record in records for key, value in record.get("values", {}).items() if isinstance(value, (int, float))))
    values = []
    for record in records:
        row = [record.get("values", {}).get(key) for key in dimensions]
        if all(isinstance(value, (int, float)) for value in row):
            values.append(row)
    if values:
        mins = [min(row[index] for row in values) for index in range(len(dimensions))]
        spans = [max(1e-9, max(row[index] for row in values) - mins[index]) for index in range(len(dimensions))]
        for row in values[:120]:
            ax.plot(range(len(dimensions)), [(value - mins[index]) / spans[index] for index, value in enumerate(row)], color=color, alpha=0.18)
        ax.set_xticks(range(len(dimensions)))
        ax.set_xticklabels(dimensions, rotation=35, ha="right", fontsize=8)
        ax.set_ylim(0, 1)

def _draw_radar(ax, records, encodings, color):
    dimensions = list(dict.fromkeys(item.get("variable_id") for item in encodings if item.get("variable_id")))
    if not dimensions:
        dimensions = list(dict.fromkeys(key for record in records for key, value in record.get("values", {}).items() if isinstance(value, (int, float))))
    rows = []
    for record in records[:12]:
        row = [record.get("values", {}).get(key) for key in dimensions]
        if all(isinstance(value, (int, float)) for value in row):
            rows.append(row)
    if not rows or not dimensions:
        return
    mins = [min(row[index] for row in rows) for index in range(len(dimensions))]
    spans = [max(1e-9, max(row[index] for row in rows) - mins[index]) for index in range(len(dimensions))]
    angles = [2 * math.pi * index / len(dimensions) for index in range(len(dimensions))]
    angles.append(angles[0])
    for row in rows:
        values = [(value - mins[index]) / spans[index] for index, value in enumerate(row)]
        values.append(values[0])
        points = [(0.5 + 0.38 * value * math.cos(angle), 0.5 + 0.38 * value * math.sin(angle)) for value, angle in zip(values, angles)]
        ax.plot([point[0] for point in points], [point[1] for point in points], color=color, alpha=0.65)
    for index, dimension in enumerate(dimensions):
        x = 0.5 + 0.45 * math.cos(angles[index])
        y = 0.5 + 0.45 * math.sin(angles[index])
        ax.text(x, y, str(dimension), ha="center", va="center", fontsize=8)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

composition = bundle.get("composition", [])
composition_text = composition.lower() if isinstance(composition, str) else json.dumps(composition, ensure_ascii=False).lower()
chart_types_lower = [str(view.get("chart_type", "")).lower() for view in views]
radial_view = next((view for view in views if "radial" in str(view.get("chart_type", "")).lower()), None)
ternary_view = next((view for view in views if "ternary" in str(view.get("chart_type", "")).lower()), None)
overlay_mode = (
    ("overlay" in composition_text or "coaxis" in composition_text)
    and radial_view is not None
    and ternary_view is not None
)
chart_title = str((bundle.get("chart", {}).get("properties", {}) or {}).get("title") or "Knowledge-graph visualization")

def _first_group(view):
    groups = [group for group in view.get("groups", []) if group.get("records")]
    return groups[0] if groups else {"records": [], "encodings": []}

def _humanize(text):
    return str(text).replace("_", " ").strip().title()

if overlay_mode:
    fig = plt.figure(figsize=(13.5, 10.5))
    fig.patch.set_facecolor("white")
    ax = fig.add_subplot(111, projection="polar")
    radial_group = _first_group(radial_view)
    _draw_radial(ax, radial_group.get("records", []), radial_group.get("encodings", []), hole=True)
else:
    view_count = max(1, len(views))
    columns = 1 if view_count <= 2 else 2
    rows = max(1, math.ceil(view_count / columns))
    max_records = max([len(group.get("records", [])) for view in views for group in view.get("groups", [])] or [0])
    fig_width = max(12, 6.5 * columns, min(22, 12 + max(0, max_records - 16) * 0.08))
    fig_height = max(7, 5.5 * rows)
    fig = plt.figure(figsize=(fig_width, fig_height))
    axes = [[None for _ in range(columns)] for _ in range(rows)]
    for subplot_index in range(rows * columns):
        row_index = subplot_index // columns
        column_index = subplot_index % columns
        view_hint = str(views[subplot_index].get("chart_type", "")) if subplot_index < len(views) else ""
        projection = "polar" if "radial" in view_hint.lower() else None
        axes[row_index][column_index] = fig.add_subplot(rows, columns, subplot_index + 1, projection=projection)
    fig.patch.set_facecolor("white")

for view_index, view in enumerate([] if overlay_mode else (views or [{"id": "view", "chart_type": "bar", "groups": []}])):
    ax = axes[view_index // columns][view_index % columns]
    chart_type = str(view.get("chart_type", "bar")).lower()
    groups = view.get("groups", [])
    drawn = False
    for group_index, group in enumerate(groups):
        records = group.get("records", [])
        name = str(group.get("id", f"group-{group_index + 1}"))
        encodings = group.get("encodings", [])
        x_encoding = next((item for item in encodings if str(item.get("attribute", "")).lower() in {"xposition", "x"}), None)
        y_encoding = next((item for item in encodings if str(item.get("attribute", "")).lower() in {"yposition", "y"}), None)
        x_key = x_encoding.get("variable_id") if x_encoding else None
        y_key = y_encoding.get("variable_id") if y_encoding else None
        x_label = x_encoding.get("field") if x_encoding else "category"
        y_label = y_encoding.get("field") if y_encoding else "value"
        special_type = next((item for item in ("radial", "ternary", "sankey", "flow", "alluvial", "network", "graph", "chord", "heatmap", "matrix", "pie", "donut", "radar", "spider", "parallel", "coordinate") if item in chart_type), None)
        if special_type == "radial":
            _draw_radial(ax, records, encodings)
            drawn = True
            continue
        if special_type == "ternary":
            _draw_ternary(ax, records, encodings)
            drawn = True
            continue
        if special_type in {"sankey", "flow", "alluvial"}:
            _draw_flow(ax, records, encodings, palette[group_index % len(palette)])
            drawn = True
            continue
        if special_type in {"network", "graph", "chord"}:
            _draw_network(ax, records, encodings, palette[group_index % len(palette)])
            drawn = True
            continue
        if special_type in {"heatmap", "matrix"}:
            _draw_heatmap(ax, records, encodings, palette[group_index % len(palette)])
            drawn = True
            continue
        if special_type in {"pie", "donut"}:
            _draw_pie(ax, records, encodings, palette[group_index % len(palette)])
            drawn = True
            continue
        if special_type in {"parallel", "coordinate"}:
            _draw_parallel(ax, records, encodings, palette[group_index % len(palette)])
            drawn = True
            continue
        if special_type in {"radar", "spider"}:
            _draw_radar(ax, records, encodings, palette[group_index % len(palette)])
            drawn = True
            continue
        labels, values = [], []
        points = []
        for record_index, record in enumerate(records):
            values_map = record.get("values", {})
            label = str(record.get("mark_id", record_index + 1))
            derived = record.get("derived", {})
            if "ternary" in chart_type and isinstance(derived.get("ternary_x"), (int, float)) and isinstance(derived.get("ternary_y"), (int, float)):
                points.append((derived["ternary_x"], derived["ternary_y"], label))
            elif "scatter" in chart_type or "point" in chart_type or "bubble" in chart_type:
                x_value = values_map.get(x_key) if x_key else None
                y_value = values_map.get(y_key) if y_key else None
                numeric = [value for value in values_map.values() if isinstance(value, (int, float)) and not isinstance(value, bool)]
                if not isinstance(x_value, (int, float)) and numeric:
                    x_value = numeric[0]
                if not isinstance(y_value, (int, float)) and len(numeric) > 1:
                    y_value = numeric[1]
                if isinstance(x_value, (int, float)) and isinstance(y_value, (int, float)):
                    points.append((x_value, y_value, label))
            else:
                value = values_map.get(y_key) if y_key else None
                if not isinstance(value, (int, float)):
                    value = next((item for item in values_map.values() if isinstance(item, (int, float)) and not isinstance(item, bool)), None)
                category = values_map.get(x_key) if x_key else label
                if value is not None:
                    labels.append(str(category))
                    values.append(value)
        color = palette[group_index % len(palette)]
        if points:
            ax.scatter([point[0] for point in points], [point[1] for point in points], s=48, alpha=0.85, color=color, label=name)
            ax.set_xlabel(str(x_label))
            ax.set_ylabel(str(y_label))
            drawn = True
        elif values:
            positions = list(range(len(values)))
            if "line" in chart_type:
                ax.plot(positions, values, marker="o", linewidth=2, color=color, label=name)
            else:
                ax.bar([position + group_index * 0.75 / max(1, len(groups)) for position in positions], values, width=0.7 / max(1, len(groups)), color=color, label=name)
            ax.set_xlabel(str(x_label))
            ax.set_ylabel(str(y_label))
            ax.set_xticks(positions)
            if len(labels) <= 18:
                ax.set_xticklabels(labels, rotation=35, ha="right", fontsize=8)
            else:
                step = max(1, math.ceil(len(labels) / 18))
                ax.set_xticks(positions[::step])
                ax.set_xticklabels(labels[::step], rotation=35, ha="right", fontsize=8)
            drawn = True
    ax.set_title(_humanize(view.get("chart_type") or view.get("id", "Chart")), fontsize=13, pad=12)
    if "radial" not in chart_type and "ternary" not in chart_type:
        ax.grid(axis="y", alpha=0.2)
    ax.set_axisbelow(True)
    if drawn and groups and "radial" not in chart_type and "ternary" not in chart_type:
        ax.legend(loc="best", frameon=False)

if not overlay_mode:
    for unused_index in range(view_count, rows * columns):
        axes[unused_index // columns][unused_index % columns].set_visible(False)

handles = [plt.Rectangle((0, 0), 1, 1, color=palette[index % len(palette)]) for index in range(len(_category_order))]
if handles:
    fig.legend(handles, _category_order, loc="upper left", frameon=False, fontsize=10)
fig.suptitle(chart_title, fontsize=17, fontweight="bold")
fig.tight_layout(rect=(0.02, 0.02, 0.98, 0.94), h_pad=2.0, w_pad=2.0)
if overlay_mode:
    polar_bbox = ax.get_position()
    inset_size = 0.9 * (0.55 / 1.55) * min(polar_bbox.width, polar_bbox.height)
    center_x = polar_bbox.x0 + polar_bbox.width / 2.0
    center_y = polar_bbox.y0 + polar_bbox.height / 2.0
    ternary_ax = fig.add_axes([center_x - inset_size / 2.0, center_y - inset_size / 2.0, inset_size, inset_size])
    ternary_group = _first_group(ternary_view)
    _draw_ternary(ternary_ax, ternary_group.get("records", []), ternary_group.get("encodings", []), compact=True)

total_records = sum(
    len(group.get("records", []))
    for view in views
    for group in view.get("groups", [])
)
print(f"RECORDS_USED={total_records}")
fig.savefig(BASE / "result.png", dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
