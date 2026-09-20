"""Export deterministic QA examples through the original ChartKG++GraphRAG pipeline.

Every question in this script was already used by the original project: either by its test
suite (``backend/tests/test_analysis.py``) or by the ``suggestedQuestions`` that
``analyze_fixture`` returns for each chart. No question is rewritten for this static demo.

The script runs the original ``answer_question`` with a disabled DeepSeek client, so it uses
the project's deterministic extractive planner and never contacts a model provider. Answers
are therefore reproducible snapshots, not fabricated history.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SUGGESTIONS_ORIGIN = "analysis.suggestedQuestions"
TEST_ORIGIN = "backend/tests/test_analysis.py"

# Each case lists questions in display order: the focused and overview questions first, then
# the chart's own suggested questions, then an optional refusal example. ``provenance`` holds
# questions the original project also used but that duplicate a shown question; they stay in
# the file as evidence of real usage, marked ``suggested: false`` so the site does not offer
# two near-identical example buttons.
CASES: dict[str, dict[str, object]] = {
    "countries-health-wealth": {
        "file": "02-countries-readable-kg.json",
        "output": "countries/qa-examples.json",
        "questions": [
            {"question": "What is the relationship between Income and Lifespan?", "origin": TEST_ORIGIN},
            {"question": "Give an overview of the main findings.", "origin": TEST_ORIGIN},
        ],
        "suggested_count": 1,
        "abstain": {"question": "quantum chromodynamics boson spectroscopy", "origin": TEST_ORIGIN},
        "provenance": [
            {"question": "How are Income and Lifespan related?", "origin": TEST_ORIGIN},
        ],
    },
    "case2-opinionseer": {
        "file": "01-case2-readable-kg.json",
        "output": "case2/qa-examples.json",
        "questions": [
            {"question": "Give an overview of the main findings.", "origin": TEST_ORIGIN},
        ],
        "suggested_count": 3,
        "abstain": None,
        "provenance": [],
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True, help="ChartKG++GraphRAG backend directory")
    parser.add_argument("--source-data", type=Path, required=True, help="Directory containing readable KG files")
    parser.add_argument("--output", type=Path, required=True, help="Static graphrag output directory")
    return parser.parse_args()


def build_questions(definition: dict[str, object], suggested: list[str]) -> list[dict[str, object]]:
    """Merge the hand-listed questions with the chart's own suggested questions."""
    entries = [{**item, "suggested": True} for item in definition["questions"]]  # type: ignore[arg-type]
    entries.extend(
        {"question": question, "origin": SUGGESTIONS_ORIGIN, "suggested": True}
        for question in suggested[: int(definition["suggested_count"])]  # type: ignore[arg-type]
    )
    abstain = definition.get("abstain")
    if abstain:
        entries.append({**abstain, "suggested": True})  # type: ignore[arg-type]
    entries.extend({**item, "suggested": False} for item in definition.get("provenance") or [])  # type: ignore[arg-type]
    return entries


def main() -> None:
    args = parse_args()
    sys.path.insert(0, str(args.backend.resolve()))
    from app.analysis import DeepSeekClient, analyze_fixture, answer_question  # noqa: PLC0415

    client = DeepSeekClient(api_key="")
    for case_id, definition in CASES.items():
        raw = json.loads((args.source_data / str(definition["file"])).read_text(encoding="utf-8"))
        context = analyze_fixture(raw, client)
        questions = build_questions(definition, list(context.public["suggestedQuestions"]))
        examples = []
        for index, entry in enumerate(questions, start=1):
            result = answer_question(context, str(entry["question"]), client)
            examples.append({
                "id": f"{case_id}-example-{index}",
                "question": entry["question"],
                "origin": entry["origin"],
                "suggested": entry["suggested"],
                "turn": result,
            })
        payload = {
            "caseId": case_id,
            "sourceProject": "ChartKG++GraphRAG",
            "revisionId": context.public["graph"]["revisionId"],
            "examples": examples,
        }
        target = args.output / str(definition["output"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shown = sum(1 for item in examples if item["suggested"])
        print(f"{case_id}: {len(examples)} examples ({shown} shown, {len(examples) - shown} provenance only)")


if __name__ == "__main__":
    main()
