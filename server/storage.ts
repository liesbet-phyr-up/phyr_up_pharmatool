import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

function storageConfiguration() {
  const { s3AccessKeyId, s3SecretAccessKey, s3Bucket, s3Region, s3Endpoint } = ENV;
  if (!s3AccessKeyId || !s3SecretAccessKey || !s3Bucket || !s3Region) {
    throw new Error("Training file storage is not configured. Set the S3 storage variables in Railway.");
  }
  return { s3AccessKeyId, s3SecretAccessKey, s3Bucket, s3Region, s3Endpoint };
}

function storageClient() {
  const config = storageConfiguration();
  return new S3Client({
    region: config.s3Region,
    endpoint: config.s3Endpoint || undefined,
    forcePathStyle: Boolean(config.s3Endpoint),
    credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
  });
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-160) || "resource";
}

export async function uploadTrainingResource(fileName: string, data: Buffer, contentType: string) {
  if (data.length > 10 * 1024 * 1024) throw new Error("Training files must be 10 MB or smaller.");
  const config = storageConfiguration();
  const key = `training/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(fileName)}`;
  await storageClient().send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: data, ContentType: contentType, ContentDisposition: `attachment; filename="${safeFileName(fileName)}"` }));
  return { key, name: fileName, contentType };
}

export async function getTrainingResourceUrl(key: string) {
  const config = storageConfiguration();
  return getSignedUrl(storageClient(), new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }), { expiresIn: 60 * 10 });
}
