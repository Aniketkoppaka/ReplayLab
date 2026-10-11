-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('NONE', 'JSON', 'TEXT');

-- CreateEnum
CREATE TYPE "AssertionType" AS ENUM ('STATUS_CODE', 'JSON_PATH_VALUE', 'JSON_PATH_EXISTS', 'RESPONSE_TIME_MAX');

-- CreateEnum
CREATE TYPE "MaskAction" AS ENUM ('IGNORE', 'TYPE_MATCH');

-- CreateEnum
CREATE TYPE "ReplayOutcomeStatus" AS ENUM ('SUCCESS', 'HTTP_ERROR', 'TRANSPORT_ERROR', 'TIMEOUT', 'SSRF_BLOCKED', 'ASSERTION_FAILURE');

-- CreateEnum
CREATE TYPE "RunType" AS ENUM ('SINGLE_REPLAY', 'SUITE_EXECUTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_variables" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixtures" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "method" "HttpMethod" NOT NULL,
    "path" TEXT NOT NULL,
    "queryParams" JSONB NOT NULL DEFAULT '{}',
    "headers" JSONB NOT NULL DEFAULT '{}',
    "bodyType" "BodyType" NOT NULL DEFAULT 'NONE',
    "body" JSONB,
    "baselineStatusCode" INTEGER,
    "baselineHeaders" JSONB DEFAULT '{}',
    "baselineBodyType" "BodyType",
    "baselineBody" JSONB,
    "baselineUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_baseline_history" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "bodyType" "BodyType" NOT NULL DEFAULT 'NONE',
    "body" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixture_baseline_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regression_suites" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regression_suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suite_fixtures" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suite_fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suite_assertions" (
    "id" TEXT NOT NULL,
    "suiteFixtureId" TEXT NOT NULL,
    "type" "AssertionType" NOT NULL,
    "path" TEXT,
    "expectedValue" JSONB,
    "maxDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suite_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suite_mask_rules" (
    "id" TEXT NOT NULL,
    "suiteFixtureId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" "MaskAction" NOT NULL DEFAULT 'IGNORE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suite_mask_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "suiteRunId" TEXT,
    "triggeredById" TEXT,
    "status" "ReplayOutcomeStatus" NOT NULL,
    "httpStatusCode" INTEGER,
    "headers" JSONB DEFAULT '{}',
    "bodyType" "BodyType" DEFAULT 'NONE',
    "body" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "diffFound" BOOLEAN NOT NULL DEFAULT false,
    "diffDetails" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suite_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "status" "ReplayOutcomeStatus" NOT NULL,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "passedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "suite_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE INDEX "project_members_projectId_idx" ON "project_members"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "environments_projectId_idx" ON "environments"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "environments_projectId_name_key" ON "environments"("projectId", "name");

-- CreateIndex
CREATE INDEX "environment_variables_environmentId_idx" ON "environment_variables"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "environment_variables_environmentId_key_key" ON "environment_variables"("environmentId", "key");

-- CreateIndex
CREATE INDEX "fixtures_projectId_idx" ON "fixtures"("projectId");

-- CreateIndex
CREATE INDEX "fixtures_projectId_name_idx" ON "fixtures"("projectId", "name");

-- CreateIndex
CREATE INDEX "fixture_baseline_history_fixtureId_idx" ON "fixture_baseline_history"("fixtureId");

-- CreateIndex
CREATE INDEX "regression_suites_projectId_idx" ON "regression_suites"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "regression_suites_projectId_name_key" ON "regression_suites"("projectId", "name");

-- CreateIndex
CREATE INDEX "suite_fixtures_suiteId_order_idx" ON "suite_fixtures"("suiteId", "order");

-- CreateIndex
CREATE INDEX "suite_fixtures_fixtureId_idx" ON "suite_fixtures"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "suite_fixtures_suiteId_fixtureId_key" ON "suite_fixtures"("suiteId", "fixtureId");

-- CreateIndex
CREATE INDEX "suite_assertions_suiteFixtureId_idx" ON "suite_assertions"("suiteFixtureId");

-- CreateIndex
CREATE INDEX "suite_mask_rules_suiteFixtureId_idx" ON "suite_mask_rules"("suiteFixtureId");

-- CreateIndex
CREATE INDEX "replay_runs_projectId_executedAt_idx" ON "replay_runs"("projectId", "executedAt");

-- CreateIndex
CREATE INDEX "replay_runs_fixtureId_executedAt_idx" ON "replay_runs"("fixtureId", "executedAt");

-- CreateIndex
CREATE INDEX "replay_runs_environmentId_idx" ON "replay_runs"("environmentId");

-- CreateIndex
CREATE INDEX "replay_runs_suiteRunId_idx" ON "replay_runs"("suiteRunId");

-- CreateIndex
CREATE INDEX "suite_runs_projectId_startedAt_idx" ON "suite_runs"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "suite_runs_suiteId_startedAt_idx" ON "suite_runs"("suiteId", "startedAt");

-- CreateIndex
CREATE INDEX "suite_runs_environmentId_idx" ON "suite_runs"("environmentId");

-- CreateIndex
CREATE INDEX "audit_logs_projectId_createdAt_idx" ON "audit_logs"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_baseline_history" ADD CONSTRAINT "fixture_baseline_history_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regression_suites" ADD CONSTRAINT "regression_suites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_fixtures" ADD CONSTRAINT "suite_fixtures_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "regression_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_fixtures" ADD CONSTRAINT "suite_fixtures_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_assertions" ADD CONSTRAINT "suite_assertions_suiteFixtureId_fkey" FOREIGN KEY ("suiteFixtureId") REFERENCES "suite_fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_mask_rules" ADD CONSTRAINT "suite_mask_rules_suiteFixtureId_fkey" FOREIGN KEY ("suiteFixtureId") REFERENCES "suite_fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_suiteRunId_fkey" FOREIGN KEY ("suiteRunId") REFERENCES "suite_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_runs" ADD CONSTRAINT "replay_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "regression_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

