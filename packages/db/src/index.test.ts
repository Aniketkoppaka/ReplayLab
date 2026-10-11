import { describe, it, expect } from 'vitest';
import {
  DB_PACKAGE_VERSION,
  PrismaClient,
  Prisma,
  ProjectRole,
  HttpMethod,
  ReplayOutcomeStatus,
  AssertionType,
  MaskAction,
} from './index.js';

describe('db package and Prisma schema contract suite', () => {
  it('exports db package version and PrismaClient constructor', () => {
    expect(DB_PACKAGE_VERSION).toBe('0.1.0');
    expect(PrismaClient).toBeDefined();
    expect(typeof PrismaClient).toBe('function');
  });

  it('exports all expected Prisma model metadata and enums', () => {
    // Enums exported at package top-level
    expect(ProjectRole).toBeDefined();
    expect(ProjectRole.OWNER).toBe('OWNER');
    expect(ProjectRole.EDITOR).toBe('EDITOR');
    expect(ProjectRole.VIEWER).toBe('VIEWER');

    expect(HttpMethod).toBeDefined();
    expect(HttpMethod.GET).toBe('GET');
    expect(HttpMethod.POST).toBe('POST');

    expect(ReplayOutcomeStatus).toBeDefined();
    expect(ReplayOutcomeStatus.SUCCESS).toBe('SUCCESS');
    expect(ReplayOutcomeStatus.SSRF_BLOCKED).toBe('SSRF_BLOCKED');
    expect(ReplayOutcomeStatus.TRANSPORT_ERROR).toBe('TRANSPORT_ERROR');

    expect(AssertionType).toBeDefined();
    expect(AssertionType.STATUS_CODE).toBe('STATUS_CODE');
    expect(AssertionType.JSON_PATH_VALUE).toBe('JSON_PATH_VALUE');

    expect(MaskAction).toBeDefined();
    expect(MaskAction.IGNORE).toBe('IGNORE');
    expect(MaskAction.TYPE_MATCH).toBe('TYPE_MATCH');

    // Models exposed on PrismaClient DMMF
    const dmmf = Prisma.dmmf;
    const modelNames = dmmf.datamodel.models.map((m) => m.name);

    expect(modelNames).toContain('User');
    expect(modelNames).toContain('Project');
    expect(modelNames).toContain('ProjectMember');
    expect(modelNames).toContain('Environment');
    expect(modelNames).toContain('EnvironmentVariable');
    expect(modelNames).toContain('Fixture');
    expect(modelNames).toContain('FixtureBaselineHistory');
    expect(modelNames).toContain('RegressionSuite');
    expect(modelNames).toContain('SuiteFixture');
    expect(modelNames).toContain('SuiteAssertion');
    expect(modelNames).toContain('SuiteMaskRule');
    expect(modelNames).toContain('ReplayRun');
    expect(modelNames).toContain('SuiteRun');
    expect(modelNames).toContain('AuditLog');
  });

  describe('Model Relationships and Field Invariants', () => {
    const dmmf = Prisma.dmmf;

    it('enforces cascade deletion on Project-owned resources', () => {
      const projectMember = dmmf.datamodel.models.find((m) => m.name === 'ProjectMember');
      const projectRel = projectMember?.fields.find((f) => f.name === 'project');
      expect(projectRel?.relationOnDelete).toBe('Cascade');

      const envModel = dmmf.datamodel.models.find((m) => m.name === 'Environment');
      const envProjRel = envModel?.fields.find((f) => f.name === 'project');
      expect(envProjRel?.relationOnDelete).toBe('Cascade');

      const fixtureModel = dmmf.datamodel.models.find((m) => m.name === 'Fixture');
      const fixProjRel = fixtureModel?.fields.find((f) => f.name === 'project');
      expect(fixProjRel?.relationOnDelete).toBe('Cascade');

      const suiteModel = dmmf.datamodel.models.find((m) => m.name === 'RegressionSuite');
      const suiteProjRel = suiteModel?.fields.find((f) => f.name === 'project');
      expect(suiteProjRel?.relationOnDelete).toBe('Cascade');
    });

    it('enforces unique constraints for membership and environment naming', () => {
      const projectMember = dmmf.datamodel.models.find((m) => m.name === 'ProjectMember');
      expect(projectMember?.uniqueFields).toContainEqual(['projectId', 'userId']);

      const envModel = dmmf.datamodel.models.find((m) => m.name === 'Environment');
      expect(envModel?.uniqueFields).toContainEqual(['projectId', 'name']);

      const envVarModel = dmmf.datamodel.models.find((m) => m.name === 'EnvironmentVariable');
      expect(envVarModel?.uniqueFields).toContainEqual(['environmentId', 'key']);
    });

    it('supports secret encryption fields in EnvironmentVariable', () => {
      const envVarModel = dmmf.datamodel.models.find((m) => m.name === 'EnvironmentVariable');
      const fields = envVarModel?.fields.map((f) => f.name);
      expect(fields).toContain('value');
      expect(fields).toContain('isSecret');
      expect(fields).toContain('secretIv');
      expect(fields).toContain('secretAuthTag');
    });

    it('maintains explicit baseline history model for historical snapshots', () => {
      const baselineHistory = dmmf.datamodel.models.find(
        (m) => m.name === 'FixtureBaselineHistory'
      );
      expect(baselineHistory).toBeDefined();
      const fields = baselineHistory?.fields.map((f) => f.name);
      expect(fields).toContain('fixtureId');
      expect(fields).toContain('statusCode');
      expect(fields).toContain('headers');
      expect(fields).toContain('body');
      expect(fields).toContain('createdAt');
    });
  });
});
