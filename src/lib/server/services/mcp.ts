import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { brandManifestSchema } from '$lib/domain/brand';
import { serverConfig } from '$lib/server/config';
import { confirmBrandAsset, createBrandAssetUpload } from '$lib/server/storage';
import {
	createStorefrontDraft,
	getStorefrontDraft,
	listStorefrontDrafts,
	replaceStorefrontDraft,
	validateStorefrontDraft
} from './storefront-drafts';
import { getMetricsSummary, listIntegrationIssues } from './reporting';
import type { Actor } from './audit';

const READ_SCOPE = 'shirt-darwin:read';
const DRAFT_SCOPE = 'shirt-darwin:drafts:write';
const ASSET_SCOPE = 'shirt-darwin:assets:write';

export const mcpScopes = [READ_SCOPE, DRAFT_SCOPE, ASSET_SCOPE] as const;

export function createShirtDarwinMcpServer(authInfo: AuthInfo, requestId?: string) {
	const server = new McpServer(
		{ name: 'shirt-darwin', version: '1.0.0' },
		{ capabilities: { tools: {}, resources: {} } }
	);
	const actor: Actor = {
		subject: String(authInfo.extra?.subject ?? ''),
		client: authInfo.clientId,
		requestId
	};
	if (!actor.subject) throw new Error('Authenticated MCP subject is missing');

	server.registerResource(
		'brand-schema-v1',
		'shirt-darwin://brand-schema/v1',
		{ title: 'Brand manifest schema v1', mimeType: 'application/schema+json' },
		async (uri) => {
			requireScope(authInfo, READ_SCOPE);
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'application/schema+json',
						text: JSON.stringify(z.toJSONSchema(brandManifestSchema))
					}
				]
			};
		}
	);

	server.registerTool(
		'brand_schema_get',
		{
			title: 'Get brand manifest schema',
			description: 'Returns the complete version 1 structured storefront schema.',
			inputSchema: z.object({})
		},
		async () =>
			result(authInfo, READ_SCOPE, {
				schemaVersion: 1,
				schema: z.toJSONSchema(brandManifestSchema)
			})
	);

	server.registerTool(
		'storefront_list',
		{
			title: 'List storefront drafts',
			description: 'Lists draft storefront metadata and manifests without customer or order data.',
			inputSchema: z.object({})
		},
		async () => result(authInfo, READ_SCOPE, { storefronts: await listStorefrontDrafts() })
	);

	server.registerTool(
		'storefront_draft_get',
		{
			title: 'Get storefront draft',
			inputSchema: z.object({ storefrontId: z.string().uuid() })
		},
		async ({ storefrontId }) =>
			result(authInfo, READ_SCOPE, { storefront: await getStorefrontDraft(storefrontId) })
	);

	server.registerTool(
		'storefront_draft_create',
		{
			title: 'Create storefront draft',
			description: 'Creates an unpublished storefront draft. This never publishes it.',
			inputSchema: z.object({
				slug: z.string().min(2).max(48),
				name: z.string().min(2).max(64),
				nicheBrief: z.string().min(1).max(4000),
				manifest: brandManifestSchema.optional()
			})
		},
		async (input) => {
			requireScope(authInfo, DRAFT_SCOPE);
			return toolResult({ storefront: await createStorefrontDraft(input, actor) });
		}
	);

	server.registerTool(
		'storefront_draft_replace',
		{
			title: 'Replace storefront draft',
			description:
				'Atomically replaces a draft when expectedRevision is current. This never publishes it.',
			inputSchema: z.object({
				storefrontId: z.string().uuid(),
				expectedRevision: z.number().int().positive(),
				manifest: brandManifestSchema
			})
		},
		async (input) => {
			requireScope(authInfo, DRAFT_SCOPE);
			return toolResult({ storefront: await replaceStorefrontDraft(input, actor) });
		}
	);

	server.registerTool(
		'asset_upload_create',
		{
			title: 'Create asset upload',
			description: 'Returns a constrained, ten-minute S3-compatible upload URL for a draft asset.',
			inputSchema: z.object({
				storefrontId: z.string().uuid(),
				kind: z.enum(['image', 'font', 'video', 'print-file']),
				contentType: z.string(),
				sizeBytes: z.number().int().positive(),
				originalName: z.string().min(1).max(255)
			})
		},
		async (input) => {
			requireScope(authInfo, ASSET_SCOPE);
			return toolResult({ upload: await createBrandAssetUpload(input, actor) });
		}
	);

	server.registerTool(
		'asset_attach',
		{
			title: 'Attach uploaded asset',
			description: 'Verifies the declared object exists and matches its size and content type.',
			inputSchema: z.object({ storefrontId: z.string().uuid(), assetId: z.string().uuid() })
		},
		async (input) => {
			requireScope(authInfo, ASSET_SCOPE);
			return toolResult({ asset: await confirmBrandAsset(input, actor) });
		}
	);

	server.registerTool(
		'storefront_draft_validate',
		{
			title: 'Validate storefront draft',
			description: 'Checks manifest structure and its referenced draft records without publishing.',
			inputSchema: z.object({ storefrontId: z.string().uuid() })
		},
		async ({ storefrontId }) =>
			result(authInfo, READ_SCOPE, await validateStorefrontDraft(storefrontId))
	);

	server.registerTool(
		'storefront_preview_get',
		{
			title: 'Get authenticated preview URL',
			inputSchema: z.object({ storefrontId: z.string().uuid() })
		},
		async ({ storefrontId }) => {
			requireScope(authInfo, READ_SCOPE);
			const draft = await getStorefrontDraft(storefrontId);
			return toolResult({
				previewUrl: draft
					? `${serverConfig.appOrigin}/admin/storefronts/${encodeURIComponent(storefrontId)}/preview?revision=${draft.revision}`
					: null
			});
		}
	);

	server.registerTool(
		'metrics_summary_get',
		{
			title: 'Get aggregate performance metrics',
			description:
				'Returns aggregate financial and advertising metrics; never order or customer records.',
			inputSchema: z.object({ storefrontId: z.string().uuid().optional() })
		},
		async ({ storefrontId }) => result(authInfo, READ_SCOPE, await getMetricsSummary(storefrontId))
	);

	server.registerTool(
		'issues_list',
		{
			title: 'List integration issues',
			inputSchema: z.object({
				provider: z.enum(['shopify', 'printful', 'meta', 's3']).optional(),
				status: z.enum(['open', 'resolved']).optional(),
				limit: z.number().int().min(1).max(100).optional()
			})
		},
		async (input) => result(authInfo, READ_SCOPE, { issues: await listIntegrationIssues(input) })
	);

	return server;
}

function requireScope(authInfo: AuthInfo, scope: string) {
	if (!authInfo.scopes.includes(scope)) throw new Error(`Missing required scope: ${scope}`);
}

function result(authInfo: AuthInfo, scope: string, value: unknown) {
	requireScope(authInfo, scope);
	return toolResult(value);
}

function toolResult(value: unknown) {
	const plain = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(plain) }],
		structuredContent: plain
	};
}
