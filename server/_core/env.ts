export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
