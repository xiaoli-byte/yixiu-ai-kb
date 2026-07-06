import { LoginClient, type DemoCredentials } from "./login-client";

export const dynamic = "force-dynamic";

const truthyValues = new Set(["1", "true", "yes", "on", "demo"]);

function isTruthy(value?: string) {
  return truthyValues.has((value || "").trim().toLowerCase());
}

function getDemoCredentials(): DemoCredentials {
  if (process.env.NODE_ENV === "production") return null;

  const explicitDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;
  const isDemoMode = isTruthy(explicitDemoMode);

  if (!isDemoMode) return null;

  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL?.trim();
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "NEXT_PUBLIC_DEMO_EMAIL and NEXT_PUBLIC_DEMO_PASSWORD are required when demo mode is enabled",
    );
  }

  return {
    email,
    password,
  };
}

export default function LoginPage() {
  return <LoginClient demoCredentials={getDemoCredentials()} />;
}
