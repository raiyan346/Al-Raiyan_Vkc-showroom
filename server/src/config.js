import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url))});
process.env.DATABASE_URL ||= 'file:./dev.db';
export const secret=process.env.JWT_SECRET;
if(!secret || secret.length<32 || secret.startsWith('replace-')) throw new Error('Set JWT_SECRET in .env to at least 32 random characters.');
