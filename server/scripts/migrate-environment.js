import {spawnSync} from 'node:child_process';
import {appEnv} from '../src/config.js';
const requested=process.argv[2];
if(!['production','demo'].includes(requested)||appEnv!==requested)throw new Error('Migration command does not match APP_ENV.');
const r=spawnSync(process.execPath,['server/scripts/db-setup.js'],{stdio:'inherit',env:process.env});process.exitCode=r.status??1;
