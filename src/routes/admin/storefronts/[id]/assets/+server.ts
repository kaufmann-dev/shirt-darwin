import { confirmBrandAsset, createBrandAssetUpload } from '$lib/server/storage';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdmin } from '../../../_auth.server';

const createSchema = z
	.object({
		kind: z.enum(['image', 'font', 'video', 'print-file']),
		contentType: z.enum([
			'image/png',
			'image/jpeg',
			'image/webp',
			'image/avif',
			'image/gif',
			'font/woff2',
			'video/mp4'
		]),
		sizeBytes: z
			.number()
			.int()
			.positive()
			.max(100 * 1024 * 1024),
		originalName: z.string().trim().min(1).max(180)
	})
	.superRefine((value, context) => {
		if (value.kind === 'print-file' && value.contentType !== 'image/png') {
			context.addIssue({
				code: 'custom',
				message: 'Production print files must be PNG',
				path: ['contentType']
			});
		}
	});

const confirmSchema = z.object({ assetId: z.string().uuid() });

export const POST: RequestHandler = async (event) => {
	const user = requireAdmin(event.locals);
	const storefrontId = z.string().uuid().safeParse(event.params.id);
	if (!storefrontId.success) error(404, 'Storefront not found');
	const body = createSchema.safeParse(await event.request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid asset metadata');
	try {
		return json(
			await createBrandAssetUpload(
				{ storefrontId: storefrontId.data, ...body.data },
				{ subject: user.id, client: 'admin', requestId: event.locals.requestId }
			)
		);
	} catch (cause) {
		console.error('Could not create asset upload', cause);
		error(502, 'Could not prepare object storage upload');
	}
};

export const PATCH: RequestHandler = async (event) => {
	const user = requireAdmin(event.locals);
	const storefrontId = z.string().uuid().safeParse(event.params.id);
	if (!storefrontId.success) error(404, 'Storefront not found');
	const body = confirmSchema.safeParse(await event.request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid asset confirmation');
	try {
		return json(
			await confirmBrandAsset(
				{ storefrontId: storefrontId.data, assetId: body.data.assetId },
				{ subject: user.id, client: 'admin', requestId: event.locals.requestId }
			)
		);
	} catch (cause) {
		console.error('Could not confirm asset upload', cause);
		error(502, 'Could not confirm object storage upload');
	}
};
