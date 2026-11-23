import bcrypt from 'bcryptjs';
import {db} from '../src/db.js';
import {appEnv} from '../src/config.js';
import {verifyDatabaseIdentity} from '../src/environment.js';
try{
 if(appEnv!=='production'||!process.argv.includes('--confirm-owner-change'))throw new Error('Production owner confirmation required.');
 await verifyDatabaseIdentity();
 const password=process.env.OWNER_PASSWORD;if(!password||password.length<16)throw new Error('Provide a strong owner password through the environment.');
 const user=await db.user.update({where:{username:'owner'},data:{passwordHash:await bcrypt.hash(password,12),tokenVersion:{increment:1}}});
 await db.session.deleteMany({where:{userId:user.id}});console.log('Owner password updated and existing sessions revoked.');
}catch{console.error('Owner password setup refused or failed.');process.exitCode=1;}finally{await db.$disconnect();}
