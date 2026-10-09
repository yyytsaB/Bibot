import type {
  Question,
  FollowUp,
  DiagnosisResult,
  FallbackResult,
} from "shared";

export type PracticeStage =
  | "question"
  | "reasoning"
  | "analysis"
  | "feedback"
  | "follow_up"
  | "completed";

export type PracticeStatus =
  | "question_answering"
  | "question_correct"
  | "reasoning"
  | "analysis"
  | "clarification"
  | "diagnosis"
  | "fallback"
  | "follow_up_answering"
  | "follow_up_checked"
  | "recoverable_error"
  | "session_completed";

export type LearningEvidenceEvent =
  | {
      eventId: string;
      sessionId: string;
      timestamp: number;
      kind: "correct_first_try";
      questionId: string;
      conceptIds: string[];
    }
  | {
      eventId: string;
      sessionId: string;
      timestamp: number;
      kind: "wrong_initial";
      questionId: string;
      selectedChoiceId: string;
      conceptIds: string[];
    }
  | {
      eventId: string;
      sessionId: string;
      timestamp: number;
      kind: "follow_up_result";
      questionId: string;
      followUpId: string;
      isExtra: boolean;
      isCorrect: boolean;
      conceptPair: [string, string];
    };

export interface BasePracticeState {
  sessionId: string;
  currentQuestionIndex: number;
  currentQuestion: Question;
  totalQuestions: number;
  isSessionCompleted: boolean;
  learningEvidence: LearningEvidenceEvent[];
  shownFollowUpIds: string[];
}

export interface QuestionAnsweringState extends BasePracticeState {
  status: "question_answering";
  stage: "question";
  selectedChoiceId: string | null;
}

export interface QuestionCorrectState extends BasePracticeState {
  status: "question_correct";
  stage: "question";
  selectedChoiceId: string;
  verifiedExplanation: string;
}

export interface ReasoningState extends BasePracticeState {
  status: "reasoning";
  stage: "reasoning";
  selectedChoiceId: string;
  studentReasoning: string;
  clarificationAttemptCount: number;
}

export interface AnalysisState extends BasePracticeState {
  status: "analysis";
  stage: "analysis";
  selectedChoiceId: string;
  studentReasoning: string;
  clarificationAttemptCount: number;
  submissionId: number;
}

export interface ClarificationState extends BasePracticeState {
  status: "clarification";
  stage: "feedback";
  selectedChoiceId: string;
  studentReasoning: string;
  clarificationPrompt: string;
  clarificationAttemptCount: number;
}

export interface DiagnosisState extends BasePracticeState {
  status: "diagnosis";
  stage: "feedback";
  selectedChoiceId: string;
  studentReasoning: string;
  diagnosis: DiagnosisResult;
  clarificationAttemptCount: number;
}

export interface FallbackState extends BasePracticeState {
  status: "fallback";
  stage: "feedback";
  selectedChoiceId: string;
  studentReasoning: string;
  fallback: FallbackResult;
  clarificationAttemptCount: number;
}

export interface FollowUpAnsweringState extends BasePracticeState {
  status: "follow_up_answering";
  stage: "follow_up";
  activeFollowUp: FollowUp;
  isExtra: boolean;
  selectedFollowUpChoiceId: string | null;
  clarificationAttemptCount: number;
}

export interface FollowUpCheckedState extends BasePracticeState {
  status: "follow_up_checked";
  stage: "follow_up";
  activeFollowUp: FollowUp;
  isExtra: boolean;
  selectedFollowUpChoiceId: string;
  isCorrect: boolean;
  verifiedExplanation: string;
  unusedLinkedFollowUpId: string | null;
  clarificationAttemptCount: number;
}

export interface RecoverableErrorState extends BasePracticeState {
  status: "recoverable_error";
  stage: "reasoning";
  selectedChoiceId: string;
  studentReasoning: string;
  errorMessage: string;
  clarificationAttemptCount: number;
}

export interface SessionCompletedState extends BasePracticeState {
  status: "session_completed";
  stage: "completed";
}

export type PracticeState =
  | QuestionAnsweringState
  | QuestionCorrectState
  | ReasoningState
  | AnalysisState
  | ClarificationState
  | DiagnosisState
  | FallbackState
  | FollowUpAnsweringState
  | FollowUpCheckedState
  | RecoverableErrorState
  | SessionCompletedState;
