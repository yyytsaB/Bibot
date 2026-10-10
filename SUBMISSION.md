# Bibot — submission checklist and disclosures

Repository audit date: 2026-10-10. This document records inspected repository evidence and team-reported development history. **Submission is not yet complete:** video links, public-access confirmation, team roles, and some asset/tool provenance still need confirmation. TBD means unconfirmed, not unused.

## Project

| Required item | Submission information | Status / evidence |
| --- | --- | --- |
| Project name | **Bibot (Misconception Mapper)** | Bibot is the UI brand; Misconception Mapper is the project name in the authoritative specification. |
| Short description | A mobile-first learning app with reviewed Critical Thinking questions. After a wrong answer, students explain their reasoning; a local AI pipeline may identify a possible misconception, request clarification, or return a verified explanation and reviewed follow-up. A concept map reflects saved learning evidence. | [Specification](docs/SPEC.md), [decisions](docs/DECISIONS.md). |
| Team members | Bueno, Sebastian Miguel A.; De Castro, Aldred Laurenze C.; Talagtag, Karl Andrei C.; Fanoga, Haidie N. | Names recorded in the team-supplied README. Individual roles remain unconfirmed; do not infer them from Git authors or account names. |
| Public GitHub repository | https://github.com/yyytsaB/Bibot | Verified Git remote. **TBD: confirm anonymous/public access before submission.** |

## Proof and local/internet requirements

| Required item | Submission information | Status |
| --- | --- | --- |
| Demo video | **Pending: owner will supply the demo-video URL.** | Missing from inspected submission material. |
| X / LinkedIn video URL | **Pending: owner will supply the public video-post URL on X or LinkedIn.** | Missing from inspected submission material. |
| What runs locally | React frontend; Node/Express backend; Ollama inference on the host machine; static reviewed JSON questions/definitions/follow-ups; browser localStorage learning evidence and practice checkpoint; React Flow concept map; bundled fonts and art. No database or accounts. | Source-backed architecture; local execution does not establish AI readiness. |
| What requires internet | Initial repository/dependency/Ollama/model downloads; external source review; GitHub collaboration; cloud-assisted development tools; delivery of the original assets through Google Drive; video upload and social posting. | Setup/development/submission activities. |
| Runtime internet requirement | The inspected normal practice flow calls the local backend, which calls local Ollama. It does not require a cloud inference API when dependencies and model weights are already installed and local services are operational. Fonts are bundled. Offline execution has **not** been independently verified here with networking disabled. | No blanket offline-verification claim. |

The development frontend proxies `/api` to `http://127.0.0.1:3001`; the backend defaults to Ollama at `http://127.0.0.1:11434`. Local inference runs on that host, not automatically on every phone. Uploads and pasted-text practice are disabled; generation illustrations in explicit design previews do not establish implemented question generation. Readiness requires backend-confirmed successful warm-up; a running backend alone is insufficient.

## Disclosures

### Models used

- **Application default:** `qwen2.5:7b`, served through local Ollama. The backend permits configuration overrides; record any different model actually used for the submitted demo.
- **Compared candidate:** `llama3.2:latest`, also local through Ollama. The inspected F5 run records both candidates, their digests/quantization, measured results, and pending human judgments in [the comparison report](data/eval-results/runs/run-2026-10-09T19-58-03-929Z/comparison-summary.md).
- **Selection limitation:** that report recommends no final model because acceptance targets were unmet and human agreement was pending. The default is not a claim of completed final-model selection. Current demo readiness must be confirmed separately.
- **Development models:** Owner-reported coding model labels: **Gemini 3.8 flash**, **GPT-Sol 6.1**, and **GPT 6 Astra**. These labels are preserved as supplied, without independently asserting official identifiers or versions. Codex (AI) assisted development and drafted the approved content batch. Exact model-to-tool and task attribution remains TBD.

### Technologies and frameworks

| Area | Technology | Repository evidence |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript, React Flow (`@xyflow/react`), CSS | [Frontend package manifest](frontend/package.json) and its committed lockfile. |
| Backend | Node.js, TypeScript, Express; HTTP calls to Ollama | [Backend package manifest](backend/package.json), [entry point](backend/src/index.ts), [transport](backend/src/transport.ts). |
| Contracts / validation | Zod schemas and shared TypeScript types | [Shared package manifest](shared/package.json), [contracts](shared/src/contracts.ts). |
| Persistence | Browser localStorage; no database/accounts | [Persistence implementation](frontend/src/state/persistence.ts). |
| Development / verification | npm lockfiles, tsx, TypeScript compiler, ESLint, Node test runner; Codex-assisted browser checks, including the Codex in-app browser | Manifests and recorded [progress](progress.md). Browser-check tooling is development-only, not a new runtime dependency. |

Manifest ranges are not represented as exact installed versions. Use the committed package-lock files for resolved dependency versions.

### APIs and cloud services

- Runtime application API: local Express `POST /api/feedback` and `GET /api/readiness`.
- Local inference API: Ollama HTTP chat, with lightweight model-availability checks. The production feedback pipeline requests JSON-schema output, temperature 0.1, and no streaming; backend validation/retry and verified fallback are separate from AI diagnosis.
- **No cloud inference, authentication, database, or analytics service is configured in the inspected normal application flow.** This does not imply development used no cloud services.
- Development/collaboration services reported in the workflow: GitHub, Google Drive asset delivery, Codex, and Gemini through Antigravity. Figma was reported as part of mockup preparation; confirm its actual use and contributors. Owner-reported media tools/models: “Standard GPT Model” for image generation, “Image Generation Nano Banana 2.1”, and “Video Generation Omni 1.1 Flash”. Exact asset-to-tool attribution remains TBD.
- Students’ submitted reasoning is sent to the configured backend/Ollama host. The intended default is local; externally overriding backend/Ollama endpoints changes that deployment assumption.

### Existing code and assets

- Frontend starts from the React + TypeScript + Vite scaffold, whose original [README](frontend/README.md) remains. The project uses third-party open-source libraries listed in the manifests/lockfiles; their code is not claimed as wholly team-authored.
- The current build includes the team's scaffold, shared contracts/fixtures, reviewed content, backend pipeline, practice state, persistence, readiness and concept-map work recorded in Git and [progress](progress.md). **TBD: team confirmation of what existed before the event versus what was built during it.** Git alone does not establish event eligibility.
- Duck illustrations, wordmark and app icon were supplied by the owner in `drive-download-20261009T183017Z-1-001.zip` and reused for the UI. [Asset mapping](frontend/src/assets/bibot/asset-map.json) records original filenames, repository filenames and hashes. The workflow describes generated mockups; **Owner-reported generation labels:** “Standard GPT Model” and “Image Generation Nano Banana 2.1” for images, and “Video Generation Omni 1.1 Flash” for video. **TBD: which tool produced each mockup/duck asset, human creator/operator, creation dates and permission/license provenance.** Tool labels alone do not establish licensing or creation dates. These assets are not claimed as hand-drawn or newly generated by this disclosure task.
- Fredoka and Nunito fonts are self-hosted, unmodified variable TTFs. [Font sources](frontend/src/assets/fonts/SOURCES.txt), [Fredoka SIL OFL](frontend/src/assets/fonts/Fredoka-OFL.txt), and [Nunito SIL OFL](frontend/src/assets/fonts/Nunito-OFL.txt) are included.
- Practice content in batch `critical-thinking-c1-reviewed-2026-10-09` was **authored by Codex (AI)**, reviewed by **Karl Andrei on 2026-10-09**, and independently peer-approved by the project owner, whose confirmation is recorded on **2026-10-10**. This is a specific approved exception, not human authorship or permission for future AI-authored content. [Metadata](data/content-metadata.json) preserves item-level citations and review evidence; [the approved draft](content-review-draft.md) also contains the synthetic test explanations. The 15 test explanations were reported reviewed/approved and are synthetic, not collected student responses.
- Conceptual sources are OpenStax *Introduction to Philosophy*, section 5.4, and Stanford Encyclopedia of Philosophy *Abduction*, section 1.1, as mapped in the metadata/draft. Examples are newly composed rather than presented as quotations. This disclosure does not grant permission to reproduce source material beyond applicable terms.

### AI development tools

- **Codex:** repository inspection, task prompts/plan review, implementation assistance, debugging, verification, presentation refinement, and this disclosure document. Codex authored the specific reviewed content batch above. Human approvals and review remain separately attributed.
- **Gemini through Antigravity:** implementation assistance reported in the team workflow. The owner reports “Gemini 3.8 flash” among the coding models used. Exact tasks and contribution boundaries remain to be confirmed; the supplied label is not independently verified as an official model identifier.
- **Owner-reported coding models:** “Gemini 3.8 flash”, “GPT-Sol 6.1”, and “GPT 6 Astra”. Exact association with Antigravity versus Codex and individual tasks remains TBD.
- **Owner-reported media generation:** “Standard GPT Model” for images; “Image Generation Nano Banana 2.1”; “Video Generation Omni 1.1 Flash”. These are team-reported labels, not independently verified product/version identifiers. The specific mockups, duck assets and video segments produced by each tool remain TBD; the demo-video link has not yet been supplied.
- AI development assistance is distinct from the app's local Ollama runtime. Cloud development tools are not runtime inference dependencies.

## Remaining submission actions

- [x] Record the four owner-supplied team-member names.
- [ ] Confirm individual team roles.
- [ ] Supply demo-video and X/LinkedIn video-post URLs.
- [ ] Confirm GitHub anonymous/public access.
- [ ] Confirm actual demo model and readiness; disclose unresolved evaluation limits.
- [x] Record owner-reported coding and media-generation model labels.
- [ ] Confirm exact model-to-tool/task attribution and official identifiers where available.
- [ ] Map individual mockups/assets to their reported generators and supply authorship, dates and permission/license evidence.
- [ ] Confirm pre-event versus event-created code/assets.
- [ ] Have the team review this disclosure for accuracy before submission.

This checklist documents evidence and gaps; it does not claim all checklist items are complete or that organizers have approved the submission.
