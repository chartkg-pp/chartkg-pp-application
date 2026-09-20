import { readFile, writeFile } from 'node:fs/promises'

const [source, target, generationId, sourceId, pipeline] = process.argv.slice(2)
if (!source || !target || !generationId || !sourceId || !pipeline) {
  throw new Error('Usage: node sanitize-reports.mjs <source> <target> <generationId> <sourceId> <pipeline>')
}

const report = JSON.parse(await readFile(source, 'utf8'))
const iterations = Array.isArray(report.iterations) ? report.iterations.length : report.iterations ? 1 : 0
const clean = {
  status: report.status,
  pipeline,
  engine: report.engine ?? (pipeline === 'native' ? 'echarts' : 'matplotlib-coda'),
  generationId,
  sourceId,
  input: typeof report.input === 'string' ? report.input : undefined,
  generatedAt: report.generated_at,
  iterations,
  bestIteration: report.bestIteration ?? report.best_iteration,
  qualityScore: report.quality_score ?? report.evaluation?.overall,
  visualQualityScore: report.visual_quality_score,
  qualityThreshold: report.quality_threshold,
  extraction: report.extraction,
  evaluation: report.evaluation ?? report.final_evaluation,
  todoEvaluation: pipeline === 'agentic' ? report.todo_evaluation : undefined,
}

await writeFile(target, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')

