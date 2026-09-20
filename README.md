# ChartKG++ Application

Standalone static showcase for two workspaces:

- **GraphRAG QA** — two bundled ChartKG++ test charts with their readable knowledge graphs, four-layer summaries, citations, image evidence regions, and question-answer examples exported from the original ChartKG++GraphRAG project.
- **Chart Generation** — four pre-generated ChartKG++ PA results (Gapminder and Case2 KG, each in Agentic/CoDA and Native/ECharts mode) with their code, context, evaluation, and reports.

The site is built for GitHub Pages and has no backend: every request goes to `demo-data/` inside the deployment. There is no `/api` call, no event stream, no model provider, and no runtime configuration.

## Included demonstrations

### GraphRAG cases

| Case | Image | Knowledge graph |
| --- | --- | --- |
| Countries · Health and Wealth | `countries_health_wealth_2025.png` | 509 entities, 1685 relations |
| Case2 · Radial Bar and Ternary Scatter | `case2_final.png` | 232 entities, 685 relations |

Each case offers example questions that the original project already asked. Every example carries **two** answers, and the switch at the bottom of a response moves between them:

- **GraphRAG** — the graph-grounded answer with its `[G#]` citations, retrieval strategy (local or global), and the paths/nodes it traversed. A click replays the processing stages (`Linking entities`, `Retrieving graph paths`, `Grounding citations`, `Composing answer`) first. Following a citation highlights the matching knowledge-graph nodes and the evidence region in the source image.
- **Vision LLM** — the model-direct answer, produced by the original project's vision path from the image alone. It reports the model that answered, states that it used no knowledge graph, and carries no citations; the panel does not claim graph evidence for it.

The Countries case also includes a refusal example (`quantum chromodynamics boson spectroscopy`) where the two modes disagree in a useful way: GraphRAG reports it has no grounded answer, while the vision model describes the chart and declines the physics question. The original project's duplicate phrasing of the Income/Lifespan question is kept in the data file as provenance but is not offered as a second button.

Image upload accepts only the two bundled charts: the file is matched by SHA-256 against the recorded source hashes, and any other image is rejected with `This static demo supports the two bundled ChartKG++ test images only.` Free-text question input is disabled; the example buttons remain available.

### PA snapshots

| Dataset | Mode | Generation ID | Result |
| --- | --- | --- | --- |
| Gapminder World Health Chart 2025 | Agentic / CoDA | `971e482de71b45b69bbb33046b890962` | `result.png`, 4004 × 6704, quality score 0.7399 |
| Gapminder World Health Chart 2025 | Native / ECharts | `58528121e7d1427cbb7e697970e87213` | `chart.png`, 1600 × 1000 |
| Case2 KG | Agentic / CoDA | `2237855e979445268d33e4eacb322d89` | `result.png`, 1705 × 1540, quality score 0.8167 |
| Case2 KG | Native / ECharts | `14760e6a9ca743a8b47127b6a4e98b3a` | `chart.png`, 1600 × 1000 |

The header switches both dimensions directly: the **KG** dropdown selects the dataset (`Gapminder_world_health_chart_2025.csv` or `kg(1).json`) and the **Mode** dropdown selects Agentic/CoDA or Native/ECharts, so all four snapshots are reachable from the top bar. The same two choices are also available as the Quick Samples buttons plus the Generation mode select in the Source panel, and as the four rows in the history list.

Native results are re-rendered in the browser from the stored ECharts option rather than embedding the old `chart.html`, so no CDN or absolute path is involved. Agentic results show the untouched PNG plus the generated Python code, context, visual assessment, and the sanitized report. The 4004 × 6704 Gapminder PNG is served at full resolution and scrolls from its top edge, and it stays downloadable from the header.

## Data provenance

`public/demo-data/manifest.json` describes every asset, its pixel size, and its SHA-256.

- GraphRAG knowledge graphs and evidence regions are copied byte-for-byte from the original project's `test data/case1_case2_KG/two-chart-kg-v18-20260912/readable` directory.
- Graph-grounded question-answer snapshots were produced by `scripts/export-graphrag-qa.py`, which calls the original project's `analyze_fixture` and `answer_question` with a disabled DeepSeek client. Answers therefore come from the project's own deterministic extractor, never from a fabricated model transcript. Re-running the script reproduces the existing answers exactly.
- Model-direct snapshots come from the same script with `--vision`, which calls the original project's `answer_visual_question` against the configured vision model once per offered question and stores the result. The recorded model name (`deepseek-v4-flash-vision-exp`) is shown in the answer footer. The capture needs a larger output budget than the project default, because the model spends the default 2048 tokens on reasoning and returns an empty answer for broad questions:
  ```bash
  DEEPSEEK_MAX_TOKENS=8192 python scripts/export-graphrag-qa.py \
    --backend <ChartKG++GraphRAG>/backend \
    --source-data <readable KG dir> \
    --image-dir <chart image dir> \
    --output public/demo-data/graphrag --vision
  ```
- PA artifacts are the final results of the four listed generations. Iteration files, `model-response*.txt`, `search-results.json`, execution logs, the runtime database, and backend caches were **not** migrated. Reports were reduced by `scripts/sanitize-reports.mjs` to status, pipeline, generation ID, input filename, iteration count, quality score, evaluation summary, and timing, which removes output directories, absolute paths, provider settings, and credentials.

## Local development

```bash
npm ci
npm run dev
```

Production verification:

```bash
npm run build
npm run preview
```

`npm run build` runs the data validation and the type check first, so a build fails if a bundled asset is missing, a hash no longer matches, a required example question disappeared, or a published file contains a machine-specific path or a credential.

Individual checks:

```bash
npm run validate:data
npm run typecheck
```

## GitHub Pages

Create an empty repository named `chartkg-pp-application`, push to `main`, then set **Settings → Pages → Source → GitHub Actions**. `.github/workflows/pages.yml` installs dependencies, builds, and deploys `dist`. `vite.config.ts` derives the base path from `GITHUB_REPOSITORY`, so the project-site URL works without editing the config:

```text
https://huabuweixin-BH.github.io/chartkg-pp-application/
```

Routing uses a hash router, so `#/graphrag`, `#/generation`, and `#/generation/history` all survive a page refresh on Pages.

## Static-data safety

`npm run validate:data` checks that:

- every manifest path exists, including code, assessment, and report attachments;
- the two GraphRAG knowledge graphs are non-empty, their relations reference real entities, and the QA revision matches the graph;
- each GraphRAG case offers at least three examples covering local and global retrieval, at least one question taken from the project's own `suggestedQuestions`, citations that resolve to graph records, and a refusal with no citations;
- every offered question also has a model-direct answer that records its mode and model, and carries no graph citations;
- the four PA generation IDs are exactly the expected set, Native options contain series, Agentic snapshots publish code and a quality score, and every PNG matches its recorded SHA-256;
- no published file contains a Windows absolute path, a user directory, a credential, an output directory, a runtime database, a raw model response, a network endpoint, or an `.env` reference.
