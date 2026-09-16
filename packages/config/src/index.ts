import { z } from "zod";

const optionalNonEmptyString = z.string().trim().min(1).optional();
const optionalOrigin = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      (url.protocol === "https:" || (url.protocol === "http:" && loopback))
    );
  }, "Must be an HTTPS origin or an HTTP loopback origin")
  .optional();

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalNonEmptyString,
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  ATTENDANCE_SCHEDULER_SECRET: optionalNonEmptyString,
  CONTROL_PLANE_ORIGIN: optionalOrigin,
  PRODUCT_WEB_ORIGIN: optionalOrigin,
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  RANZA_SCHEDULER_SECRET: optionalNonEmptyString,
  SENTRY_DSN: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,
  STUDENT_CREDENTIAL_PEPPER_V1: z.string().min(32).optional(),
  STUDENT_TRUSTED_IP_HEADER: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  WIFI_ENCRYPTION_KEY_V1: optionalNonEmptyString,
});

export function parsePublicEnvironment(input: unknown) {
  return publicEnvironmentSchema.parse(input);
}

export function parseServerEnvironment(input: unknown) {
  return serverEnvironmentSchema.parse(input);
}
