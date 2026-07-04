import { LoginClient, type DemoCredentials } from "./login-client";

export const dynamic = "force-dynamic";

const truthyValues = new Set(["1", "true", "yes", "on", "demo"]);

function isTruthy(value?: string) {
  return truthyValues.has((value || "").trim().toLowerCase());
}

function getDemoCredentials(): DemoCredentials {
  const explicitDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;
  const isDemoMode =
    explicitDemoMode === undefined || explicitDemoMode === ""
      ? process.env.BOOTSTRAP_TENANT_ID === "tenant_demo"
      : isTruthy(explicitDemoMode);

  if (!isDemoMode) return null;

  return {
    email: process.env.NEXT_PUBLIC_DEMO_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@demo.com",
    password: process.env.NEXT_PUBLIC_DEMO_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || "demo123",
  };
}

export default function LoginPage() {
  return <LoginClient demoCredentials={getDemoCredentials()} />;
}
