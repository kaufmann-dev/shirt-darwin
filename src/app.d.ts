import type { Session, User } from 'better-auth';

declare global {
	namespace App {
		interface Locals {
			brandSlug: string | null;
			requestId: string;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			user?: Pick<User, 'id' | 'name' | 'email'> | null;
		}
	}
}

export {};
