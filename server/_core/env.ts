export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  // Naledi POC (MAXIMED-NALEDI-001). Empty = hide Naledi. Never expose anamApiKey to the client.
  nalediEnabled: process.env.NALEDI_ENABLED ?? "",
  anamApiKey: process.env.ANAM_API_KEY ?? "",
  anamPersonaId: process.env.ANAM_PERSONA_ID ?? "",
};
