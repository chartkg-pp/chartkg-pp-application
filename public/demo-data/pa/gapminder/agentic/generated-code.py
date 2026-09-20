from pathlib import Path
import json
import math

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
import numpy as np


BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR / "coda-data.json"
OUTPUT_PATH = BASE_DIR / "result.png"

FIELD_KEYS = {
    "country_code": "variable_country_code",
    "country_name": "variable_country_name",
    "income_level": "variable_income_level",
    "income_per_person_ppp_usd": "variable_income_per_person_ppp_usd",
    "life_expectancy_years": "variable_life_expectancy_years",
    "population": "variable_population",
    "region": "variable_region",
    "year": "variable_year",
}

TITLE = "Gapminder_world_health_chart_2025"
SUBTITLE = (
    "Country-level life expectancy in 2025; color indicates region and marker "
    "shape indicates income level.\n"
    "Countries are ordered by life expectancy, then country name."
)
REGION_COLORS = {
    "africa": "#0072B2",
    "americas": "#D55E00",
    "asia": "#009E73",
    "europe": "#CC79A7",
}
INCOME_MARKERS = {
    "Level 1": "o",
    "Level 2": "s",
    "Level 3": "^",
    "Level 4": "D",
}
FALLBACK_COLORS = [
    "#56B4E9", "#E69F00", "#F0E442", "#332288",
    "#88CCEE", "#44AA99", "#AA4499", "#999933",
]
FALLBACK_MARKERS = ["o", "s", "^", "D", "v", "P", "X", "<", ">"]


def load_payload(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return {}


def collect_records(payload):
    records = []
    count = 0
    views = payload.get("views", [])
    if not isinstance(views, list):
        return records, count

    for view in views:
        if not isinstance(view, dict):
            continue
        groups = view.get("groups", [])
        if not isinstance(groups, list):
            continue

        for group in groups:
            if not isinstance(group, dict):
                continue
            group_records = group.get("records", [])
            if not isinstance(group_records, list):
                continue

            count += len(group_records)
            for record in group_records:
                if isinstance(record, dict):
                    records.append(record)

    return records, count


def finite_number(value):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def usable_rows(records):
    rows = []
    required = list(FIELD_KEYS.values())

    for record in records:
        values = record.get("values", {})
        if not isinstance(values, dict):
            continue
        if any(key not in values or values[key] is None for key in required):
            continue

        country_code = values[FIELD_KEYS["country_code"]]
        country_name = values[FIELD_KEYS["country_name"]]
        income_level = values[FIELD_KEYS["income_level"]]
        region = values[FIELD_KEYS["region"]]
        life = finite_number(values[FIELD_KEYS["life_expectancy_years"]])
        income = finite_number(values[FIELD_KEYS["income_per_person_ppp_usd"]])
        population = finite_number(values[FIELD_KEYS["population"]])
        year = finite_number(values[FIELD_KEYS["year"]])

        if (
            life is None
            or income is None
            or population is None
            or year is None
            or country_code == ""
            or country_name == ""
            or income_level == ""
            or region == ""
        ):
            continue

        rows.append({
            "mark_id": record.get("mark_id"),
            "country_code": str(country_code),
            "country_name": str(country_name),
            "income_level": str(income_level),
            "income_per_person_ppp_usd": income,
            "life_expectancy_years": life,
            "population": population,
            "region": str(region),
            "year": year,
        })

    return rows


def compact_number(value):
    absolute = abs(value)
    if absolute >= 1_000_000_000:
        return f"{value / 1_000_000_000:.2g}B"
    if absolute >= 1_000_000:
        return f"{value / 1_000_000:.2g}M"
    if absolute >= 1_000:
        return f"{value / 1_000:.2g}K"
    return f"{value:,.0f}"


def population_sizes(populations):
    transformed = np.sqrt(np.maximum(np.asarray(populations, dtype=float), 0.0))
    low = float(np.min(transformed))
    high = float(np.max(transformed))

    if high <= low:
        return np.full(len(transformed), 62.0)

    return 20.0 + 160.0 * (transformed - low) / (high - low)


def size_for_population(value, population_min, population_max):
    low = math.sqrt(max(population_min, 0.0))
    high = math.sqrt(max(population_max, 0.0))
    current = math.sqrt(max(value, 0.0))

    if high <= low:
        return 62.0

    return 20.0 + 160.0 * (current - low) / (high - low)


def marker_handle(ax, marker, facecolor, markersize, label):
    handle, = ax.plot(
        [],
        [],
        marker=marker,
        linestyle="None",
        markerfacecolor=facecolor,
        markeredgecolor="white",
        markeredgewidth=0.5,
        markersize=markersize,
        label=label,
    )
    return handle


def add_legend(legend_ax, handles, title, location="center left", columns=1):
    if not handles:
        return None

    legend = legend_ax.legend(
        handles=handles,
        title=title,
        loc=location,
        ncol=max(1, columns),
        frameon=False,
        fontsize=8,
        title_fontsize=8.5,
        handletextpad=0.45,
        columnspacing=1.0,
        borderaxespad=0.0,
    )
    legend.get_title().set_fontweight("bold")
    return legend


def create_empty_figure():
    fig = plt.figure(figsize=(10, 5.2), facecolor="white")
    layout = fig.add_gridspec(
        2,
        1,
        left=0.08,
        right=0.96,
        bottom=0.10,
        top=0.95,
        height_ratios=[1.0, 4.0],
        hspace=0.12,
    )

    header_ax = fig.add_subplot(layout[0])
    header_ax.axis("off")
    header_ax.text(
        0.0,
        1.0,
        TITLE,
        ha="left",
        va="top",
        fontsize=16,
        fontweight="bold",
        color="#222222",
        transform=header_ax.transAxes,
    )
    header_ax.text(
        0.0,
        0.48,
        "Country-level life expectancy in 2025",
        ha="left",
        va="top",
        fontsize=9.5,
        color="#555555",
        transform=header_ax.transAxes,
    )

    ax = fig.add_subplot(layout[1])
    ax.axis("off")
    ax.text(
        0.5,
        0.52,
        "No usable records available",
        ha="center",
        va="center",
        fontsize=11,
        color="#666666",
        transform=ax.transAxes,
    )

    return fig


def create_chart(rows):
    rows.sort(key=lambda row: (
        row["life_expectancy_years"],
        row["country_name"].casefold(),
        row["country_code"].casefold(),
    ))

    count = len(rows)
    names = [row["country_name"] for row in rows]
    longest_name = max(len(name) for name in names)

    figure_width = min(18.0, max(15.0, 14.0 + max(0, longest_name - 28) * 0.045))
    left = min(0.34, max(0.20, (0.75 + longest_name * 0.052) / figure_width))
    right = 0.975

    body_height = max(7.8, 0.115 * count)
    header_height = 1.55
    footer_height = 0.55
    height = body_height + header_height + footer_height

    fig = plt.figure(figsize=(figure_width, height), facecolor="white")
    outer = fig.add_gridspec(
        3,
        1,
        left=left,
        right=right,
        bottom=0.025,
        top=0.985,
        height_ratios=[header_height, body_height, footer_height],
        hspace=0.08,
    )

    header_grid = outer[0].subgridspec(
        2,
        1,
        height_ratios=[0.85, 0.70],
        hspace=0.02,
    )
    title_ax = fig.add_subplot(header_grid[0])
    title_ax.axis("off")
    title_ax.text(
        0.0,
        1.0,
        TITLE,
        ha="left",
        va="top",
        fontsize=16,
        fontweight="bold",
        color="#222222",
        transform=title_ax.transAxes,
    )
    title_ax.text(
        0.0,
        0.48,
        SUBTITLE,
        ha="left",
        va="top",
        fontsize=9.5,
        linespacing=1.25,
        color="#555555",
        transform=title_ax.transAxes,
    )

    legend_grid = header_grid[1].subgridspec(
        1,
        3,
        width_ratios=[1.15, 1.0, 1.15],
        wspace=0.10,
    )
    region_legend_ax = fig.add_subplot(legend_grid[0, 0])
    income_legend_ax = fig.add_subplot(legend_grid[0, 1])
    population_legend_ax = fig.add_subplot(legend_grid[0, 2])
    for legend_ax in (
        region_legend_ax,
        income_legend_ax,
        population_legend_ax,
    ):
        legend_ax.axis("off")

    plot_grid = outer[1].subgridspec(
        1,
        3,
        width_ratios=[8.7, 2.05, 1.75],
        wspace=0.035,
    )
    ax = fig.add_subplot(plot_grid[0, 0])
    ax_income = fig.add_subplot(plot_grid[0, 1], sharey=ax)
    ax_population = fig.add_subplot(plot_grid[0, 2], sharey=ax)

    footer_ax = fig.add_subplot(outer[2])
    footer_ax.axis("off")
    footer_ax.text(
        0.0,
        0.15,
        "Each mark represents one country. Region and income level provide "
        "grouping context; income per person and population are contextual "
        "attributes, not causal explanations.",
        ha="left",
        va="bottom",
        fontsize=8,
        color="#666666",
        wrap=True,
        transform=footer_ax.transAxes,
    )

    y_positions = np.arange(count, dtype=float)
    life_values = np.array(
        [row["life_expectancy_years"] for row in rows],
        dtype=float,
    )
    populations = np.array(
        [row["population"] for row in rows],
        dtype=float,
    )
    point_sizes = population_sizes(populations)

    regions = sorted(
        {row["region"] for row in rows},
        key=str.casefold,
    )
    income_levels = sorted(
        {row["income_level"] for row in rows},
        key=str.casefold,
    )

    region_color_map = dict(REGION_COLORS)
    unknown_regions = [
        region for region in regions
        if region not in region_color_map
    ]
    for index, region in enumerate(unknown_regions):
        region_color_map[region] = (
            FALLBACK_COLORS[index % len(FALLBACK_COLORS)]
        )

    income_marker_map = dict(INCOME_MARKERS)
    unknown_income_levels = [
        level for level in income_levels
        if level not in income_marker_map
    ]
    for index, level in enumerate(unknown_income_levels):
        income_marker_map[level] = (
            FALLBACK_MARKERS[index % len(FALLBACK_MARKERS)]
        )

    data_min = float(np.min(life_values))
    data_max = float(np.max(life_values))
    lower = math.floor((data_min - 1.0) / 5.0) * 5.0
    upper = math.ceil((data_max + 1.0) / 5.0) * 5.0

    if upper <= lower:
        lower = data_min - 1.0
        upper = data_max + 1.0

    stem_origin = lower

    for row_index in range(count):
        if row_index % 2 == 0:
            for current_ax in (ax, ax_income, ax_population):
                current_ax.axhspan(
                    row_index - 0.5,
                    row_index + 0.5,
                    color="#F7F7F7",
                    linewidth=0,
                    zorder=0,
                )

    ax.hlines(
        y_positions,
        stem_origin,
        life_values,
        color="#B8B8B8",
        linewidth=0.7,
        alpha=0.8,
        zorder=1,
    )

    for income_level in income_levels:
        indices = [
            index
            for index, row in enumerate(rows)
            if row["income_level"] == income_level
        ]
        if not indices:
            continue

        ax.scatter(
            life_values[indices],
            y_positions[indices],
            s=point_sizes[indices],
            c=[
                region_color_map[rows[index]["region"]]
                for index in indices
            ],
            marker=income_marker_map[income_level],
            edgecolors="#FFFFFF",
            linewidths=0.5,
            alpha=0.95,
            zorder=3,
            clip_on=True,
        )

    label_fontsize = max(5.5, 6.5 - max(0, longest_name - 45) * 0.025)

    ax.set_xlim(lower, upper)
    ax.set_ylim(-1.0, count)
    ax.set_yticks(y_positions)
    ax.set_yticklabels(names, fontsize=label_fontsize, color="#222222")
    ax.tick_params(axis="y", which="major", length=0, pad=5)
    ax.tick_params(
        axis="x",
        which="major",
        direction="out",
        length=3,
        labelsize=8,
        colors="#4D4D4D",
    )
    ax.xaxis.set_major_locator(MaxNLocator(nbins=9, integer=True))
    ax.set_xlabel(
        "Life expectancy (years)",
        fontsize=10,
        fontweight="bold",
        color="#222222",
        labelpad=8,
    )
    ax.set_ylabel(
        "Country",
        fontsize=10,
        fontweight="bold",
        color="#222222",
        labelpad=12,
    )
    ax.xaxis.grid(
        True,
        which="major",
        color="#D9D9D9",
        linewidth=0.7,
    )
    ax.yaxis.grid(False)
    ax.set_axisbelow(True)

    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color("#4D4D4D")
    ax.spines["bottom"].set_linewidth(0.8)

    for context_ax in (ax_income, ax_population):
        context_ax.set_xlim(0, 1)
        context_ax.set_ylim(-1.0, count)
        context_ax.set_xticks([])
        context_ax.tick_params(
            axis="y",
            left=False,
            right=False,
            labelleft=False,
            labelright=False,
        )
        for spine in context_ax.spines.values():
            spine.set_visible(False)

    ax_income.set_title(
        "Income/person\nPPP USD",
        fontsize=8.5,
        fontweight="bold",
        color="#444444",
        loc="right",
        pad=7,
    )
    ax_population.set_title(
        "Population",
        fontsize=8.5,
        fontweight="bold",
        color="#444444",
        loc="right",
        pad=7,
    )

    income_transform = ax_income.get_yaxis_transform()
    population_transform = ax_population.get_yaxis_transform()

    for index, row in enumerate(rows):
        ax_income.text(
            0.97,
            index,
            f"${row['income_per_person_ppp_usd']:,.2f}",
            ha="right",
            va="center",
            fontsize=6.5,
            color="#555555",
            clip_on=True,
            transform=income_transform,
        )
        ax_population.text(
            0.97,
            index,
            f"{row['population']:,.0f}",
            ha="right",
            va="center",
            fontsize=6.5,
            color="#555555",
            clip_on=True,
            transform=population_transform,
        )

    if len(regions) > 1:
        region_handles = [
            marker_handle(
                ax,
                marker="o",
                facecolor=region_color_map[region],
                markersize=6.5,
                label=region,
            )
            for region in regions
        ]
        add_legend(
            region_legend_ax,
            region_handles,
            "Region",
            location="center left",
            columns=min(4, len(region_handles)),
        )

    if len(income_levels) > 1:
        income_handles = [
            marker_handle(
                ax,
                marker=income_marker_map[level],
                facecolor="#666666",
                markersize=6.5,
                label=level,
            )
            for level in income_levels
        ]
        add_legend(
            income_legend_ax,
            income_handles,
            "Income level",
            location="center",
            columns=min(4, len(income_handles)),
        )

    population_min = float(np.min(populations))
    population_max = float(np.max(populations))

    if population_max > population_min:
        sorted_populations = sorted(float(value) for value in populations)
        candidates = [
            sorted_populations[0],
            sorted_populations[len(sorted_populations) // 2],
            sorted_populations[-1],
        ]

        population_examples = []
        for candidate in candidates:
            if candidate not in population_examples:
                population_examples.append(candidate)

        population_handles = []
        for value in population_examples:
            area = size_for_population(
                value,
                population_min,
                population_max,
            )
            population_handles.append(
                marker_handle(
                    ax,
                    marker="o",
                    facecolor="#777777",
                    markersize=max(3.0, math.sqrt(area)),
                    label=compact_number(value),
                )
            )

        add_legend(
            population_legend_ax,
            population_handles,
            "Population · marker area",
            location="center right",
            columns=len(population_handles),
        )

    return fig


plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["DejaVu Sans", "Arial", "Liberation Sans"],
    "axes.titleweight": "bold",
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
    "savefig.facecolor": "white",
})

payload = load_payload(DATA_PATH)
all_records, records_used = collect_records(payload)
rows = usable_rows(all_records)

if rows:
    figure = create_chart(rows)
else:
    figure = create_empty_figure()

figure.savefig(
    OUTPUT_PATH,
    dpi=300,
    facecolor="white",
    bbox_inches="tight",
    pad_inches=0.12,
    metadata={
        "Title": TITLE,
        "Description": (
            "Country-level life expectancy in 2025. Region is encoded by "
            "color, income level by marker shape, and population by marker area."
        ),
    },
)
plt.close(figure)

print(f"RECORDS_USED={records_used}")