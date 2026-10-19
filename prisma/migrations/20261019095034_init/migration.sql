-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'HI');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ_SINGLE');

-- CreateEnum
CREATE TYPE "QuestionOrigin" AS ENUM ('OFFICIAL_PREVIOUS_YEAR', 'SOURCE_MATERIAL', 'SYNTHETIC_TEMPLATE', 'AI_AUTHORED', 'HUMAN_AUTHORED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PROVISIONAL', 'PENDING_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('DETERMINISTIC_COMPUTATION', 'HUMAN_REVIEW', 'AUTOMATED_CHECKS', 'OFFICIAL_ANSWER_KEY', 'NONE');

-- CreateEnum
CREATE TYPE "MockType" AS ENUM ('FULL_LENGTH', 'SUBJECT', 'TOPIC_PRACTICE', 'ADAPTIVE_WEAKNESS', 'SPEED_DRILL', 'REVISION', 'MIXED', 'DIAGNOSTIC');

-- CreateEnum
CREATE TYPE "FeedbackMode" AS ENUM ('IMMEDIATE', 'END_OF_SET');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "ErrorCategory" AS ENUM ('CONCEPTUAL', 'KNOWLEDGE_GAP', 'CALCULATION', 'MISREAD', 'RULE_MISAPPLICATION', 'GUESSING', 'RUSHED', 'TIME_MANAGEMENT', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('TOPIC', 'SUBTOPIC');

-- CreateEnum
CREATE TYPE "MasteryState" AS ENUM ('NOT_STARTED', 'INSUFFICIENT_DATA', 'WEAK', 'DEVELOPING', 'PROFICIENT', 'MASTERED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "MilestoneKind" AS ENUM ('MASTERY_ACHIEVED', 'RETENTION_CONFIRMED', 'MASTERY_LOST', 'BECAME_WEAK');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISMISSED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyllabusVersion" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "verification" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyllabusVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "conceptNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtopic" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subtopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL,
    "subtopicId" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "organization" TEXT,
    "publishedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3),
    "cycle" TEXT,
    "license" TEXT NOT NULL,
    "allowsRepublish" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperRecord" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "cycle" TEXT NOT NULL,
    "shift" TEXT,
    "sourceId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "examCode" TEXT NOT NULL DEFAULT 'MP_POLICE_CONSTABLE',
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "subtopicId" TEXT,
    "objectiveId" TEXT,
    "skillKey" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ_SINGLE',
    "language" "Language" NOT NULL DEFAULT 'EN',
    "stem" TEXT NOT NULL,
    "stemHi" TEXT,
    "options" JSONB NOT NULL,
    "correctOption" TEXT NOT NULL,
    "explanation" TEXT,
    "explanationHi" TEXT,
    "difficulty" "Difficulty" NOT NULL,
    "difficultyBasis" TEXT NOT NULL,
    "requiredSkill" TEXT,
    "expectedTimeSec" INTEGER NOT NULL,
    "isNumerical" BOOLEAN NOT NULL DEFAULT false,
    "origin" "QuestionOrigin" NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "generator" TEXT,
    "sourceId" TEXT,
    "sourceRef" TEXT,
    "paperId" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL,
    "verificationMethod" "VerificationMethod" NOT NULL DEFAULT 'NONE',
    "reviewNotes" TEXT,
    "license" TEXT,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "observedPValue" DOUBLE PRECISION,
    "observedAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "fromStatus" "VerificationStatus" NOT NULL,
    "toStatus" "VerificationStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "importedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRecords" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "invalid" INTEGER NOT NULL,
    "flagged" INTEGER NOT NULL,
    "report" JSONB NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syllabusVersionId" TEXT NOT NULL,
    "type" "MockType" NOT NULL,
    "title" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "feedbackMode" "FeedbackMode" NOT NULL DEFAULT 'END_OF_SET',
    "markingScheme" JSONB NOT NULL,
    "allocation" JSONB NOT NULL,
    "selectionCriteria" JSONB NOT NULL,
    "shortages" JSONB NOT NULL,
    "scope" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTestQuestion" (
    "id" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "slotCategory" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previouslySeen" BOOLEAN NOT NULL DEFAULT false,
    "correctOptionSnapshot" TEXT NOT NULL,
    "difficultySnapshot" "Difficulty" NOT NULL,
    "topicIdSnapshot" TEXT NOT NULL,
    "subtopicIdSnapshot" TEXT,

    CONSTRAINT "MockTestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "correctCount" INTEGER,
    "incorrectCount" INTEGER,
    "unansweredCount" INTEGER,
    "timeSpentSec" INTEGER,
    "summary" JSONB,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "mockTestQuestionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "subtopicId" TEXT,
    "skillKey" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "selectedOption" TEXT,
    "isCorrect" BOOLEAN,
    "timeSpentMs" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "answerChanges" INTEGER NOT NULL DEFAULT 0,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "selfConfidence" INTEGER,
    "answeredAt" TIMESTAMP(3),
    "errorCategory" "ErrorCategory",
    "errorConfidence" DOUBLE PRECISION,
    "errorIsTentative" BOOLEAN,
    "errorEvidence" JSONB,
    "scored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSkillState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "incorrect" INTEGER NOT NULL DEFAULT 0,
    "unanswered" INTEGER NOT NULL DEFAULT 0,
    "distinctQuestions" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "smoothedAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recentAccuracy" DOUBLE PRECISION,
    "difficultyAdjusted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medianTimeMs" INTEGER,
    "p25TimeMs" INTEGER,
    "p75TimeMs" INTEGER,
    "slowShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "repeatedMistakes" INTEGER NOT NULL DEFAULT 0,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "state" "MasteryState" NOT NULL DEFAULT 'NOT_STARTED',
    "stateReason" TEXT,
    "gateProgress" JSONB,
    "trend" DOUBLE PRECISION,
    "lastPracticedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "retentionDueAt" TIMESTAMP(3),
    "retentionPassedAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSkillState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT,
    "level" "SkillLevel" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "masteryScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "state" "MasteryState" NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasteryMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" "MilestoneKind" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nodeId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'ACTIVE',
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_code_key" ON "Exam"("code");

-- CreateIndex
CREATE INDEX "SyllabusVersion_examId_isActive_idx" ON "SyllabusVersion"("examId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SyllabusVersion_examId_version_key" ON "SyllabusVersion"("examId", "version");

-- CreateIndex
CREATE INDEX "Topic_subjectId_idx" ON "Topic"("subjectId");

-- CreateIndex
CREATE INDEX "Subtopic_topicId_idx" ON "Subtopic"("topicId");

-- CreateIndex
CREATE INDEX "LearningObjective_subtopicId_idx" ON "LearningObjective"("subtopicId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_fingerprint_key" ON "Question"("fingerprint");

-- CreateIndex
CREATE INDEX "Question_topicId_verificationStatus_difficulty_idx" ON "Question"("topicId", "verificationStatus", "difficulty");

-- CreateIndex
CREATE INDEX "Question_subtopicId_idx" ON "Question"("subtopicId");

-- CreateIndex
CREATE INDEX "Question_skillKey_idx" ON "Question"("skillKey");

-- CreateIndex
CREATE INDEX "Question_verificationStatus_idx" ON "Question"("verificationStatus");

-- CreateIndex
CREATE INDEX "ReviewEvent_questionId_idx" ON "ReviewEvent"("questionId");

-- CreateIndex
CREATE INDEX "MockTest_userId_createdAt_idx" ON "MockTest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MockTestQuestion_questionId_idx" ON "MockTestQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "MockTestQuestion_mockTestId_position_key" ON "MockTestQuestion"("mockTestId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MockTestQuestion_mockTestId_questionId_key" ON "MockTestQuestion"("mockTestId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_mockTestId_key" ON "Attempt"("mockTestId");

-- CreateIndex
CREATE INDEX "Attempt_userId_status_idx" ON "Attempt"("userId", "status");

-- CreateIndex
CREATE INDEX "Attempt_userId_submittedAt_idx" ON "Attempt"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "Response_userId_topicId_createdAt_idx" ON "Response"("userId", "topicId", "createdAt");

-- CreateIndex
CREATE INDEX "Response_userId_subtopicId_idx" ON "Response"("userId", "subtopicId");

-- CreateIndex
CREATE INDEX "Response_userId_questionId_idx" ON "Response"("userId", "questionId");

-- CreateIndex
CREATE INDEX "Response_userId_skillKey_idx" ON "Response"("userId", "skillKey");

-- CreateIndex
CREATE UNIQUE INDEX "Response_attemptId_mockTestQuestionId_key" ON "Response"("attemptId", "mockTestQuestionId");

-- CreateIndex
CREATE INDEX "StudentSkillState_userId_state_idx" ON "StudentSkillState"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSkillState_userId_level_nodeId_key" ON "StudentSkillState"("userId", "level", "nodeId");

-- CreateIndex
CREATE INDEX "MasterySnapshot_userId_nodeId_createdAt_idx" ON "MasterySnapshot"("userId", "nodeId", "createdAt");

-- CreateIndex
CREATE INDEX "MasteryMilestone_userId_createdAt_idx" ON "MasteryMilestone"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Recommendation_userId_status_priority_idx" ON "Recommendation"("userId", "status", "priority");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyllabusVersion" ADD CONSTRAINT "SyllabusVersion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtopic" ADD CONSTRAINT "Subtopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperRecord" ADD CONSTRAINT "PaperRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "LearningObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "PaperRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTest" ADD CONSTRAINT "MockTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTest" ADD CONSTRAINT "MockTest_syllabusVersionId_fkey" FOREIGN KEY ("syllabusVersionId") REFERENCES "SyllabusVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTestQuestion" ADD CONSTRAINT "MockTestQuestion_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTestQuestion" ADD CONSTRAINT "MockTestQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_mockTestQuestionId_fkey" FOREIGN KEY ("mockTestQuestionId") REFERENCES "MockTestQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSkillState" ADD CONSTRAINT "StudentSkillState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterySnapshot" ADD CONSTRAINT "MasterySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryMilestone" ADD CONSTRAINT "MasteryMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
