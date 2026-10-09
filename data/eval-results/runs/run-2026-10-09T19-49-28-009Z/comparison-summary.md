# F5 Model Comparison Summary

**Run ID**: `run-2026-10-09T19-49-28-009Z` *(DRY-RUN / OFFLINE)*
**Evaluation Date**: 2026-10-09
**Scope**: 15 Approved F3 Test Cases (T01–T15) across Installed Candidates

## 1. Candidate Model Hardware & Packaging Metadata

| Candidate Model | Tag/Digest | Size | Parameter Size | Quantization |
|---|---|---|---|---|
| **qwen2.5:7b** | `offline-dry-` | N/A | N/A | N/A |
| **llama3.2:latest** | `offline-dry-` | N/A | N/A | N/A |

## 2. Runtime Settings & Warm-up Outcome

| Candidate Model | Timeout Setting | Warm-up Status | Warm-up Latency | Prompt Version |
|---|---|---|---|---|
| **qwen2.5:7b** | 15000ms | SUCCESS | 0.4ms | F4-v1 |
| **llama3.2:latest** | 15000ms | SUCCESS | 0ms | F4-v1 |

## 3. Quantitative Evaluation Targets & Results

All criteria are evaluated against the locked standards in `docs/DECISIONS.md`:

| Metric / Target | Target Threshold | **qwen2.5:7b** | **llama3.2:latest** |
|---|---|---|---|
| **All 15 Expected Cases Present** | Exactly 15 Unique | 15/15 ✅ | 15/15 ✅ |
| **Timings Complete** | 100% Present | Complete ✅ | Complete ✅ |
| **First-Attempt Schema Validity** | ≥ 95.0% (15/15) | 100.0% (15/15) ✅ | 100.0% (15/15) ✅ |
| **Vague Case Clarification Rate** | 100.0% (7/7) | 100.0% (7/7) ✅ | 100.0% (7/7) ✅ |
| **Invented Misconceptions (Vague)** | Exactly 0 (No Unknowns) | 0 ✅ | 0 ✅ |
| **Typical Pipeline Latency (Median)** | < 10.0s (10,000ms) | 0.00s (0.1ms) ✅ | 0.00s (0.1ms) ✅ |
| **Retries Count** | Minimal | 0 | 0 |
| **Repairs Count** | Minimal | 8 | 8 |
| **Human Agreement Status** | ≥ 80.0% Unanimous (≥7/8) | **PENDING** ⏳ | **PENDING** ⏳ |

## 4. Latency Distribution Breakdown

| Candidate Model | Pre-flight Warm-up | Median (P50) | Mean | P90 | Min | Max |
|---|---|---|---|---|---|---|
| **qwen2.5:7b** | 0.00s | 0.00s | 0.00s | 0.00s | 0.00s | 0.01s |
| **llama3.2:latest** | 0.00s | 0.00s | 0.00s | 0.00s | 0.00s | 0.00s |

## 5. Human Review Status

- **Required Reviewers**: Two distinct identified human judges.
- **Judged Cases**: 8 clear misunderstanding diagnosis cases (T01, T02, T03, T04, T05, T06, T12, T13).
- **Rule**: Fallback outcomes cannot earn a diagnosis pass.
- **Current State**: Judgments remain unfilled (`null`) and human agreement is strictly **PENDING**.
- Review sheets generated:
  - [`qwen2.5-7b-judge-sheet.md`](./qwen2.5-7b-judge-sheet.md)
  - [`llama3.2-latest-judge-sheet.md`](./llama3.2-latest-judge-sheet.md)

## 6. Model Recommendation & Provisional Status

### Provisional Recommendation: **qwen2.5:7b**

> [!IMPORTANT]
> **PROVISIONAL STATUS**: This recommendation is strictly **PROVISIONAL** pending human review.
> Both models met quantitative targets, but qwen2.5:7b had superior typical latency.

