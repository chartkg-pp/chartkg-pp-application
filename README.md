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

Each case offers example questions that the original project already asked. A click replays the processing stages (`Linking entities`, `Retrieving graph paths`, `Grounding citations`, `Composing answer`) and then shows the stored answer, its `[G#]` citations, the retrieval strategy (local or global), and the paths/nodes it traversed. Following a citation highlights the matching knowledge-graph nodes and the evidence region in the source image.

The Countries case also includes a refusal example (`quantum chromodynamics boson spectroscopy`) that returned no grounded answer, and the original project's duplicate phrasing of the Income/Lifespan question is kept in the data file as provenance but is not offered as a second button.

Image upload accepts only the two bundled charts: the file is matched by SHA-256 against the recorded source hashes, and any other image is rejected with `This static demo supports the two bundled ChartKG++ test images only.` Free-text question input is disabled; the example buttons remain available.

### PA snapshots

| Dataset | Mode | Generation ID | Result |
| --- | --- | --- | --- |
| Gapminder World Health Chart 2025 | Agentic / CoDA | `971e482de71b45b69bbb33046b890962` | `result.png`, 4004 × 6704, quality score 0.7399 |
| Gapminder World Health Chart 2025 | Native / ECharts | `58528121e7d1427cbb7e697970e87213` | `chart.png`, 1600 × 1000 |
| Case2 KG | Agentic / CoDA | `2237855e979445268d33e4eacb322d89` | `result.png`, 1705 × 1540, quality score 0.8167 |
| Case2 KG | Native / ECharts | `14760e6a9ca743a8b47127b6a4e98b3a` | `chart.png`, 1600 × 1000 |

Native results are re-rendered in the browser from the stored ECharts option rather than embedding the old `chart.html`, so no CDN or absolute path is involved. Agentic results show the untouched PNG plus the generated Python code, context, visual assessment, and the sanitized report. Images taller than 2400 pixels open as a generated `preview.webp` for first paint with zoom and fit-width controls; the original PNG loads on request and stays downloadable.

The history panel lists the four snapshots; selecting a row loads that result.

## Data provenance

`public/demo-data/manifest.json` describes every asset, its pixel size, and its SHA-256.

- GraphRAG knowledge graphs and evidence regions are copied byte-for-byte from the original project's `test data/case1_case2_KG/two-chart-kg-v18-20260912/readable` directory.
- Question-answer snapshots were produced by `scripts/export-graphrag-qa.py`, which calls the original project's `analyze_fixture` and `answer_question` with a disabled DeepSeek client. Answers therefore come from the project's own deterministic extractor, never from a fabricated model transcript. Re-running the script reproduces the existing answers exactly.
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

- every manifest path exists, including preview, code, and report attachments;
- the two GraphRAG knowledge graphs are non-empty, their relations reference real entities, and the QA revision matches the graph;
- each GraphRAG case offers at least three examples covering local and global retrieval, at least one question taken from the project's own `suggestedQuestions`, citations that resolve to graph records, and a refusal with no citations;
- the four PA generation IDs are exactly the expected set, Native options contain series, Agentic snapshots publish code and a quality score, and every PNG matches its recorded SHA-256;
- no published file contains a Windows absolute path, a user directory, a credential, an output directory, a runtime database, a raw model response, a network endpoint, or an `.env` reference.
