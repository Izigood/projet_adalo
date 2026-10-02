import { Entity, EntityIndex, FilterSpec, Query, Relation } from './data-model.js';
import { EntitiesFile, ManifestPath, ProjectManifest, QueriesFile, RolesFile } from './manifest.js';
import { ChoiceSource, Field, FieldUi, FieldValidator, FileOptions } from './field.js';
import {
  Classification,
  ComponentReference,
  IsoDate,
  IsoDateTimeUtc,
  Label,
  Locale,
  ProjectKey,
  ReadableKey,
  SemVer,
  Sha256Hex,
  Uuid7,
} from './keys.js';
import {
  AssetPath,
  Project,
  ProjectVersion,
  SecretRef,
  Theme,
  ThemeTokenValue,
  ThemeTokens,
} from './project.js';
import { Role } from './role.js';
import { Page, PageRoute, PagesIndex, UINode } from './ui.js';
import { Workflow } from './workflow.js';

/**
 * Every schema compiled into a standalone validator, by name. `scripts/generate-validators.ts`
 * turns this registry into `generated/validators.js`; add a schema here to publish it.
 *
 * A schema can be used by another one through `ref('Name')`: it is then compiled once and called.
 */
export const SCHEMAS = {
  // Building blocks
  Uuid7,
  ReadableKey,
  ProjectKey,
  Label,
  SemVer,
  IsoDate,
  IsoDateTimeUtc,
  ComponentReference,
  Sha256Hex,
  Locale,
  Classification,
  // Data model
  FieldUi,
  FieldValidator,
  ChoiceSource,
  FileOptions,
  Field,
  EntityIndex,
  Entity,
  Relation,
  FilterSpec,
  Query,
  // Project
  SecretRef,
  Project,
  ProjectVersion,
  ThemeTokenValue,
  ThemeTokens,
  AssetPath,
  Theme,
  Role,
  // Pages
  UINode,
  PageRoute,
  Page,
  // Workflows
  Workflow,
  // Package files
  ManifestPath,
  ProjectManifest,
  EntitiesFile,
  RolesFile,
  QueriesFile,
  PagesIndex,
} as const;

export type SchemaName = keyof typeof SCHEMAS;
