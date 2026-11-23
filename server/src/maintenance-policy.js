import {validateEnvironment} from './config.js';
export function assertDemoResetAllowed(env,args){
 if(env.APP_ENV!=='demo'||env.DEMO_MODE!=='true')throw new Error('Demo environment required.');
 if(!args.includes('--confirm-demo-reset'))throw new Error('Explicit demo reset confirmation required.');
 validateEnvironment(env);
 if(env.EXPECTED_DATABASE_NAME!=='vkc_demo')throw new Error('The expected demo database is required.');
}
