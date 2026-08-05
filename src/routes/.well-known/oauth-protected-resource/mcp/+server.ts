import { serverConfig } from '$lib/server/config';
import { mcpScopes } from '$lib/server/services/mcp';
import { json } from '@sveltejs/kit';

export const GET = () =>
	json(
		{
			resource: serverConfig.mcpResourceUri,
			authorization_servers: [serverConfig.pocketId.issuer.replace(/\/$/, '')],
			bearer_methods_supported: ['header'],
			scopes_supported: [...mcpScopes],
			resource_name: 'Shirt Darwin MCP'
		},
		{
			headers: {
				'access-control-allow-origin': '*',
				'cache-control': 'public, max-age=300'
			}
		}
	);

export const HEAD = () =>
	new Response(null, {
		status: 200,
		headers: {
			'access-control-allow-origin': '*',
			'cache-control': 'public, max-age=300',
			'content-type': 'application/json'
		}
	});

export const OPTIONS = () =>
	new Response(null, {
		status: 204,
		headers: {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, HEAD, OPTIONS'
		}
	});
