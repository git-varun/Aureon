import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { getCurrentUser } from "../../lib/users";

export const usersRouter = Router();

// Port of app/api/dependencies.py serialize_user_profile — creates a default
// UserPreference (risk_profile="moderate", target_profit_pct=12.0,
// monthly_saving=25000.0, swing_trading_enabled=true) if none exists yet.
// Note: the Prisma model for `user_preferences` (snake_case table name in
// schema.prisma) generates as `prisma.user_preferences`, not the camelCase
// `prisma.userPreference` — confirmed against prisma/schema.prisma.
async function serializeUserProfile(userId: string) {
  let pref = await prisma.user_preferences.findUnique({ where: { user_id: userId } });
  if (!pref) {
    pref = await prisma.user_preferences.create({
      data: {
        id: uuidv4(),
        user_id: userId,
        risk_profile: "moderate",
        target_profit_pct: 12.0,
        monthly_saving: 25000.0,
        swing_trading_enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const themes = await prisma.market_themes.findMany({ where: { owner_id: userId } });
  const customThemes: Record<string, unknown> = {};
  for (const t of themes) {
    const weights = await prisma.theme_weights.findMany({ where: { theme_id: t.theme_id } });
    const wDict: Record<string, number> = {};
    for (const w of weights) wDict[w.symbol] = Number(w.weight);
    const symbols = t.symbols as unknown[];
    customThemes[t.theme_id] = {
      id: t.theme_id,
      name: t.name,
      desc: t.desc,
      symbols: t.symbols,
      weights: wDict,
      inception_date: t.inception_date,
      ret1m: Number(t.ret1m),
      count: Array.isArray(symbols) ? symbols.length : 0,
      owner_id: userId,
      forked_from: t.forked_from,
    };
  }

  return {
    id: user.id,
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    phone: user.phone,
    bio: pref.bio,
    risk_profile: pref.risk_profile,
    working_area: pref.working_area,
    target_profit_pct: pref.target_profit_pct !== null ? Number(pref.target_profit_pct) : 12.0,
    monthly_saving: pref.monthly_saving !== null ? Number(pref.monthly_saving) : 25000.0,
    swing_trading_enabled: pref.swing_trading_enabled,
    profile_picture: user.profilePicture,
    custom_themes: customThemes,
  };
}

usersRouter.get("/me", async (_req, res) => {
  const user = await getCurrentUser();
  res.json(await serializeUserProfile(user.id));
});

usersRouter.put("/me", async (req, res) => {
  const user = await getCurrentUser();
  const body: Record<string, unknown> = req.body ?? {};

  const userFieldMap: Record<string, string> = { first_name: "firstName", last_name: "lastName", phone: "phone" };
  const userUpdates: Record<string, unknown> = {};
  for (const [jsonKey, prismaKey] of Object.entries(userFieldMap)) {
    if (body[jsonKey] !== undefined && body[jsonKey] !== null) userUpdates[prismaKey] = body[jsonKey];
  }
  if (Object.keys(userUpdates).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data: { ...userUpdates, updatedAt: new Date() } });
  }

  let pref = await prisma.user_preferences.findUnique({ where: { user_id: user.id } });
  if (!pref) {
    pref = await prisma.user_preferences.create({
      data: { id: uuidv4(), user_id: user.id, swing_trading_enabled: true, created_at: new Date(), updated_at: new Date() },
    });
  }

  const prefFields = ["bio", "risk_profile", "working_area", "swing_trading_enabled"] as const;
  const prefUpdates: Record<string, unknown> = {};
  for (const field of prefFields) {
    if (body[field] !== undefined && body[field] !== null) prefUpdates[field] = body[field];
  }

  // The frontend always sends these two explicitly, including `null` to
  // intentionally clear a target — unlike the block above, an explicit null
  // here must be applied, not silently dropped as "field not sent". Express
  // gives us presence-in-body directly (no Pydantic model_fields_set
  // equivalent needed): "in body" means the key was sent at all.
  for (const field of ["target_profit_pct", "monthly_saving"] as const) {
    if (field in body) prefUpdates[field] = body[field];
  }

  if (Object.keys(prefUpdates).length > 0) {
    await prisma.user_preferences.update({ where: { user_id: user.id }, data: { ...prefUpdates, updated_at: new Date() } });
  }

  res.json(await serializeUserProfile(user.id));
});
