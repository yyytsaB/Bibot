/**
 * @file Development-only fixtures for F9, F11, F13, and F14 UI scaffolding.
 * NOT for production practice or evidence of local model readiness.
 * Contains neutral placeholders pending reviewed C1 educational content.
 */

import type {
  Concept,
  Question,
  FollowUp,
  DiagnosisResult,
  ClarificationResult,
  FallbackResult,
} from "./contracts.js";

// --- 1. Concepts ---
export const fixtureConcepts: Concept[] = [
  {
    id: "induction",
    name: "Induction (Fixture Placeholder)",
    definition: "[Placeholder definition for induction; pending reviewed C1 content]",
  },
  {
    id: "deduction",
    name: "Deduction (Fixture Placeholder)",
    definition: "[Placeholder definition for deduction; pending reviewed C1 content]",
  },
  {
    id: "abduction",
    name: "Abduction (Fixture Placeholder)",
    definition: "[Placeholder definition for abduction; pending reviewed C1 content]",
  },
];

// --- 2. Follow-ups ---
export const fixtureFollowUps: FollowUp[] = [
  {
    id: "fu-wet-floor-primary",
    subject_id: "critical-thinking",
    text: "[Placeholder follow-up question scenario; pending reviewed C1 content]",
    choices: [
      { id: "c-fu-1", text: "[Placeholder choice: Inductive]" },
      { id: "c-fu-2", text: "[Placeholder choice: Abductive]" },
      { id: "c-fu-3", text: "[Placeholder choice: Deductive]" },
    ],
    correct_choice_id: "c-fu-2",
    concept_ids: ["abduction", "induction"],
    verified_explanation:
      "[Placeholder verified explanation for follow-up; pending reviewed C1 content]",
    follow_up_ids: [],
    concept_pair: ["induction", "abduction"],
  },
  {
    id: "fu-wet-floor-extra",
    subject_id: "critical-thinking",
    text: "[Placeholder extra follow-up question scenario; pending reviewed C1 content]",
    choices: [
      { id: "c-extra-1", text: "[Placeholder choice: Inductive]" },
      { id: "c-extra-2", text: "[Placeholder choice: Abductive]" },
      { id: "c-extra-3", text: "[Placeholder choice: Deductive]" },
    ],
    correct_choice_id: "c-extra-2",
    concept_ids: ["abduction"],
    verified_explanation:
      "[Placeholder extra verified explanation; pending reviewed C1 content]",
    follow_up_ids: [],
    concept_pair: ["induction", "abduction"],
  },
];

// --- 3. Practice Questions ---
export const fixtureQuestion: Question = {
  id: "q-wet-floor",
  subject_id: "critical-thinking",
  text: "[Placeholder question scenario: wet floor reasoning; pending reviewed C1 content]",
  choices: [
    { id: "c-ind", text: "[Placeholder choice: Inductive]" },
    { id: "c-ded", text: "[Placeholder choice: Deductive]" },
    { id: "c-abd", text: "[Placeholder choice: Abductive]" },
  ],
  correct_choice_id: "c-abd",
  concept_ids: ["abduction", "induction"],
  verified_explanation:
    "[Placeholder verified explanation for wet floor question; pending reviewed C1 content]",
  follow_up_ids: ["fu-wet-floor-primary", "fu-wet-floor-extra"],
};

export const fixtureQuestions: Question[] = [fixtureQuestion];

// --- 4. FeedbackResult Variants ---
export const fixtureDiagnosisResult: DiagnosisResult = {
  kind: "diagnosis",
  possible_misconception:
    "[Placeholder possible misconception; pending reviewed C1 content]",
  explanation: "[Placeholder diagnosis explanation; pending reviewed C1 content]",
  concept_ids: ["abduction", "induction"],
  follow_up_id: "fu-wet-floor-primary",
  confidence: "high",
};

export const fixtureClarificationResult: ClarificationResult = {
  kind: "clarification",
  clarification_prompt:
    "[Placeholder clarification prompt; pending reviewed C1 content]",
};

export const fixtureFallbackResult: FallbackResult = {
  kind: "fallback",
  verified_explanation: fixtureQuestion.verified_explanation,
  follow_up_id: "fu-wet-floor-primary",
};

export const fixtureFeedbackResults = {
  diagnosis: fixtureDiagnosisResult,
  clarification: fixtureClarificationResult,
  fallback: fixtureFallbackResult,
} as const;

// --- 5. Map Presentation Fixtures (for F11) ---
export type FixtureConceptStatus =
  | "Needs Review"
  | "Improving"
  | "Understanding Demonstrated"
  | "Not Yet Practiced";

export type FixtureMapNode = {
  id: string;
  label: string;
  status: FixtureConceptStatus;
  color: "red" | "amber" | "green" | "gray";
};

export type FixtureMapEdge = {
  id: string;
  source: string;
  target: string;
  isConfused: boolean;
  count?: number;
};

export type FixtureConfusedPair = {
  concept_a: string;
  concept_b: string;
  count: number;
};

export type FixtureMapSnapshot = {
  name: string;
  nodes: FixtureMapNode[];
  edges: FixtureMapEdge[];
  confused_pairs: FixtureConfusedPair[];
};

export const fixtureInitialMapSnapshot: FixtureMapSnapshot = {
  name: "initial-unpracticed",
  nodes: [
    {
      id: "induction",
      label: "Induction (Fixture Placeholder)",
      status: "Not Yet Practiced",
      color: "gray",
    },
    {
      id: "deduction",
      label: "Deduction (Fixture Placeholder)",
      status: "Not Yet Practiced",
      color: "gray",
    },
    {
      id: "abduction",
      label: "Abduction (Fixture Placeholder)",
      status: "Needs Review",
      color: "red",
    },
  ],
  edges: [],
  confused_pairs: [],
};

export const fixtureProgressingMapSnapshot: FixtureMapSnapshot = {
  name: "progressing-with-confused-pair",
  nodes: [
    {
      id: "induction",
      label: "Induction (Fixture Placeholder)",
      status: "Needs Review",
      color: "red",
    },
    {
      id: "abduction",
      label: "Abduction (Fixture Placeholder)",
      status: "Improving",
      color: "amber",
    },
    {
      id: "deduction",
      label: "Deduction (Fixture Placeholder)",
      status: "Understanding Demonstrated",
      color: "green",
    },
  ],
  edges: [
    {
      id: "edge-induction-abduction",
      source: "induction",
      target: "abduction",
      isConfused: true,
      count: 2,
    },
  ],
  confused_pairs: [
    {
      concept_a: "induction",
      concept_b: "abduction",
      count: 2,
    },
  ],
};

// --- 6. Readiness & Home Presentation Fixtures (for F13 & F14) ---
export type FixtureReadinessState = {
  isReady: boolean;
  statusLabel: "Local AI Ready" | "Local AI Unavailable";
  detail: string;
};

export const fixtureReadinessReady: FixtureReadinessState = {
  isReady: true,
  statusLabel: "Local AI Ready",
  detail:
    "[Fixture] Mocked ready signal for UI development; does not reflect live Ollama availability",
};

export const fixtureReadinessUnavailable: FixtureReadinessState = {
  isReady: false,
  statusLabel: "Local AI Unavailable",
  detail:
    "[Fixture] Mocked unavailable signal for UI development; does not reflect live Ollama availability",
};

export type FixtureSubjectCard = {
  id: string;
  title: string;
  description: string;
  hasPreparedPractice: boolean;
};

export type FixtureUploadStatus = {
  disabled: boolean;
  label: string;
  tooltip: string;
};

export type FixtureHomeData = {
  preparedSubject: FixtureSubjectCard;
  uploadStatus: FixtureUploadStatus;
  mapPreviewNodes: FixtureMapNode[];
};

export const fixtureHomeData: FixtureHomeData = {
  preparedSubject: {
    id: "critical-thinking",
    title: "Critical Thinking",
    description:
      "[Placeholder lesson covering induction, deduction, and abduction; pending reviewed C1 content]",
    hasPreparedPractice: true,
  },
  uploadStatus: {
    disabled: true,
    label: "Upload Materials (Coming soon)",
    tooltip: "Disabled until F15/F16 local extraction is complete",
  },
  mapPreviewNodes: fixtureInitialMapSnapshot.nodes,
};
