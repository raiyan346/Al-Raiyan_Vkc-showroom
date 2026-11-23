import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url))});
export const appEnv=process.env.APP_ENV||'development';
export const demoMode=appEnv==='demo';
export const secureCookies=process.env.NODE_ENV==='production';
export const secret=process.env.SESSION_SECRET||(appEnv==='development'?process.env.JWT_SECRET:undefined);
export const baseUrl=process.env.APP_BASE_URL||'http://localhost:5173';
export const sessionHours=8;
export function validateEnvironment(env=process.env){
 const mode=env.APP_ENV||'development';
 if(!['production','demo','development'].includes(mode))throw new Error('Invalid APP_ENV.');
 if(env.PUBLIC_ACCESS==='true'||env.PUBLIC_REGISTRATION_ENABLED==='true')throw new Error('Public access and registration must be disabled.');
 if(mode==='development'){if(env.NODE_ENV==='production')throw new Error('Hosted apps require explicit APP_ENV.');return;}
 if(env.NODE_ENV!=='production')throw new Error('Hosted environments require NODE_ENV=production.');
 if(env.DEMO_MODE!==String(mode==='demo'))throw new Error('DEMO_MODE must match APP_ENV.');
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<48||/^(replace|choose)-/.test(env.SESSION_SECRET))throw new Error('A unique SESSION_SECRET of at least 48 characters is required.');
 if(env.DB_PROVIDER!=='postgresql')throw new Error('Hosted environments require PostgreSQL.');
 if(!env.APP_BASE_URL?.startsWith('https://'))throw new Error('APP_BASE_URL must use HTTPS.');
 const expected=env.EXPECTED_DATABASE_HOST;
 if(!expected||!env.EXPECTED_DATABASE_NAME)throw new Error('Database identity pins are required.');
 for(const key of ['DATABASE_URL','DIRECT_URL']){
  let url;try{url=new URL(env[key]);}catch{throw new Error(`${key} is required.`);}
  if(!['postgresql:','postgres:'].includes(url.protocol)||url.hostname.replace('-pooler.','.')!==expected||decodeURIComponent(url.pathname.slice(1))!==env.EXPECTED_DATABASE_NAME)throw new Error('Database does not match this environment.');
  if(!['require','verify-full'].includes(url.searchParams.get('sslmode')))throw new Error('Database TLS is required.');
 }
 if(mode==='demo'&&(!env.PRODUCTION_DATABASE_HOST||env.PRODUCTION_DATABASE_HOST===expected))throw new Error('Demo must use an independent database host.');
 if(mode==='production'&&env.SEED_SAMPLE_DATA==='true')throw new Error('Sample data is forbidden in production.');
}
validateEnvironment();
if(!secret||secret.length<32||/^(replace|choose)-/.test(secret))throw new Error('Configure a strong SESSION_SECRET.');
