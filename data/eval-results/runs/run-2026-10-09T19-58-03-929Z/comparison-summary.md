# F5 Model Comparison Summary

**Run ID**: `run-2026-10-09T19-58-03-929Z`
**Evaluation Date**: 2026-10-09
**Scope**: 15 Approved F3 Test Cases (T01–T15) across Installed Candidates

## 1. Candidate Model Hardware & Packaging Metadata

| Candidate Model | Tag/Digest | Size | Parameter Size | Quantization |
|---|---|---|---|---|
| **qwen2.5:7b** | `845dbda0ea48` | 4.36 GB | 7.6B | Q4_K_M |
| **llama3.2:latest** | `a80c4f17acd5` | 1.88 GB | 3.2B | Q4_K_M |

## 2. Runtime Settings & Warm-up Outcome

| Candidate Model | Timeout Setting | Warm-up Status | Warm-up Latency | Prompt Version |
|---|---|---|---|---|
| **qwen2.5:7b** | 15000ms | FAILED | N/A | F4-v1 |
| **llama3.2:latest** | 15000ms | FAILED | N/A | F4-v1 |

## 3. Quantitative Evaluation Targets & Results

All criteria are evaluated against the locked standards in `docs/DECISIONS.md`:

| Metric / Target | Target Threshold | **qwen2.5:7b** | **llama3.2:latest** |
|---|---|---|---|
| **All 15 Expected Cases Present** | Exactly 15 Unique | 15/15 ✅ | 15/15 ✅ |
| **Timings Complete** | 100% Present | Complete ✅ | Complete ✅ |
| **First-Attempt Schema Validity** | ≥ 95.0% (15/15) | 0.0% (0/15) ❌ | 100.0% (15/15) ✅ |
| **Vague Case Clarification Rate** | 100.0% (7/7) | 0.0% (0/7) ❌ | 0.0% (0/7) ❌ |
| **Invented Misconceptions (Vague)** | Exactly 0 (No Unknowns) | 0 (7 unknown) ❌ | 7 ❌ |
| **Typical Pipeline Latency (Median)** | < 10.0s (10,000ms) | 30.02s (30016.5ms) ❌ | 8.17s (8173.4ms) ✅ |
| **Retries Count** | Minimal | 15 | 4 |
| **Repairs Count** | Minimal | 0 | 0 |
| **Human Agreement Status** | ≥ 80.0% Unanimous (≥7/8) | **PENDING** ⏳ | **PENDING** ⏳ |

## 4. Latency Distribution Breakdown

| Candidate Model | Pre-flight Warm-up | Median (P50) | Mean | P90 | Min | Max |
|---|---|---|---|---|---|---|
| **qwen2.5:7b** | N/A | 30.02s | 30.02s | 30.03s | 30.01s | 30.05s |
| **llama3.2:latest** | N/A | 8.17s | 10.39s | 18.02s | 6.73s | 18.54s |

## 5. Human Review Status

- **Required Reviewers**: Two distinct identified human judges.
- **Judged Cases**: 8 clear misunderstanding diagnosis cases (T01, T02, T03, T04, T05, T06, T12, T13).
- **Rule**: Fallback outcomes cannot earn a diagnosis pass.
- **Current State**: Judgments remain unfilled (`null`) and human agreement is strictly **PENDING**.
- Review sheets generated:
  - [`qwen2.5-7b-judge-sheet.md`](./qwen2.5-7b-judge-sheet.md)
  - [`llama3.2-latest-judge-sheet.md`](./llama3.2-latest-judge-sheet.md)

## 6. Model Recommendation & Provisional Status

### Provisional Recommendation: **None / Blocked**

Neither model passed all quantitative targets. See breakdown above for failures.

