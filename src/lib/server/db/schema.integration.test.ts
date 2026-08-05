import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;

describe.skipIf(!databaseUrl)('database constraints', () => {
	afterAll(async () => {
		await sql?.end();
	});

	it('enforces storefront status and slug uniqueness', async () => {
		if (!sql) throw new Error('TEST_DATABASE_URL is required');
		const slug = `db-test-${crypto.randomUUID()}`;
		const [created] = await sql<{ id: string }[]>`
			insert into storefront (slug, name)
			values (${slug}, 'Database Test')
			returning id
		`;
		expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

		await expect(
			sql`insert into storefront (slug, name) values (${slug}, 'Duplicate')`
		).rejects.toMatchObject({ code: '23505' });
		await expect(
			sql`insert into storefront (slug, name, status) values (${`${slug}-bad`}, 'Bad', 'running')`
		).rejects.toMatchObject({ code: '23514' });

		await sql`delete from storefront where id = ${created.id}`;
	});

	it('enforces provider event idempotency', async () => {
		if (!sql) throw new Error('TEST_DATABASE_URL is required');
		const key = crypto.randomUUID();
		await sql`
			insert into provider_event (provider, external_key, topic, payload_hash)
			values ('shopify', ${key}, 'orders/create', 'hash')
		`;
		await expect(
			sql`
				insert into provider_event (provider, external_key, topic, payload_hash)
				values ('shopify', ${key}, 'orders/create', 'hash')
			`
		).rejects.toMatchObject({ code: '23505' });
		await sql`delete from provider_event where provider = 'shopify' and external_key = ${key}`;
	});

	it('requires a frozen catalog snapshot before a revision can be published', async () => {
		if (!sql) throw new Error('TEST_DATABASE_URL is required');
		const key = crypto.randomUUID();
		const [store] = await sql<{ id: string }[]>`
			insert into storefront (slug, name)
			values (${`revision-${key}`}, 'Revision Test')
			returning id
		`;
		await expect(
			sql`
				insert into storefront_revision (storefront_id, revision, manifest, published_at)
				values (${store.id}, 1, '{}'::jsonb, now())
			`
		).rejects.toMatchObject({ code: '23514' });
		await sql`delete from storefront where id = ${store.id}`;
	});

	it('keeps historical product mappings while enforcing one active product per garment slot', async () => {
		if (!sql) throw new Error('TEST_DATABASE_URL is required');
		const key = crypto.randomUUID();
		const [store] = await sql<{ id: string }[]>`
			insert into storefront (slug, name)
			values (${`mapping-${key}`}, 'Mapping Test')
			returning id
		`;
		const [family] = await sql<{ id: string }[]>`
			insert into design_family (storefront_id, slug, name, description)
			values (${store.id}, 'design', 'Design', 'Mapping constraint test')
			returning id
		`;
		const firstProduct = `gid://shopify/Product/${key}-1`;
		const secondProduct = `gid://shopify/Product/${key}-2`;
		await sql`
			insert into product_mapping (
				design_family_id, garment, shopify_product_id, shopify_handle, product_snapshot
			)
			values (${family.id}, 'tshirt', ${firstProduct}, ${`first-${key}`}, '{}')
		`;
		await sql`
			update product_mapping
			set active = false
			where shopify_product_id = ${firstProduct}
		`;
		await sql`
			insert into product_mapping (
				design_family_id, garment, shopify_product_id, shopify_handle, product_snapshot
			)
			values (${family.id}, 'tshirt', ${secondProduct}, ${`second-${key}`}, '{}')
		`;

		await expect(
			sql`
				insert into product_mapping (
					design_family_id, garment, shopify_product_id, shopify_handle, product_snapshot
				)
				values (
					${family.id}, 'tshirt', ${`gid://shopify/Product/${key}-3`}, ${`third-${key}`}, '{}'
				)
			`
		).rejects.toMatchObject({ code: '23505' });
		await expect(
			sql`
				insert into product_mapping (
					design_family_id, garment, shopify_product_id, shopify_handle, active, product_snapshot
				)
				values (${family.id}, 'hoodie', ${firstProduct}, ${`duplicate-${key}`}, false, '{}')
			`
		).rejects.toMatchObject({ code: '23505' });

		await sql`delete from storefront where id = ${store.id}`;
	});
});
