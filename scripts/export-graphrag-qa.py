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
        "image": "countries_health_wealth_2025.png",
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
        "image": "case2_final.png",
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
    parser.add_argument("--image-dir", type=Path, help="Directory containing the bundled chart images")
    parser.add_argument("--vision", action="store_true", help="Also capture model-direct (vision) answers")
    parser.add_argument("--cases", nargs="*", help="Limit the run to these case ids")
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
    if args.vision:
        from dotenv import load_dotenv  # noqa: PLC0415
        from app.analysis import DeepSeekClient, analyze_fixture, answer_question, answer_visual_question  # noqa: PLC0415
        load_dotenv(args.backend.resolve() / ".env")
    else:
        from app.analysis import DeepSeekClient, analyze_fixture, answer_question  # noqa: PLC0415

    # GraphRAG answers stay reproducible: the disabled client forces the deterministic extractor.
    client = DeepSeekClient(api_key="")
    vision_client = DeepSeekClient() if args.vision else None
    if vision_client is not None and not vision_client.vision_enabled:
        raise SystemExit("Vision capture requested but no vision model is configured in backend/.env")

    for case_id, definition in CASES.items():
        if args.cases and case_id not in args.cases:
            continue
        raw = json.loads((args.source_data / str(definition["file"])).read_text(encoding="utf-8"))
        context = analyze_fixture(raw, client)
        questions = build_questions(definition, list(context.public["suggestedQuestions"]))
        image_bytes = None
        if vision_client is not None:
            image_path = args.image_dir / str(definition["image"])
            image_bytes = image_path.read_bytes()
        examples = []
        for index, entry in enumerate(questions, start=1):
            result = answer_question(context, str(entry["question"]), client)
            example = {
                "id": f"{case_id}-example-{index}",
                "question": entry["question"],
                "origin": entry["origin"],
                "suggested": entry["suggested"],
                "turn": result,
            }
            # Model-direct answers are only captured for the questions the site offers; the
            # provenance-only duplicate would double the model cost for no visible benefit.
            if image_bytes is not None and entry["suggested"]:
                vision_turn = answer_visual_question(str(entry["question"]), image_bytes, "image/png", vision_client)
                if vision_turn is None:
                    raise SystemExit(f"Vision capture failed for {case_id}: {entry['question']}")
                example["visionTurn"] = vision_turn
            examples.append(example)
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
        vision_count = sum(1 for item in examples if "visionTurn" in item)
        print(f"{case_id}: {len(examples)} examples ({shown} shown, {len(examples) - shown} provenance only, {vision_count} with vision answer)")


if __name__ == "__main__":
    main()
