import { z } from 'zod';

export const supportContactSchema = z.object({
	email: z.string().trim().email(),
	responseNote: z.string().trim().min(1).max(300)
});

export type SupportContact = z.infer<typeof supportContactSchema>;
