import { z } from "zod";

const optionalNonEmptyString = z.string().trim().min(1).optional();

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalNonEmptyString,
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SENTRY_DSN: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,
});

export function parsePublicEnvironment(input: unknown) {
  return publicEnvironmentSchema.parse(input);
}

export function parseServerEnvironment(input: unknown) {
  return serverEnvironmentSchema.parse(input);
}
