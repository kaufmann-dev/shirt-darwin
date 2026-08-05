import { env } from '$env/dynamic/private';
import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	CopyObjectCommand,
	S3Client,
	type S3ClientConfig
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { auditEvent, brandAsset, storefront } from '$lib/server/db/schema';
import { ProviderError, requireProviderConfig } from './integrations/errors';
import { buildAuditValues, recordAudit, type Actor } from './services/audit';

const allowedContentTypes = new Map<string, { extension: string; maxBytes: number }>([
	['image/jpeg', { extension: 'jpg', maxBytes: 15 * 1024 * 1024 }],
	['image/png', { extension: 'png', maxBytes: 15 * 1024 * 1024 }],
	['image/webp', { extension: 'webp', maxBytes: 15 * 1024 * 1024 }],
	['image/avif', { extension: 'avif', maxBytes: 15 * 1024 * 1024 }],
	['image/gif', { extension: 'gif', maxBytes: 15 * 1024 * 1024 }],
	['font/woff2', { extension: 'woff2', maxBytes: 5 * 1024 * 1024 }],
	['video/mp4', { extension: 'mp4', maxBytes: 100 * 1024 * 1024 }]
]);

const uploadSchema = z.object({
	storefrontId: z.string().uuid(),
	kind: z.enum(['image', 'font', 'video', 'print-file']),
	contentType: z.string(),
	sizeBytes: z.number().int().positive(),
	originalName: z.string().trim().min(1).max(255)
});

function storageConfig() {
	const endpoint = env.S3_ENDPOINT?.trim();
	const region = env.S3_REGION?.trim();
	const privateBucket = env.S3_PRIVATE_BUCKET?.trim();
	const publicBucket = env.S3_PUBLIC_BUCKET?.trim();
	const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
	const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
	const publicBaseUrl = env.S3_PUBLIC_BASE_URL?.trim();
	requireProviderConfig('s3', {
		S3_ENDPOINT: endpoint,
		S3_REGION: region,
		S3_PRIVATE_BUCKET: privateBucket,
		S3_PUBLIC_BUCKET: publicBucket,
		S3_ACCESS_KEY_ID: accessKeyId,
		S3_SECRET_ACCESS_KEY: secretAccessKey,
		S3_PUBLIC_BASE_URL: publicBaseUrl
	});
	if (privateBucket === publicBucket) {
		throw new ProviderError(
			's3',
			'invalid_configuration',
			'S3 private and public buckets must be different'
		);
	}
	if (
		![privateBucket, publicBucket].every((bucket) =>
			/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket ?? '')
		)
	) {
		throw new ProviderError('s3', 'invalid_configuration', 'Invalid S3 bucket name');
	}
	let parsedEndpoint: URL;
	let parsedPublicUrl: URL;
	try {
		parsedEndpoint = new URL(endpoint!);
		parsedPublicUrl = new URL(publicBaseUrl!);
	} catch (cause) {
		throw new ProviderError('s3', 'invalid_configuration', 'Invalid S3 endpoint URL', { cause });
	}
	if (
		!['http:', 'https:'].includes(parsedEndpoint.protocol) ||
		!['http:', 'https:'].includes(parsedPublicUrl.protocol)
	) {
		throw new ProviderError('s3', 'invalid_configuration', 'S3 URLs must use HTTP or HTTPS');
	}
	return {
		endpoint: parsedEndpoint.toString(),
		region: region!,
		privateBucket: privateBucket!,
		publicBucket: publicBucket!,
		credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
		publicBaseUrl: parsedPublicUrl.toString().replace(/\/$/, ''),
		forcePathStyle: env.S3_FORCE_PATH_STYLE?.trim().toLowerCase() === 'true'
	};
}

let cachedClient: S3Client | undefined;
let cachedFingerprint: string | undefined;

function getStorageClient() {
	const configured = storageConfig();
	const fingerprint = JSON.stringify({
		endpoint: configured.endpoint,
		region: configured.region,
		accessKeyId: configured.credentials.accessKeyId,
		forcePathStyle: configured.forcePathStyle
	});
	if (!cachedClient || cachedFingerprint !== fingerprint) {
		const clientConfig: S3ClientConfig = {
			endpoint: configured.endpoint,
			region: configured.region,
			credentials: configured.credentials,
			forcePathStyle: configured.forcePathStyle
		};
		cachedClient = new S3Client(clientConfig);
		cachedFingerprint = fingerprint;
	}
	return { client: cachedClient, configured };
}

export async function createBrandAssetUpload(
	input: z.input<typeof uploadSchema>,
	actor: Actor
): Promise<{
	assetId: string;
	objectKey: string;
	uploadUrl: string;
	expiresAt: string;
	requiredHeaders: { 'content-type': string };
}> {
	const parsed = uploadSchema.parse(input);
	const policy = allowedContentTypes.get(parsed.contentType.toLowerCase());
	if (!policy) {
		throw new ProviderError('s3', 'unsupported_content_type', 'Asset content type is not allowed');
	}
	if (parsed.sizeBytes > policy.maxBytes) {
		throw new ProviderError('s3', 'asset_too_large', 'Asset exceeds the allowed size');
	}
	if (parsed.kind === 'print-file' && parsed.contentType.toLowerCase() !== 'image/png') {
		throw new ProviderError('s3', 'kind_mismatch', 'Production print files must be PNG images');
	}
	const expectedKind =
		parsed.contentType === 'font/woff2'
			? 'font'
			: parsed.contentType === 'video/mp4'
				? 'video'
				: 'image';
	if (parsed.kind !== expectedKind && parsed.kind !== 'print-file') {
		throw new ProviderError('s3', 'kind_mismatch', 'Asset kind does not match its content type');
	}

	const [existingStorefront] = await db
		.select({ id: storefront.id })
		.from(storefront)
		.where(eq(storefront.id, parsed.storefrontId))
		.limit(1);
	if (!existingStorefront)
		throw new ProviderError('s3', 'unknown_storefront', 'Storefront not found');

	const objectKey = `drafts/${parsed.storefrontId}/${crypto.randomUUID()}.${policy.extension}`;
	const { client, configured } = getStorageClient();
	const command = new PutObjectCommand({
		Bucket: configured.privateBucket,
		Key: objectKey,
		ContentType: parsed.contentType,
		ContentLength: parsed.sizeBytes
	});
	const expiresIn = 10 * 60;
	const uploadUrl = await getSignedUrl(client, command, { expiresIn });
	const assetId = await db.transaction(async (tx) => {
		const [asset] = await tx
			.insert(brandAsset)
			.values({
				storefrontId: parsed.storefrontId,
				kind: parsed.kind,
				visibility: 'private',
				objectKey,
				contentType: parsed.contentType,
				sizeBytes: parsed.sizeBytes,
				originalName: parsed.originalName
			})
			.returning({ id: brandAsset.id });
		if (!asset)
			throw new ProviderError('s3', 'asset_record_failed', 'Could not create asset record');
		await tx.insert(auditEvent).values(
			buildAuditValues({
				actor,
				action: 'asset.upload-created',
				entityType: 'brand_asset',
				entityId: asset.id,
				input: {
					storefrontId: parsed.storefrontId,
					kind: parsed.kind,
					contentType: parsed.contentType,
					sizeBytes: parsed.sizeBytes
				}
			})
		);
		return asset.id;
	});
	return {
		assetId,
		objectKey,
		uploadUrl,
		expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
		requiredHeaders: { 'content-type': parsed.contentType }
	};
}

export async function confirmBrandAsset(
	input: { storefrontId: string; assetId: string },
	actor: Actor
) {
	const parsed = z
		.object({ storefrontId: z.string().uuid(), assetId: z.string().uuid() })
		.parse(input);
	const [asset] = await db
		.select()
		.from(brandAsset)
		.where(and(eq(brandAsset.id, parsed.assetId), eq(brandAsset.storefrontId, parsed.storefrontId)))
		.limit(1);
	if (!asset) throw new ProviderError('s3', 'unknown_asset', 'Asset not found');
	const { client, configured } = getStorageClient();
	let object;
	try {
		object = await client.send(
			new HeadObjectCommand({
				Bucket: bucketForObjectKey(configured, asset.objectKey),
				Key: asset.objectKey
			})
		);
	} catch (cause) {
		throw new ProviderError('s3', 'asset_not_uploaded', 'Uploaded asset was not found', {
			retryable: true,
			cause
		});
	}
	if (object.ContentLength !== asset.sizeBytes || object.ContentType !== asset.contentType) {
		throw new ProviderError(
			's3',
			'asset_mismatch',
			'Uploaded asset does not match its declaration'
		);
	}
	const confirmedAt = new Date();
	await db
		.update(brandAsset)
		.set({ confirmedAt })
		.where(and(eq(brandAsset.id, asset.id), eq(brandAsset.storefrontId, parsed.storefrontId)));
	await recordAudit({
		actor,
		action: 'asset.attached',
		entityType: 'brand_asset',
		entityId: asset.id,
		input: { storefrontId: parsed.storefrontId }
	});
	return {
		id: asset.id,
		storefrontId: asset.storefrontId,
		kind: asset.kind,
		contentType: asset.contentType,
		sizeBytes: asset.sizeBytes,
		visibility: asset.visibility,
		confirmedAt
	};
}

export async function createAssetDownloadUrl(objectKey: string) {
	assertSafeObjectKey(objectKey);
	const { client, configured } = getStorageClient();
	return getSignedUrl(
		client,
		new GetObjectCommand({ Bucket: bucketForObjectKey(configured, objectKey), Key: objectKey }),
		{
			expiresIn: 10 * 60
		}
	);
}

export async function promoteBrandAssets(
	input: { storefrontId: string; assetIds: string[] },
	actor: Actor
) {
	const parsed = z
		.object({
			storefrontId: z.string().uuid(),
			assetIds: z.array(z.string().uuid()).min(1).max(100)
		})
		.parse(input);
	const uniqueIds = [...new Set(parsed.assetIds)];
	const assets = await db
		.select()
		.from(brandAsset)
		.where(
			and(eq(brandAsset.storefrontId, parsed.storefrontId), inArray(brandAsset.id, uniqueIds))
		);
	if (assets.length !== uniqueIds.length) {
		throw new ProviderError('s3', 'unknown_asset', 'One or more publication assets were not found');
	}
	if (assets.some((asset) => asset.confirmedAt === null)) {
		throw new ProviderError(
			's3',
			'asset_not_confirmed',
			'Every publication asset must be uploaded and confirmed first'
		);
	}
	if (assets.some((asset) => asset.kind === 'print-file')) {
		throw new ProviderError('s3', 'private_asset', 'Print files can never be published');
	}
	const { client, configured } = getStorageClient();
	const promoted: Array<{ id: string; objectKey: string; confirmedAt: Date }> = [];
	for (const asset of assets) {
		if (asset.visibility === 'public' && asset.objectKey.startsWith('published/')) {
			await confirmStoredAsset(client, configured.publicBucket, asset);
			promoted.push({ id: asset.id, objectKey: asset.objectKey, confirmedAt: new Date() });
			continue;
		}
		if (!asset.objectKey.startsWith(`drafts/${parsed.storefrontId}/`)) {
			throw new ProviderError(
				's3',
				'invalid_object_key',
				'Asset is outside the storefront draft prefix'
			);
		}
		await confirmStoredAsset(client, configured.privateBucket, asset);
		const filename = asset.objectKey.slice(asset.objectKey.lastIndexOf('/') + 1);
		const destination = `published/${parsed.storefrontId}/${filename}`;
		await client.send(
			new CopyObjectCommand({
				Bucket: configured.publicBucket,
				Key: destination,
				CopySource: `${encodeURIComponent(configured.privateBucket)}/${asset.objectKey
					.split('/')
					.map(encodeURIComponent)
					.join('/')}`,
				ContentType: asset.contentType,
				MetadataDirective: 'REPLACE'
			})
		);
		await confirmStoredAsset(client, configured.publicBucket, { ...asset, objectKey: destination });
		promoted.push({ id: asset.id, objectKey: destination, confirmedAt: new Date() });
	}
	await db.transaction(async (tx) => {
		for (const item of promoted) {
			await tx
				.update(brandAsset)
				.set({
					objectKey: item.objectKey,
					visibility: 'public',
					confirmedAt: item.confirmedAt
				})
				.where(and(eq(brandAsset.id, item.id), eq(brandAsset.storefrontId, parsed.storefrontId)));
			await tx.insert(auditEvent).values(
				buildAuditValues({
					actor,
					action: 'asset.published',
					entityType: 'brand_asset',
					entityId: item.id,
					input: { storefrontId: parsed.storefrontId, objectKey: item.objectKey }
				})
			);
		}
	});
	return {
		assets: promoted.map(({ id, objectKey }) => ({ id, objectKey }))
	};
}

export function getAssetPublicUrl(objectKey: string) {
	assertSafeObjectKey(objectKey);
	if (!objectKey.startsWith('published/')) {
		throw new ProviderError('s3', 'private_asset', 'Draft assets do not have public URLs');
	}
	return `${storageConfig().publicBaseUrl}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

function assertSafeObjectKey(objectKey: string) {
	if (
		!/^(?:drafts|published)\/[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(objectKey) ||
		objectKey.includes('..')
	) {
		throw new ProviderError('s3', 'invalid_object_key', 'Invalid asset object key');
	}
}

function bucketForObjectKey(
	configured: { privateBucket: string; publicBucket: string },
	objectKey: string
) {
	if (objectKey.startsWith('drafts/')) return configured.privateBucket;
	if (objectKey.startsWith('published/')) return configured.publicBucket;
	throw new ProviderError('s3', 'invalid_object_key', 'Invalid asset object key');
}

async function confirmStoredAsset(
	client: S3Client,
	bucket: string,
	asset: { objectKey: string; sizeBytes: number; contentType: string }
) {
	let object;
	try {
		object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.objectKey }));
	} catch (cause) {
		throw new ProviderError('s3', 'asset_not_uploaded', 'Stored asset was not found', {
			retryable: true,
			cause
		});
	}
	if (object.ContentLength !== asset.sizeBytes || object.ContentType !== asset.contentType) {
		throw new ProviderError('s3', 'asset_mismatch', 'Stored asset does not match its declaration');
	}
}
