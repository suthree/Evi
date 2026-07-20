import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { deriveContextBudget, type ContextBudgetSummary } from "../../core/src/context_budget.js";

export const DEFAULT_SHARED_STATE_ROOT = "~/.local-runtime/state/evi";

const homeRecordSchema = z.object({
  type: z.literal("home"),
  root: z.string().default("~/.local-runtime")
});

const stateRecordSchema = z.object({
  type: z.literal("state"),
  root: z.string().default(DEFAULT_SHARED_STATE_ROOT)
});

const runtimeRecordSchema = z.object({
  type: z.literal("runtime"),
  promotion_enabled: z.boolean().default(true),
  structured_output: z.boolean().default(true),
  review_tick_enabled: z.boolean().default(false),
  review_tick_interval_ms: z.number().int().positive().default(30 * 60 * 1000),
  review_tick_limit: z.number().int().positive().default(20),
  content_daily_enabled: z.boolean().default(false),
  content_daily_interval_ms: z.number().int().positive().default(60 * 60 * 1000),
  content_daily_dry_run: z.boolean().default(true),
  content_daily_preflight: z.boolean().default(false),
  content_daily_topic: z.string().min(1).default("daily AI news and AI stock hotspots"),
  content_daily_source_urls: z.array(z.string().url()).default([]),
  content_daily_tickers: z.array(z.string().min(1)).default([]),
  content_daily_image_model: z.string().min(1).optional(),
  content_daily_publish_enabled: z.boolean().default(false),
  content_daily_external_write_confirmed: z.boolean().default(false),
  content_daily_publish_adapter: z.enum(["xiaohongshu-mcp"]).default("xiaohongshu-mcp"),
  content_daily_publish_server_url: z.string().url().default("http://localhost:18060/mcp"),
  content_daily_publish_tool: z.string().min(1).default("publish_content"),
  content_feedback_refresh_enabled: z.boolean().default(false),
  content_feedback_refresh_interval_ms: z.number().int().positive().default(60 * 60 * 1000),
  content_feedback_refresh_limit: z.number().int().positive().default(10),
  content_feedback_refresh_min_follow_up_age_ms: z.number().int().nonnegative().default(6 * 60 * 60 * 1000),
  content_feedback_refresh_server_url: z.string().url().default("http://localhost:18060/mcp"),
  content_creator_metrics_enabled: z.boolean().default(false),
  content_creator_metrics_interval_ms: z.number().int().positive().default(60 * 60 * 1000),
  content_creator_metrics_limit: z.number().int().positive().default(10),
  content_creator_metrics_creator_url: z.string().url().default("https://creator.xiaohongshu.com/new/note-manager"),
  content_creator_metrics_browser_session_name: z.string().min(1).default("runtime-creator-metrics"),
  content_creator_metrics_browser_auto_connect: z.boolean().default(false),
  content_creator_metrics_browser_cdp_port: z.string().min(1).optional()
});

const vaultRecordSchema = z.object({
  type: z.literal("vault"),
  mode: z.enum(["repo-local", "user"]).optional(),
  root: z.string().optional(),
  active_root: z.string().optional(),
  seed_roots: z.array(z.string()).optional(),
  project_roots: z.array(z.string()).optional()
});

const activeModelRecordSchema = z.object({
  type: z.literal("active_model"),
  model_id: z.string().min(1)
});

const activeImageModelRecordSchema = z.object({
  type: z.literal("active_image_model"),
  model_id: z.string().min(1)
});

const activeChannelRecordSchema = z.object({
  type: z.literal("active_channel"),
  channel_id: z.string().min(1)
});

const activeScenarioRecordSchema = z.object({
  type: z.literal("active_scenario"),
  scenario_id: z.string().min(1)
});

const goalCognitionRecordSchema = z.object({
  type: z.literal("goal_cognition"),
  provider: z.enum(["active_model", "codex_cli"]).default("active_model"),
  service_tier: z.literal("fast").default("fast"),
  credential_store: z.enum(["auto", "file", "keyring"]).default("auto"),
  model: z.string().min(1).optional(),
  reasoning_effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  timeout_ms: z.number().int().min(1_000).max(600_000).default(120000),
  max_output_chars: z.number().int().min(1_024).max(1_000_000).default(64000)
});

const modelRecordSchema = z.object({
  type: z.literal("model"),
  id: z.string().min(1),
  provider: z.literal("openai-compatible"),
  api: z.enum(["chat_completions", "responses"]).default("chat_completions"),
  base_url: z.string().url(),
  model: z.string().min(1),
  auth_id: z.string().min(1),
  reasoning_effort: z.string().optional(),
  context_window_tokens: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().default(2400),
  timeout_ms: z.number().int().positive().default(120000),
  store: z.boolean().default(false),
  json_object: z.boolean().default(true)
});

const imageModelRecordSchema = z.object({
  type: z.literal("image_model"),
  id: z.string().min(1),
  provider: z.literal("openai-compatible"),
  api: z.literal("images_generations").default("images_generations"),
  base_url: z.string().url(),
  model: z.string().min(1),
  auth_id: z.string().min(1),
  size: z.string().optional(),
  quality: z.string().optional(),
  output_format: z.enum(["png", "jpeg", "webp"]).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  background: z.string().optional(),
  moderation: z.string().optional(),
  timeout_ms: z.number().int().positive().default(120000)
});

const authRecordSchema = z.object({
  type: z.literal("api_key"),
  id: z.string().min(1),
  env: z.string().optional(),
  key: z.string().optional()
});

const appSecretAuthRecordSchema = z.object({
  type: z.literal("app_secret"),
  id: z.string().min(1),
  app_id: z.string().optional(),
  app_id_env: z.string().optional(),
  app_secret: z.string().optional(),
  app_secret_env: z.string().optional()
});

type HomeRecord = z.infer<typeof homeRecordSchema>;
type StateRecord = z.infer<typeof stateRecordSchema>;
type RuntimeRecord = z.infer<typeof runtimeRecordSchema>;
type VaultRecord = z.infer<typeof vaultRecordSchema>;
type ActiveModelRecord = z.infer<typeof activeModelRecordSchema>;
type ActiveImageModelRecord = z.infer<typeof activeImageModelRecordSchema>;
type ActiveChannelRecord = z.infer<typeof activeChannelRecordSchema>;
type ActiveScenarioRecord = z.infer<typeof activeScenarioRecordSchema>;
type GoalCognitionRecord = z.infer<typeof goalCognitionRecordSchema>;
type ModelRecord = z.infer<typeof modelRecordSchema>;
type ImageModelRecord = z.infer<typeof imageModelRecordSchema>;
type AuthRecord = z.infer<typeof authRecordSchema>;
export type ApiKeyAuthRecord = z.infer<typeof authRecordSchema>;
export type AppSecretAuthRecord = z.infer<typeof appSecretAuthRecordSchema>;
export type GoalCognitionProvider = GoalCognitionRecord["provider"];
export type GoalCognitionConfig = GoalCognitionRecord & {
  source_ref: string;
};
export type ImageModelConfig = ImageModelRecord & {
  api_key: string;
};

export interface ConfigSelectors {
  configDir: string;
  homeConfigDir: string;
  stateRoot: string;
  homeRoot: string;
  activeModelId: string | null;
  activeImageModelId: string | null;
  activeChannelId: string | null;
  activeScenarioId: string | null;
}

export interface RuntimeConfig {
  home: {
    root: string;
  };
  state: {
    root: string;
  };
  runtime: {
    promotion_enabled: boolean;
    structured_output: boolean;
    review_tick_enabled: boolean;
    review_tick_interval_ms: number;
    review_tick_limit: number;
    content_daily_enabled: boolean;
    content_daily_interval_ms: number;
    content_daily_dry_run: boolean;
    content_daily_preflight: boolean;
    content_daily_topic: string;
    content_daily_source_urls: string[];
    content_daily_tickers: string[];
    content_daily_image_model?: string;
    content_daily_publish_enabled: boolean;
    content_daily_external_write_confirmed: boolean;
    content_daily_publish_adapter: "xiaohongshu-mcp";
    content_daily_publish_server_url: string;
    content_daily_publish_tool: string;
    content_feedback_refresh_enabled: boolean;
    content_feedback_refresh_interval_ms: number;
    content_feedback_refresh_limit: number;
    content_feedback_refresh_min_follow_up_age_ms: number;
    content_feedback_refresh_server_url: string;
    content_creator_metrics_enabled: boolean;
    content_creator_metrics_interval_ms: number;
    content_creator_metrics_limit: number;
    content_creator_metrics_creator_url: string;
    content_creator_metrics_browser_session_name: string;
    content_creator_metrics_browser_auto_connect: boolean;
    content_creator_metrics_browser_cdp_port?: string;
  };
  vault: {
    mode: "repo-local" | "user";
    root: string;
    active_root: string;
    seed_roots: string[];
    project_roots: string[];
  };
  model: ModelRecord & {
    api_key: string;
  };
}

export interface ConfigLoadOptions {
  configDir?: string;
  stateRoot?: string;
  skipAuth?: boolean;
  modelId?: string;
}

export interface ConfigSourceOptions {
  configDir?: string;
  stateRoot?: string;
  env?: NodeJS.ProcessEnv;
}

export type ConfigSummaryLayer = "repo" | "local" | "home" | "state" | "default";

export interface RuntimeConfigSummary {
  action: "config-summary";
  created_at: string;
  config_dir: string;
  home_config_dir: string;
  home_root: string;
  state_root: string;
  runtime: {
    promotion_enabled: boolean;
    structured_output: boolean;
    review_tick_enabled: boolean;
    review_tick_interval_ms: number;
    review_tick_limit: number;
    content_daily_enabled: boolean;
    content_daily_interval_ms: number;
    content_daily_dry_run: boolean;
    content_daily_preflight: boolean;
    content_daily_topic: string;
    content_daily_source_urls: string[];
    content_daily_tickers: string[];
    content_daily_image_model?: string;
    content_daily_publish_enabled: boolean;
    content_daily_external_write_confirmed: boolean;
    content_daily_publish_adapter: "xiaohongshu-mcp";
    content_daily_publish_server_url: string;
    content_daily_publish_tool: string;
    content_feedback_refresh_enabled: boolean;
    content_feedback_refresh_interval_ms: number;
    content_feedback_refresh_limit: number;
    content_feedback_refresh_min_follow_up_age_ms: number;
    content_feedback_refresh_server_url: string;
    content_creator_metrics_enabled: boolean;
    content_creator_metrics_interval_ms: number;
    content_creator_metrics_limit: number;
    content_creator_metrics_creator_url: string;
    content_creator_metrics_browser_session_name: string;
    content_creator_metrics_browser_auto_connect: boolean;
    content_creator_metrics_browser_cdp_port?: string;
    source_ref: string;
    defaulted_fields: string[];
  };
  goal_cognition: {
    provider: GoalCognitionProvider;
    service_tier?: "fast";
    credential_store?: "auto" | "file" | "keyring";
    source_ref: string;
    readiness: "runtime_check_required" | "missing_active_model_selector" | "missing_active_model";
    model?: string;
    reasoning_effort?: string;
    timeout_ms: number;
    max_output_chars: number;
  };
  active_model: {
    id: string | null;
    selector_ref?: string;
    source_ref?: string;
    provider?: string;
    api?: string;
    model?: string;
    base_url?: string;
    auth_id?: string;
    context_window_tokens?: number;
    max_output_tokens?: number;
    context_budget?: ContextBudgetSummary | null;
  };
  active_image_model: {
    id: string | null;
    selector_ref?: string;
    source_ref?: string;
    provider?: string;
    api?: string;
    model?: string;
    base_url?: string;
    auth_id?: string;
    size?: string;
    quality?: string;
    output_format?: string;
  };
  active_channel: {
    id: string | null;
    selector_ref?: string;
    source_ref?: string;
    kind?: string;
    transport?: string;
    mode?: string;
    auth_id?: string;
    followup_queue_size?: number;
  };
  active_scenario: {
    id: string | null;
    selector_ref?: string;
    source_ref?: string;
    channel_id?: string;
    model_id?: string;
    discipline?: string;
    reply_policy?: string;
    concurrency?: string;
  };
  vault: {
    mode: "repo-local" | "user";
    root: string;
    active_root: string;
    seed_roots: string[];
    project_roots: string[];
    source_ref: string;
  };
  refs: string[];
  restart_guidance: string;
  boundary: string;
}

export interface ImageModelConfigLoadOptions extends ConfigSourceOptions {
  imageModelId?: string;
  skipAuth?: boolean;
}

export type AuthCredentialSource = "direct" | "env" | "missing";

export interface AuthFieldDiagnostic {
  source: AuthCredentialSource;
  direct_configured: boolean;
  env_configured: boolean;
  env_name?: string;
  env_present?: boolean;
}

export interface ApiKeyAuthDiagnostic {
  kind: "api_key";
  auth_id: string;
  source_ref: string | null;
  resolved: boolean;
  key: AuthFieldDiagnostic;
}

export interface AppSecretAuthDiagnostic {
  kind: "app_secret";
  auth_id: string;
  source_ref: string | null;
  resolved: boolean;
  app_id: AuthFieldDiagnostic;
  app_secret: AuthFieldDiagnostic;
}

export interface RuntimeAuthDiagnostics {
  action: "auth-diagnostics";
  created_at: string;
  active_model_auth: ApiKeyAuthDiagnostic | null;
  active_channel_auth: ApiKeyAuthDiagnostic | AppSecretAuthDiagnostic | null;
  refs: string[];
  boundary: string;
}

export interface RuntimeConfigUpdatePatch {
  review_tick_enabled?: boolean;
  review_tick_interval_ms?: number;
  review_tick_limit?: number;
  content_daily_enabled?: boolean;
  content_daily_interval_ms?: number;
  content_daily_dry_run?: boolean;
  content_daily_preflight?: boolean;
  content_daily_topic?: string;
  content_daily_source_urls?: string[];
  content_daily_tickers?: string[];
  content_daily_image_model?: string | null;
  content_daily_publish_enabled?: boolean;
  content_daily_external_write_confirmed?: boolean;
  content_daily_publish_adapter?: "xiaohongshu-mcp";
  content_daily_publish_server_url?: string;
  content_daily_publish_tool?: string;
  content_feedback_refresh_enabled?: boolean;
  content_feedback_refresh_interval_ms?: number;
  content_feedback_refresh_limit?: number;
  content_feedback_refresh_min_follow_up_age_ms?: number;
  content_feedback_refresh_server_url?: string;
  content_creator_metrics_enabled?: boolean;
  content_creator_metrics_interval_ms?: number;
  content_creator_metrics_limit?: number;
  content_creator_metrics_creator_url?: string;
  content_creator_metrics_browser_session_name?: string;
  content_creator_metrics_browser_auto_connect?: boolean;
  content_creator_metrics_browser_cdp_port?: string | null;
}

export interface UpdateRuntimeConfigOptions extends ConfigSourceOptions {
  patch: RuntimeConfigUpdatePatch;
  confirmedExternalWrite?: boolean;
}

export interface RuntimeAuthDiagnosticsOptions extends ConfigSourceOptions {
  channelId?: string;
}

export interface RuntimeConfigUpdateResult {
  action: "runtime-config-update";
  ok: true;
  created_at: string;
  config_file: string;
  appended_ref: string;
  before: RuntimeConfigSummary["runtime"];
  after: RuntimeConfigSummary["runtime"];
  changed_fields: string[];
  restart_required: boolean;
  restart_command: string;
  boundary: string;
}

export async function loadConfigSelectors(options: ConfigSourceOptions = {}): Promise<ConfigSelectors> {
  const configDir = resolve(options.configDir ?? "config");
  const repoConfigRaw = await readRequired(configDir, "config.jsonl");
  const localConfigRaw = await readOptional(configDir, localConfigFile("config.jsonl"));
  const homeRecords = parseJsonl<HomeRecord>(
    joinJsonl([repoConfigRaw, localConfigRaw]),
    homeRecordSchema,
    "home"
  );
  const homeRoot = expandConfigPath(process.env.LOCAL_RUNTIME_HOME ?? homeRecords.at(-1)?.root ?? "~/.local-runtime", undefined, false);
  const homeConfigDir = resolve(homeRoot, "config");
  const configRaw = joinJsonl([
    repoConfigRaw,
    localConfigRaw,
    await readOptional(homeConfigDir, "config.jsonl")
  ]);
  const stateRecords = parseJsonl<StateRecord>(
    configRaw,
    stateRecordSchema,
    "state"
  );
  const activeModelRecords = parseJsonl<ActiveModelRecord>(
    configRaw,
    activeModelRecordSchema,
    "active_model"
  );
  const activeImageModelRecords = parseJsonl<ActiveImageModelRecord>(
    configRaw,
    activeImageModelRecordSchema,
    "active_image_model"
  );
  const activeChannelRecords = parseJsonl<ActiveChannelRecord>(
    configRaw,
    activeChannelRecordSchema,
    "active_channel"
  );
  const activeScenarioRecords = parseJsonl<ActiveScenarioRecord>(
    configRaw,
    activeScenarioRecordSchema,
    "active_scenario"
  );

  const stateRoot = expandConfigPath(
    options.stateRoot ?? stateRecords.at(-1)?.root ?? DEFAULT_SHARED_STATE_ROOT,
    homeRoot,
    false
  );
  return {
    configDir,
    homeConfigDir,
    stateRoot,
    homeRoot,
    activeModelId: activeModelRecords.at(-1)?.model_id ?? null,
    activeImageModelId: activeImageModelRecords.at(-1)?.model_id ?? null,
    activeChannelId: activeChannelRecords.at(-1)?.channel_id ?? null,
    activeScenarioId: activeScenarioRecords.at(-1)?.scenario_id ?? null
  };
}

export async function loadConfig(options: ConfigLoadOptions = {}): Promise<RuntimeConfig> {
  const selectors = await loadConfigSelectors(options);
  const configRaw = await readLayeredConfig(selectors, "config.jsonl");
  const vaultRecords = parseJsonl<VaultRecord>(
    configRaw,
    vaultRecordSchema,
    "vault"
  );
  const runtimeRecords = parseJsonl<RuntimeRecord>(
    configRaw,
    runtimeRecordSchema,
    "runtime"
  );
  const activeModelRecords = parseJsonl<ActiveModelRecord>(
    configRaw,
    activeModelRecordSchema,
    "active_model"
  );
  const models = parseJsonl<ModelRecord>(
    await readLayeredConfig(selectors, "models.jsonl"),
    modelRecordSchema,
    "model"
  );

  const stateRoot = selectors.stateRoot;
  const authRecords = await loadAuthRecords<AuthRecord>(selectors, authRecordSchema, "api_key");

  const activeModelId = options.modelId ?? activeModelRecords.at(-1)?.model_id;
  if (!activeModelId) {
    throw new Error("No active_model record found in config/config.jsonl");
  }
  const model = [...models].reverse().find((item) => item.id === activeModelId);
  if (!model) {
    throw new Error(`Active model not found in configured models.jsonl layers: ${activeModelId}`);
  }

  const auth = [...authRecords].reverse().find((item) => item.id === model.auth_id);
  if (!auth && !options.skipAuth) {
    throw new Error(`Auth record not found for model ${model.id}: ${model.auth_id}`);
  }
  const apiKey = options.skipAuth ? "" : resolveApiKey(requiredAuth(auth, model.auth_id));

  const runtime = runtimeRecords.at(-1) ?? runtimeRecordSchema.parse({ type: "runtime" });
  const vault = resolveVaultConfig(vaultRecords.at(-1), selectors.homeRoot);
  return {
    home: {
      root: selectors.homeRoot
    },
    state: {
      root: stateRoot
    },
    runtime: {
      promotion_enabled: runtime.promotion_enabled,
      structured_output: runtime.structured_output,
      review_tick_enabled: runtime.review_tick_enabled,
      review_tick_interval_ms: runtime.review_tick_interval_ms,
      review_tick_limit: runtime.review_tick_limit,
      content_daily_enabled: runtime.content_daily_enabled,
      content_daily_interval_ms: runtime.content_daily_interval_ms,
      content_daily_dry_run: runtime.content_daily_dry_run,
      content_daily_preflight: runtime.content_daily_preflight,
      content_daily_topic: runtime.content_daily_topic,
      content_daily_source_urls: runtime.content_daily_source_urls,
      content_daily_tickers: runtime.content_daily_tickers,
      content_daily_image_model: runtime.content_daily_image_model,
      content_daily_publish_enabled: runtime.content_daily_publish_enabled,
      content_daily_external_write_confirmed: runtime.content_daily_external_write_confirmed,
      content_daily_publish_adapter: runtime.content_daily_publish_adapter,
      content_daily_publish_server_url: runtime.content_daily_publish_server_url,
      content_daily_publish_tool: runtime.content_daily_publish_tool,
      content_feedback_refresh_enabled: runtime.content_feedback_refresh_enabled,
      content_feedback_refresh_interval_ms: runtime.content_feedback_refresh_interval_ms,
      content_feedback_refresh_limit: runtime.content_feedback_refresh_limit,
      content_feedback_refresh_min_follow_up_age_ms: runtime.content_feedback_refresh_min_follow_up_age_ms,
      content_feedback_refresh_server_url: runtime.content_feedback_refresh_server_url,
      content_creator_metrics_enabled: runtime.content_creator_metrics_enabled,
      content_creator_metrics_interval_ms: runtime.content_creator_metrics_interval_ms,
      content_creator_metrics_limit: runtime.content_creator_metrics_limit,
      content_creator_metrics_creator_url: runtime.content_creator_metrics_creator_url,
      content_creator_metrics_browser_session_name: runtime.content_creator_metrics_browser_session_name,
      content_creator_metrics_browser_auto_connect: runtime.content_creator_metrics_browser_auto_connect,
      content_creator_metrics_browser_cdp_port: runtime.content_creator_metrics_browser_cdp_port
    },
    vault: {
      mode: vault.mode,
      root: vault.root,
      active_root: vault.active_root,
      seed_roots: vault.seed_roots,
      project_roots: vault.project_roots
    },
    model: {
      ...model,
      api_key: apiKey
    }
  };
}

export async function loadGoalCognitionConfig(options: ConfigSourceOptions = {}): Promise<GoalCognitionConfig> {
  const selectors = await loadConfigSelectors(options);
  const records = parseJsonlWithRefs(
    await readConfigSourceLayers(selectors, "config.jsonl"),
    goalCognitionRecordSchema,
    "goal_cognition"
  );
  const selected = records.at(-1);
  return {
    ...(selected?.value ?? goalCognitionRecordSchema.parse({
      type: "goal_cognition",
      provider: "active_model"
    })),
    source_ref: selected?.ref ?? "default:goal_cognition"
  };
}

export async function loadImageModelConfig(options: ImageModelConfigLoadOptions = {}): Promise<ImageModelConfig> {
  const selectors = await loadConfigSelectors(options);
  const configRaw = await readLayeredConfig(selectors, "config.jsonl");
  const activeImageModelRecords = parseJsonl<ActiveImageModelRecord>(
    configRaw,
    activeImageModelRecordSchema,
    "active_image_model"
  );
  const imageModels = parseJsonl<ImageModelRecord>(
    await readLayeredConfig(selectors, "models.jsonl"),
    imageModelRecordSchema,
    "image_model"
  );
  const activeImageModelId = options.imageModelId ?? activeImageModelRecords.at(-1)?.model_id;
  if (!activeImageModelId) {
    throw new Error("No active_image_model record found in config/config.jsonl");
  }
  const imageModel = [...imageModels].reverse().find((item) => item.id === activeImageModelId);
  if (!imageModel) {
    throw new Error(`Active image model not found in configured models.jsonl layers: ${activeImageModelId}`);
  }

  const authRecords = await loadAuthRecords<AuthRecord>(selectors, authRecordSchema, "api_key");
  const auth = [...authRecords].reverse().find((item) => item.id === imageModel.auth_id);
  if (!auth && !options.skipAuth) {
    throw new Error(`Auth record not found for image model ${imageModel.id}: ${imageModel.auth_id}`);
  }
  const apiKey = options.skipAuth ? "" : resolveApiKey(requiredAuth(auth, imageModel.auth_id));
  return {
    ...imageModel,
    api_key: apiKey
  };
}

export async function loadRuntimeConfigSummary(options: ConfigSourceOptions = {}): Promise<RuntimeConfigSummary> {
  const selectors = await loadConfigSelectors(options);
  const configLayers = await readConfigSourceLayers(selectors, "config.jsonl");
  const modelLayers = await readConfigSourceLayers(selectors, "models.jsonl");
  const settingLayers = await readConfigSourceLayers(selectors, "settings.jsonl");

  const runtimeRecords = parseJsonlWithRefs(configLayers, runtimeRecordSchema, "runtime");
  const vaultRecords = parseJsonlWithRefs(configLayers, vaultRecordSchema, "vault");
  const activeModelRecords = parseJsonlWithRefs(configLayers, activeModelRecordSchema, "active_model");
  const activeImageModelRecords = parseJsonlWithRefs(configLayers, activeImageModelRecordSchema, "active_image_model");
  const activeChannelRecords = parseJsonlWithRefs(configLayers, activeChannelRecordSchema, "active_channel");
  const activeScenarioRecords = parseJsonlWithRefs(configLayers, activeScenarioRecordSchema, "active_scenario");
  const goalCognitionRecords = parseJsonlWithRefs(configLayers, goalCognitionRecordSchema, "goal_cognition");
  const modelRecords = parseJsonlWithRefs(modelLayers, modelRecordSchema, "model");
  const imageModelRecords = parseJsonlWithRefs(modelLayers, imageModelRecordSchema, "image_model");
  const channelRecords = parseRawJsonlWithRefs(settingLayers, "channel");
  const scenarioRecords = parseRawJsonlWithRefs(settingLayers, "scenario");

  const runtimeRecord = runtimeRecords.at(-1);
  const runtime = runtimeRecord?.value ?? runtimeRecordSchema.parse({ type: "runtime" });
  const runtimeSourceRef = runtimeRecord?.ref ?? "default:runtime";
  const runtimeRaw = runtimeRecord?.raw ?? {};
  const vaultRecord = vaultRecords.at(-1);
  const vault = resolveVaultConfig(vaultRecord?.value, selectors.homeRoot);
  const activeModel = activeModelRecords.at(-1);
  const activeImageModel = activeImageModelRecords.at(-1);
  const activeChannel = activeChannelRecords.at(-1);
  const activeScenario = activeScenarioRecords.at(-1);
  const goalCognition = goalCognitionRecords.at(-1);
  const goalCognitionValue = goalCognition?.value ?? goalCognitionRecordSchema.parse({
    type: "goal_cognition",
    provider: "active_model"
  });
  const model = activeModel
    ? [...modelRecords].reverse().find((item) => item.value.id === activeModel.value.model_id)
    : undefined;
  const imageModel = activeImageModel
    ? [...imageModelRecords].reverse().find((item) => item.value.id === activeImageModel.value.model_id)
    : undefined;
  const channel = activeChannel
    ? [...channelRecords].reverse().find((item) => stringField(item.raw, "id") === activeChannel.value.channel_id)
    : undefined;
  const scenario = activeScenario
    ? [...scenarioRecords].reverse().find((item) => stringField(item.raw, "id") === activeScenario.value.scenario_id)
    : undefined;

  const refs = uniqueStrings([
    runtimeSourceRef,
    vaultRecord?.ref,
    activeModel?.ref,
    model?.ref,
    activeImageModel?.ref,
    imageModel?.ref,
    activeChannel?.ref,
    channel?.ref,
    activeScenario?.ref,
    scenario?.ref,
    goalCognition?.ref
  ]);

  return {
    action: "config-summary",
    created_at: new Date().toISOString(),
    config_dir: selectors.configDir,
    home_config_dir: selectors.homeConfigDir,
    home_root: selectors.homeRoot,
    state_root: selectors.stateRoot,
    runtime: {
      promotion_enabled: runtime.promotion_enabled,
      structured_output: runtime.structured_output,
      review_tick_enabled: runtime.review_tick_enabled,
      review_tick_interval_ms: runtime.review_tick_interval_ms,
      review_tick_limit: runtime.review_tick_limit,
      content_daily_enabled: runtime.content_daily_enabled,
      content_daily_interval_ms: runtime.content_daily_interval_ms,
      content_daily_dry_run: runtime.content_daily_dry_run,
      content_daily_preflight: runtime.content_daily_preflight,
      content_daily_topic: runtime.content_daily_topic,
      content_daily_source_urls: runtime.content_daily_source_urls,
      content_daily_tickers: runtime.content_daily_tickers,
      content_daily_image_model: runtime.content_daily_image_model,
      content_daily_publish_enabled: runtime.content_daily_publish_enabled,
      content_daily_external_write_confirmed: runtime.content_daily_external_write_confirmed,
      content_daily_publish_adapter: runtime.content_daily_publish_adapter,
      content_daily_publish_server_url: runtime.content_daily_publish_server_url,
      content_daily_publish_tool: runtime.content_daily_publish_tool,
      content_feedback_refresh_enabled: runtime.content_feedback_refresh_enabled,
      content_feedback_refresh_interval_ms: runtime.content_feedback_refresh_interval_ms,
      content_feedback_refresh_limit: runtime.content_feedback_refresh_limit,
      content_feedback_refresh_min_follow_up_age_ms: runtime.content_feedback_refresh_min_follow_up_age_ms,
      content_feedback_refresh_server_url: runtime.content_feedback_refresh_server_url,
      content_creator_metrics_enabled: runtime.content_creator_metrics_enabled,
      content_creator_metrics_interval_ms: runtime.content_creator_metrics_interval_ms,
      content_creator_metrics_limit: runtime.content_creator_metrics_limit,
      content_creator_metrics_creator_url: runtime.content_creator_metrics_creator_url,
      content_creator_metrics_browser_session_name: runtime.content_creator_metrics_browser_session_name,
      content_creator_metrics_browser_auto_connect: runtime.content_creator_metrics_browser_auto_connect,
      content_creator_metrics_browser_cdp_port: runtime.content_creator_metrics_browser_cdp_port,
      source_ref: runtimeSourceRef,
      defaulted_fields: runtimeDefaultedFields(runtimeRaw)
    },
    goal_cognition: {
      provider: goalCognitionValue.provider,
      ...(goalCognitionValue.provider === "codex_cli" ? {
        service_tier: goalCognitionValue.service_tier,
        credential_store: goalCognitionValue.credential_store
      } : {}),
      source_ref: goalCognition?.ref ?? "default:goal_cognition",
      readiness: goalCognitionValue.provider === "codex_cli"
        ? "runtime_check_required"
        : !activeModel
          ? "missing_active_model_selector"
          : !model
            ? "missing_active_model"
            : "runtime_check_required",
      ...(goalCognitionValue.model ? { model: goalCognitionValue.model } : {}),
      ...(goalCognitionValue.reasoning_effort ? { reasoning_effort: goalCognitionValue.reasoning_effort } : {}),
      timeout_ms: goalCognitionValue.timeout_ms,
      max_output_chars: goalCognitionValue.max_output_chars
    },
    active_model: {
      id: activeModel?.value.model_id ?? null,
      selector_ref: activeModel?.ref,
      source_ref: model?.ref,
      provider: model?.value.provider,
      api: model?.value.api,
      model: model?.value.model,
      base_url: model?.value.base_url,
      auth_id: model?.value.auth_id,
      context_window_tokens: model?.value.context_window_tokens,
      max_output_tokens: model?.value.max_output_tokens,
      context_budget: deriveContextBudget({
        model_id: activeModel?.value.model_id ?? null,
        model: model?.value.model,
        source_ref: model?.ref,
        context_window_tokens: model?.value.context_window_tokens,
        max_output_tokens: model?.value.max_output_tokens
      })
    },
    active_image_model: {
      id: activeImageModel?.value.model_id ?? null,
      selector_ref: activeImageModel?.ref,
      source_ref: imageModel?.ref,
      provider: imageModel?.value.provider,
      api: imageModel?.value.api,
      model: imageModel?.value.model,
      base_url: imageModel?.value.base_url,
      auth_id: imageModel?.value.auth_id,
      size: imageModel?.value.size,
      quality: imageModel?.value.quality,
      output_format: imageModel?.value.output_format
    },
    active_channel: {
      id: activeChannel?.value.channel_id ?? null,
      selector_ref: activeChannel?.ref,
      source_ref: channel?.ref,
      kind: stringField(channel?.raw, "kind"),
      transport: stringField(channel?.raw, "transport"),
      mode: stringField(channel?.raw, "mode"),
      auth_id: stringField(channel?.raw, "auth_id"),
      followup_queue_size: numberField(channel?.raw, "followup_queue_size")
    },
    active_scenario: {
      id: activeScenario?.value.scenario_id ?? null,
      selector_ref: activeScenario?.ref,
      source_ref: scenario?.ref,
      channel_id: stringField(scenario?.raw, "channel_id"),
      model_id: stringField(scenario?.raw, "model_id"),
      discipline: stringField(scenario?.raw, "discipline"),
      reply_policy: stringField(scenario?.raw, "reply_policy"),
      concurrency: stringField(scenario?.raw, "concurrency")
    },
    vault: {
      mode: vault.mode,
      root: vault.root,
      active_root: vault.active_root,
      seed_roots: vault.seed_roots,
      project_roots: vault.project_roots,
      source_ref: vaultRecord?.ref ?? "default:vault"
    },
    refs,
    restart_guidance: "Changes to active model, channel, scenario, vault, runtime review_tick settings, runtime content_daily settings, runtime content_feedback_refresh settings, or runtime content_creator_metrics settings take effect in the resident runtime service after service restart.",
    boundary: "read-only runtime config summary; reads config.jsonl, models.jsonl, settings.jsonl, and ignored local overlays only; never reads auth.jsonl, API keys, app secrets, non-config runtime state artifacts, launchd, logs, or raw memory/SOP/skill bodies; does not mutate config or service state"
  };
}

export async function updateRuntimeConfig(options: UpdateRuntimeConfigOptions): Promise<RuntimeConfigUpdateResult> {
  const selectors = await loadConfigSelectors(options);
  const before = await loadRuntimeConfigSummary({
    configDir: options.configDir,
    stateRoot: options.stateRoot,
    env: options.env
  });
  const record = buildUpdatedRuntimeRecord(before.runtime, options.patch);
  assertRuntimeUpdateIsSafe(record, options);
  const parsed = runtimeRecordSchema.parse(record);
  const configFile = resolve(selectors.homeConfigDir, "config.jsonl");
  await mkdir(selectors.homeConfigDir, { recursive: true });
  const existingRaw = await readOptional(selectors.homeConfigDir, "config.jsonl");
  const nextRow = existingRaw.split(/\r?\n/).filter((line) => line.trim()).length + 1;
  await appendFile(configFile, `${JSON.stringify(parsed)}\n`, "utf8");
  const after = await loadRuntimeConfigSummary({
    configDir: options.configDir,
    stateRoot: options.stateRoot,
    env: options.env
  });
  return {
    action: "runtime-config-update",
    ok: true,
    created_at: new Date().toISOString(),
    config_file: configFile,
    appended_ref: `home:config.jsonl#${nextRow}`,
    before: before.runtime,
    after: after.runtime,
    changed_fields: changedRuntimeFields(before.runtime, after.runtime),
    restart_required: true,
    restart_command: "pnpm run runtime -- service restart --target runtime",
    boundary: "append-only runtime config update; writes only the local home config.jsonl runtime record, reads only non-secret config summary inputs, never reads or writes auth.jsonl, does not restart services, invoke models, fetch sources, publish externally, mutate repo files, or write the active vault"
  };
}

export async function loadRuntimeAuthDiagnostics(options: RuntimeAuthDiagnosticsOptions = {}): Promise<RuntimeAuthDiagnostics> {
  const selectors = await loadConfigSelectors(options);
  const configLayers = await readConfigSourceLayers(selectors, "config.jsonl");
  const modelLayers = await readConfigSourceLayers(selectors, "models.jsonl");
  const settingLayers = await readConfigSourceLayers(selectors, "settings.jsonl");
  const authLayers = await readConfigSourceLayers(selectors, "auth.jsonl");
  const activeModelRecords = parseJsonlWithRefs(configLayers, activeModelRecordSchema, "active_model");
  const activeChannelRecords = parseJsonlWithRefs(configLayers, activeChannelRecordSchema, "active_channel");
  const modelRecords = parseJsonlWithRefs(modelLayers, modelRecordSchema, "model");
  const channelRecords = parseRawJsonlWithRefs(settingLayers, "channel");
  const apiKeyRecords = parseJsonlWithRefs(authLayers, authRecordSchema, "api_key");
  const appSecretRecords = parseJsonlWithRefs(authLayers, appSecretAuthRecordSchema, "app_secret");

  const activeModel = activeModelRecords.at(-1);
  const model = activeModel
    ? [...modelRecords].reverse().find((item) => item.value.id === activeModel.value.model_id)
    : undefined;
  const activeChannel = activeChannelRecords.at(-1);
  const selectedChannelId = options.channelId ?? activeChannel?.value.channel_id;
  const channel = selectedChannelId
    ? [...channelRecords].reverse().find((item) => stringField(item.raw, "id") === selectedChannelId)
    : undefined;
  const env = options.env ?? process.env;
  const modelAuth = model?.value.auth_id
    ? apiKeyDiagnostic(model.value.auth_id, [...apiKeyRecords].reverse().find((item) => item.value.id === model.value.auth_id), env)
    : null;
  const channelAuthId = stringField(channel?.raw, "auth_id");
  const channelKind = stringField(channel?.raw, "kind");
  const channelAuth = channelAuthId
    ? channelKind === "telegram" || channelKind === "discord"
      ? apiKeyDiagnostic(channelAuthId, [...apiKeyRecords].reverse().find((item) => item.value.id === channelAuthId), env)
      : appSecretDiagnostic(channelAuthId, [...appSecretRecords].reverse().find((item) => item.value.id === channelAuthId), env)
    : null;

  return {
    action: "auth-diagnostics",
    created_at: new Date().toISOString(),
    active_model_auth: modelAuth,
    active_channel_auth: channelAuth,
    refs: uniqueStrings([
      activeModel?.ref,
      model?.ref,
      modelAuth?.source_ref ?? undefined,
      options.channelId ? undefined : activeChannel?.ref,
      channel?.ref,
      channelAuth?.source_ref ?? undefined
    ]),
    boundary: "read-only auth source diagnostics; reads auth.jsonl metadata across tracked, ignored local, home, and state layers and checks whether direct or explicitly named env-backed fields are configured for the active model and active or explicitly selected channel; never renders API keys, app ids, app secrets, or env values; does not mutate config, state, service, repo, or active vault"
  };
}

export async function loadSettingsRecords<T>(
  options: ConfigSourceOptions,
  schema: z.ZodType<T>,
  type: string,
  rawFilter?: (record: Record<string, unknown>) => boolean
): Promise<T[]> {
  const selectors = await loadConfigSelectors(options);
  return [
    ...parseJsonl<T>(await readOptional(selectors.configDir, "settings.jsonl"), schema, type, rawFilter),
    ...parseJsonl<T>(await readOptional(selectors.configDir, localConfigFile("settings.jsonl")), schema, type, rawFilter),
    ...parseJsonl<T>(await readOptional(selectors.homeConfigDir, "settings.jsonl"), schema, type, rawFilter),
    ...parseJsonl<T>(await readOptional(selectors.stateRoot, "settings.jsonl"), schema, type, rawFilter)
  ];
}

export async function loadAppSecretAuth(
  options: ConfigSourceOptions,
  authId: string
): Promise<{ appId: string; appSecret: string; record: AppSecretAuthRecord }> {
  const selectors = await loadConfigSelectors(options);
  const records = await loadAuthRecords<AppSecretAuthRecord>(selectors, appSecretAuthRecordSchema, "app_secret");
  const record = [...records].reverse().find((item) => item.id === authId);
  if (!record) throw new Error(`App secret auth record not found: ${authId}`);
  const env = options.env ?? process.env;
  return {
    appId: resolveSecretValue(record.app_id, record.app_id_env, env, `app_id for auth ${authId}`),
    appSecret: resolveSecretValue(record.app_secret, record.app_secret_env, env, `app_secret for auth ${authId}`),
    record
  };
}

export async function loadApiKeyAuth(
  options: ConfigSourceOptions,
  authId: string
): Promise<{ apiKey: string; record: ApiKeyAuthRecord }> {
  const selectors = await loadConfigSelectors(options);
  const records = await loadAuthRecords<ApiKeyAuthRecord>(selectors, authRecordSchema, "api_key");
  const record = [...records].reverse().find((item) => item.id === authId);
  if (!record) throw new Error(`API key auth record not found: ${authId}`);
  return {
    apiKey: resolveSecretValue(record.key, record.env, options.env ?? process.env, `api_key for auth ${authId}`),
    record
  };
}

function resolveVaultConfig(record: VaultRecord | undefined, homeRoot: string): Required<VaultRecord> & { root: string; active_root: string } {
  const mode = record?.mode ?? (record?.active_root ? "user" : "repo-local");
  const activeRoot = mode === "user"
    ? expandConfigPath(record?.active_root ?? `${homeRoot}/vault`, homeRoot, false)
    : expandConfigPath(record?.root ?? record?.active_root ?? "vault", homeRoot, true);
  const seedRoots = record?.seed_roots ?? (mode === "user" ? ["vault", "skills"] : ["skills"]);
  return {
    type: "vault",
    mode,
    root: activeRoot,
    active_root: activeRoot,
    seed_roots: seedRoots.map((root) => expandConfigPath(root, homeRoot, true)),
    project_roots: (record?.project_roots ?? []).map((root) => expandConfigPath(root, homeRoot, true))
  };
}

async function loadAuthRecords<T>(
  selectors: ConfigSelectors,
  schema: z.ZodType<T>,
  type: string
): Promise<T[]> {
  return [
    ...parseJsonl<T>(await readOptional(selectors.configDir, "auth.jsonl"), schema, type),
    ...parseJsonl<T>(await readOptional(selectors.configDir, localConfigFile("auth.jsonl")), schema, type),
    ...parseJsonl<T>(await readOptional(selectors.homeConfigDir, "auth.jsonl"), schema, type),
    ...parseJsonl<T>(await readOptional(selectors.stateRoot, "auth.jsonl"), schema, type)
  ];
}

async function readLayeredConfig(selectors: ConfigSelectors, file: string): Promise<string> {
  return joinJsonl([
    await readRequired(selectors.configDir, file),
    await readOptional(selectors.configDir, localConfigFile(file)),
    await readOptional(selectors.homeConfigDir, file),
    await readOptional(selectors.stateRoot, file)
  ]);
}

function joinJsonl(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

interface ConfigSourceLayer {
  layer: ConfigSummaryLayer;
  file: string;
  raw: string;
}

interface ConfigRecordWithRef<T> {
  value: T;
  raw: Record<string, unknown>;
  ref: string;
  layer: ConfigSummaryLayer;
  file: string;
  row: number;
}

async function readConfigSourceLayers(selectors: ConfigSelectors, file: string): Promise<ConfigSourceLayer[]> {
  return [
    { layer: "repo", file, raw: await readOptional(selectors.configDir, file) },
    { layer: "local", file: localConfigFile(file), raw: await readOptional(selectors.configDir, localConfigFile(file)) },
    { layer: "home", file, raw: await readOptional(selectors.homeConfigDir, file) },
    { layer: "state", file, raw: await readOptional(selectors.stateRoot, file) }
  ];
}

function localConfigFile(file: string): string {
  return file.replace(/\.jsonl$/u, ".local.jsonl");
}

function expandConfigPath(value: string, homeRoot: string | undefined, preserveRelative: boolean): string {
  let expanded = value;
  if (homeRoot) {
    expanded = expanded.replace(/\$\{LOCAL_RUNTIME_HOME\}/g, homeRoot).replace(/\$LOCAL_RUNTIME_HOME\b/g, homeRoot);
  }
  expanded = expanded.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "");
  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => process.env[name] ?? "");
  if (expanded === "~") expanded = homedir();
  else if (expanded.startsWith("~/")) expanded = resolve(homedir(), expanded.slice(2));
  if (preserveRelative && !isAbsolute(expanded)) return expanded;
  return resolve(expanded);
}

async function readRequired(dir: string, file: string): Promise<string> {
  const path = resolve(dir, file);
  if (!existsSync(path)) throw new Error(`Required config file not found: ${path}`);
  return readFile(path, "utf8");
}

async function readOptional(dir: string, file: string): Promise<string> {
  const path = resolve(dir, file);
  if (!existsSync(path)) return "";
  return readFile(path, "utf8");
}

function parseJsonl<T>(
  raw: string,
  schema: z.ZodType<T>,
  type: string,
  rawFilter?: (record: Record<string, unknown>) => boolean
): T[] {
  const records: T[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed) && parsed.type !== type) continue;
    if (isRecord(parsed) && rawFilter && !rawFilter(parsed)) continue;
    try {
      records.push(schema.parse(parsed));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid ${type} JSONL record at line ${index + 1}: ${message}`);
    }
  }
  return records;
}

function parseJsonlWithRefs<T>(
  layers: ConfigSourceLayer[],
  schema: z.ZodType<T>,
  type: string
): Array<ConfigRecordWithRef<T>> {
  const records: Array<ConfigRecordWithRef<T>> = [];
  for (const layer of layers) {
    for (const [index, line] of layer.raw.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parsed = parseConfigLine(trimmed, layer, index + 1);
      if (isRecord(parsed) && parsed.type !== type) continue;
      try {
        records.push({
          value: schema.parse(parsed),
          raw: isRecord(parsed) ? parsed : {},
          ref: configRecordRef(layer, index + 1),
          layer: layer.layer,
          file: layer.file,
          row: index + 1
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid ${type} JSONL record at ${configRecordRef(layer, index + 1)}: ${message}`);
      }
    }
  }
  return records;
}

function parseRawJsonlWithRefs(
  layers: ConfigSourceLayer[],
  type: string
): Array<ConfigRecordWithRef<Record<string, unknown>>> {
  const records: Array<ConfigRecordWithRef<Record<string, unknown>>> = [];
  for (const layer of layers) {
    for (const [index, line] of layer.raw.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parsed = parseConfigLine(trimmed, layer, index + 1);
      if (!isRecord(parsed) || parsed.type !== type) continue;
      records.push({
        value: parsed,
        raw: parsed,
        ref: configRecordRef(layer, index + 1),
        layer: layer.layer,
        file: layer.file,
        row: index + 1
      });
    }
  }
  return records;
}

function parseConfigLine(line: string, layer: ConfigSourceLayer, row: number): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSONL record at ${configRecordRef(layer, row)}: ${message}`);
  }
}

function configRecordRef(layer: ConfigSourceLayer, row: number): string {
  return `${layer.layer}:${layer.file}#${row}`;
}

function runtimeDefaultedFields(raw: Record<string, unknown>): string[] {
  const fields = [
    "promotion_enabled",
    "structured_output",
    "review_tick_enabled",
    "review_tick_interval_ms",
    "review_tick_limit",
    "content_daily_enabled",
    "content_daily_interval_ms",
    "content_daily_dry_run",
    "content_daily_preflight",
    "content_daily_topic",
    "content_daily_source_urls",
    "content_daily_tickers",
    "content_daily_image_model",
    "content_daily_publish_enabled",
    "content_daily_external_write_confirmed",
    "content_daily_publish_adapter",
    "content_daily_publish_server_url",
    "content_daily_publish_tool",
    "content_feedback_refresh_enabled",
    "content_feedback_refresh_interval_ms",
    "content_feedback_refresh_limit",
    "content_feedback_refresh_min_follow_up_age_ms",
    "content_feedback_refresh_server_url",
    "content_creator_metrics_enabled",
    "content_creator_metrics_interval_ms",
    "content_creator_metrics_limit",
    "content_creator_metrics_creator_url",
    "content_creator_metrics_browser_session_name",
    "content_creator_metrics_browser_auto_connect",
    "content_creator_metrics_browser_cdp_port"
  ];
  return fields.filter((field) => !(field in raw));
}

function buildUpdatedRuntimeRecord(
  current: RuntimeConfigSummary["runtime"],
  patch: RuntimeConfigUpdatePatch
): RuntimeRecord {
  const record: Record<string, unknown> = {
    type: "runtime",
    promotion_enabled: current.promotion_enabled,
    structured_output: current.structured_output,
    review_tick_enabled: current.review_tick_enabled,
    review_tick_interval_ms: current.review_tick_interval_ms,
    review_tick_limit: current.review_tick_limit,
    content_daily_enabled: current.content_daily_enabled,
    content_daily_interval_ms: current.content_daily_interval_ms,
    content_daily_dry_run: current.content_daily_dry_run,
    content_daily_preflight: current.content_daily_preflight,
    content_daily_topic: current.content_daily_topic,
    content_daily_source_urls: current.content_daily_source_urls,
    content_daily_tickers: current.content_daily_tickers,
    ...(current.content_daily_image_model ? { content_daily_image_model: current.content_daily_image_model } : {}),
    content_daily_publish_enabled: current.content_daily_publish_enabled,
    content_daily_external_write_confirmed: current.content_daily_external_write_confirmed,
    content_daily_publish_adapter: current.content_daily_publish_adapter,
    content_daily_publish_server_url: current.content_daily_publish_server_url,
    content_daily_publish_tool: current.content_daily_publish_tool,
    content_feedback_refresh_enabled: current.content_feedback_refresh_enabled,
    content_feedback_refresh_interval_ms: current.content_feedback_refresh_interval_ms,
    content_feedback_refresh_limit: current.content_feedback_refresh_limit,
    content_feedback_refresh_min_follow_up_age_ms: current.content_feedback_refresh_min_follow_up_age_ms,
    content_feedback_refresh_server_url: current.content_feedback_refresh_server_url,
    content_creator_metrics_enabled: current.content_creator_metrics_enabled,
    content_creator_metrics_interval_ms: current.content_creator_metrics_interval_ms,
    content_creator_metrics_limit: current.content_creator_metrics_limit,
    content_creator_metrics_creator_url: current.content_creator_metrics_creator_url,
    content_creator_metrics_browser_session_name: current.content_creator_metrics_browser_session_name,
    content_creator_metrics_browser_auto_connect: current.content_creator_metrics_browser_auto_connect,
    ...(current.content_creator_metrics_browser_cdp_port ? { content_creator_metrics_browser_cdp_port: current.content_creator_metrics_browser_cdp_port } : {})
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "content_daily_image_model" && value === null) {
      delete record.content_daily_image_model;
    } else if (key === "content_creator_metrics_browser_cdp_port" && value === null) {
      delete record.content_creator_metrics_browser_cdp_port;
    } else {
      record[key] = value;
    }
  }
  return runtimeRecordSchema.parse(record);
}

function assertRuntimeUpdateIsSafe(record: RuntimeRecord, options: UpdateRuntimeConfigOptions): void {
  const publishRequested = options.patch.content_daily_publish_enabled === true
    || options.patch.content_daily_external_write_confirmed === true;
  if (record.content_daily_publish_enabled) {
    if (record.content_daily_dry_run) {
      throw new Error("content_daily_publish_enabled=true requires content_daily_dry_run=false");
    }
    if (!record.content_daily_preflight) {
      throw new Error("content_daily_publish_enabled=true requires content_daily_preflight=true");
    }
    if (!record.content_daily_external_write_confirmed) {
      throw new Error("content_daily_publish_enabled=true requires content_daily_external_write_confirmed=true");
    }
  }
  if (record.content_daily_preflight && record.content_daily_dry_run) {
    throw new Error("content_daily_preflight=true requires content_daily_dry_run=false");
  }
  if (publishRequested && options.confirmedExternalWrite !== true) {
    throw new Error("Setting resident daily external-write fields requires --external-write --confirmed");
  }
}

function changedRuntimeFields(
  before: RuntimeConfigSummary["runtime"],
  after: RuntimeConfigSummary["runtime"]
): string[] {
  const fields: Array<keyof RuntimeConfigSummary["runtime"]> = [
    "promotion_enabled",
    "structured_output",
    "review_tick_enabled",
    "review_tick_interval_ms",
    "review_tick_limit",
    "content_daily_enabled",
    "content_daily_interval_ms",
    "content_daily_dry_run",
    "content_daily_preflight",
    "content_daily_topic",
    "content_daily_source_urls",
    "content_daily_tickers",
    "content_daily_image_model",
    "content_daily_publish_enabled",
    "content_daily_external_write_confirmed",
    "content_daily_publish_adapter",
    "content_daily_publish_server_url",
    "content_daily_publish_tool",
    "content_feedback_refresh_enabled",
    "content_feedback_refresh_interval_ms",
    "content_feedback_refresh_limit",
    "content_feedback_refresh_min_follow_up_age_ms",
    "content_feedback_refresh_server_url",
    "content_creator_metrics_enabled",
    "content_creator_metrics_interval_ms",
    "content_creator_metrics_limit",
    "content_creator_metrics_creator_url",
    "content_creator_metrics_browser_session_name",
    "content_creator_metrics_browser_auto_connect",
    "content_creator_metrics_browser_cdp_port"
  ];
  return fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const field = value?.[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function numberField(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const field = value?.[key];
  return typeof field === "number" ? field : undefined;
}

function apiKeyDiagnostic(
  authId: string,
  record: ConfigRecordWithRef<AuthRecord> | undefined,
  env: NodeJS.ProcessEnv
): ApiKeyAuthDiagnostic {
  const key = authFieldDiagnostic(record?.value.key, record?.value.env, env);
  return {
    kind: "api_key",
    auth_id: authId,
    source_ref: record?.ref ?? null,
    resolved: key.source !== "missing",
    key
  };
}

function appSecretDiagnostic(
  authId: string,
  record: ConfigRecordWithRef<AppSecretAuthRecord> | undefined,
  env: NodeJS.ProcessEnv
): AppSecretAuthDiagnostic {
  const appId = authFieldDiagnostic(record?.value.app_id, record?.value.app_id_env, env);
  const appSecret = authFieldDiagnostic(record?.value.app_secret, record?.value.app_secret_env, env);
  return {
    kind: "app_secret",
    auth_id: authId,
    source_ref: record?.ref ?? null,
    resolved: appId.source !== "missing" && appSecret.source !== "missing",
    app_id: appId,
    app_secret: appSecret
  };
}

function authFieldDiagnostic(
  directValue: string | undefined,
  envName: string | undefined,
  env: NodeJS.ProcessEnv
): AuthFieldDiagnostic {
  const directConfigured = Boolean(directValue?.trim());
  const envConfigured = Boolean(envName?.trim());
  const envPresent = envConfigured ? Boolean(env[envName as string]?.trim()) : undefined;
  const source: AuthCredentialSource = directConfigured
    ? "direct"
    : envPresent
      ? "env"
      : "missing";
  return {
    source,
    direct_configured: directConfigured,
    env_configured: envConfigured,
    ...(envConfigured ? { env_name: envName } : {}),
    ...(envPresent === undefined ? {} : { env_present: envPresent })
  };
}

function resolveApiKey(auth: AuthRecord): string {
  const directValue = auth.key?.trim();
  if (directValue) return directValue;
  if (auth.env) {
    const value = process.env[auth.env];
    if (value) return value;
  }
  throw new Error(`Missing API key for auth record ${auth.id}; add key to auth.jsonl${auth.env ? ` or set ${auth.env}` : ""}`);
}

function resolveSecretValue(value: string | undefined, envName: string | undefined, env: NodeJS.ProcessEnv, label: string): string {
  const directValue = value?.trim();
  if (directValue) return directValue;
  if (envName) {
    const envValue = env[envName]?.trim();
    if (envValue) return envValue;
  }
  throw new Error(`Missing ${label}; add it to auth.jsonl${envName ? ` or set ${envName}` : ""}`);
}

function requiredAuth(auth: AuthRecord | undefined, authId: string): AuthRecord {
  if (!auth) throw new Error(`Auth record not found: ${authId}`);
  return auth;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
