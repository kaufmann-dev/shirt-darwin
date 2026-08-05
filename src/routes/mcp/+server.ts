import {
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	hostHeaderValidationResponse,
	originValidationResponse,
	requireBearerAuth
} from '@modelcontextprotocol/server';
import { serverConfig } from '$lib/server/config';
import { pocketIdTokenVerifier } from '$lib/server/integrations/pocket-id';
import { createShirtDarwinMcpServer } from '$lib/server/services/mcp';
import type { RequestHandler } from './$types';

const resourceUrl = new URL(serverConfig.mcpResourceUri);
const metadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);
const authenticate = requireBearerAuth({
	verifier: pocketIdTokenVerifier,
	requiredScopes: ['shirt-darwin:read'],
	resourceMetadataUrl: metadataUrl
});
const handler = createMcpHandler(
	(context) => {
		if (!context.authInfo) throw new Error('MCP authentication is required');
		return createShirtDarwinMcpServer(
			context.authInfo,
			context.requestInfo?.headers.get('x-request-id') ?? undefined
		);
	},
	{ responseMode: 'json' }
);

const serve: RequestHandler = async ({ request }) => {
	const allowedHosts = [...serverConfig.trustedHosts, serverConfig.rootHost.toLowerCase()];
	const rejected =
		hostHeaderValidationResponse(request, allowedHosts) ??
		originValidationResponse(request, allowedHosts);
	if (rejected) return rejected;
	const auth = await authenticate(request);
	if (auth instanceof Response) return auth;
	return handler.fetch(request, { authInfo: auth });
};

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
