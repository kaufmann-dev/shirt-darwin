import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverConfig } from '$lib/server/config';
import * as schema from './schema';

export const sqlClient = postgres(serverConfig.databaseUrl, {
	max: 8,
	idle_timeout: 20,
	connect_timeout: 10,
	prepare: false
});

export const db = drizzle(sqlClient, { schema });

export async function checkDatabase() {
	await sqlClient`select 1`;
}
