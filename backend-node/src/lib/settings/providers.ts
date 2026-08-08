import { prisma } from "../../prisma";
import { NotFoundError, ValidationError } from "../errors";
import { logAuditAction } from "../audit";
import { encryptFernet, decryptFernet, decryptFernetHealth } from "../crypto/fernet";
import { DEFAULT_PROVIDERS } from "./providerDefaults";
import { Prisma } from "../../generated/prisma";
import type { ProviderConfig } from "../../generated/prisma";

const secret = (): string => process.env.SECRET_KEY!;

function safeJsonLoad<T>(data: string | null | undefined, fallback: T): T {
  try {
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Port of ConfigService.seed_defaults' provider block (config.py:811-826) —
// insert-if-absent only; never overwrites an existing row's credentials.
// Idempotent, safe to call on every process start (see routes/index wiring).
export async function seedDefaultProviders(): Promise<void> {
  for (const p of DEFAULT_PROVIDERS) {
    try {
      const exists = await prisma.providerConfig.findUnique({ where: { providerName: p.providerName } });
      if (!exists) {
        await prisma.providerConfig.create({
          data: {
            providerName: p.providerName,
            providerType: p.providerType,
            enabled: true,
            keyNames: p.keyNames,
            encryptedKeys: "{}",
            config: p.config ?? "{}",
            status: p.status,
            capabilities: p.capabilities,
            priority: p.priority ?? 100,
            health: "{}",
            timeoutSeconds: 10,
            retryPolicy: "{}",
          },
        });
      } else if (exists.status === "PLANNED" && p.status !== "PLANNED") {
        await prisma.providerConfig.update({
          where: { providerName: p.providerName },
          data: { status: p.status, capabilities: p.capabilities, priority: p.priority ?? exists.priority },
        });
      }
    } catch (e) {
      // Matches Python's per-block `except IntegrityError: db.rollback()` in
      // seed_defaults — a unique-constraint collision on one row (e.g. a
      // concurrent process seeding the same provider) must not abort the
      // rest of the seed loop.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        console.warn(`seed_default_providers_collision provider_name=${p.providerName}`);
        continue;
      }
      throw e;
    }
  }
}

// Port of _provider_to_dict.
export function providerToDict(p: ProviderConfig) {
  const encrypted = safeJsonLoad<Record<string, string>>(p.encryptedKeys, {});
  const keyNames = safeJsonLoad<string[]>(p.keyNames, []);
  const keysStatus: Record<string, boolean> = {};
  const keysHealth: Record<string, string> = {};
  for (const k of keyNames) {
    keysStatus[k] = Boolean(encrypted[k]);
    keysHealth[k] = encrypted[k] ? decryptFernetHealth(encrypted[k], secret()) : "not_set";
  }
  return {
    provider_name: p.providerName,
    provider_type: p.providerType,
    enabled: p.enabled,
    key_names: keyNames,
    keys_status: keysStatus,
    keys_health: keysHealth,
    config: safeJsonLoad<Record<string, unknown>>(p.config, {}),
    status: p.status,
    capabilities: safeJsonLoad<string[]>(p.capabilities, []),
    priority: p.priority,
    health: safeJsonLoad<Record<string, unknown>>(p.health, {}),
    rate_limit: p.rateLimit,
    timeout_seconds: p.timeoutSeconds,
    retry_policy: safeJsonLoad<Record<string, unknown>>(p.retryPolicy, {}),
    cache_ttl_seconds: p.cacheTtlSeconds,
  };
}

export async function getAllProviders() {
  const rows = await prisma.providerConfig.findMany();
  return rows.map(providerToDict);
}

export async function getProviderDict(providerName: string) {
  const p = await prisma.providerConfig.findUnique({ where: { providerName } });
  return p ? providerToDict(p) : null;
}

export async function updateProvider(
  providerName: string,
  opts: { enabled?: boolean; config?: Record<string, unknown> },
  actorId: string,
) {
  const existing = await prisma.providerConfig.findUnique({ where: { providerName } });
  if (!existing) throw new NotFoundError(`Provider ${providerName} not found`);
  await prisma.$transaction(async (tx) => {
    await tx.providerConfig.update({
      where: { providerName },
      data: {
        ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
        ...(opts.config !== undefined ? { config: JSON.stringify(opts.config) } : {}),
        updatedAt: new Date(),
      },
    });
    await logAuditAction(tx, "config_provider_update", "provider_config", actorId, providerName, {
      enabled: opts.enabled ?? null,
      config: opts.config ?? null,
    });
  });
}

async function requireAllowedKey(providerName: string, keyName: string): Promise<ProviderConfig> {
  const p = await prisma.providerConfig.findUnique({ where: { providerName } });
  if (!p) throw new NotFoundError(`Provider ${providerName} not found`);
  const allowed = safeJsonLoad<string[]>(p.keyNames, []);
  if (!allowed.includes(keyName)) {
    // Python's route catches ValueError -> HTTPException(400) here, not 422
    // (this is a business-rule rejection, not a malformed-request-shape
    // rejection) — errorHandler.ts maps ValidationError -> 400 directly.
    throw new ValidationError(`Invalid key name ${keyName} for provider ${providerName}`);
  }
  return p;
}

export async function setProviderKey(providerName: string, keyName: string, value: string, actorId: string): Promise<void> {
  const p = await requireAllowedKey(providerName, keyName);
  const keys = safeJsonLoad<Record<string, string>>(p.encryptedKeys, {});
  keys[keyName] = value ? encryptFernet(value, secret()) : "";
  await prisma.$transaction(async (tx) => {
    await tx.providerConfig.update({ where: { providerName }, data: { encryptedKeys: JSON.stringify(keys), updatedAt: new Date() } });
    await logAuditAction(tx, "config_provider_key_set", "provider_config", actorId, providerName, { key_name: keyName, is_value_empty: !value });
  });
}

export async function removeProviderKey(providerName: string, keyName: string, actorId: string): Promise<boolean> {
  const p = await requireAllowedKey(providerName, keyName);
  const keys = safeJsonLoad<Record<string, string>>(p.encryptedKeys, {});
  if (!(keyName in keys)) return false;
  delete keys[keyName];
  await prisma.$transaction(async (tx) => {
    await tx.providerConfig.update({ where: { providerName }, data: { encryptedKeys: JSON.stringify(keys), updatedAt: new Date() } });
    await logAuditAction(tx, "config_provider_key_removed", "provider_config", actorId, providerName, { key_name: keyName });
  });
  return true;
}

export async function getDecryptedKey(providerName: string, keyName: string): Promise<string | null> {
  const p = await prisma.providerConfig.findUnique({ where: { providerName } });
  if (!p) return null;
  const keys = safeJsonLoad<Record<string, string>>(p.encryptedKeys, {});
  const encrypted = keys[keyName] ?? "";
  return encrypted ? decryptFernet(encrypted, secret(), `${providerName}.${keyName}`) : null;
}
