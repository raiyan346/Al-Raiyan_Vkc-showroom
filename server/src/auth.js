import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {rateLimit} from 'express-rate-limit';
import {db} from './db.js';
import {secret,secureCookies,baseUrl,demoMode,sessionHours,appEnv} from './config.js';
const cookieName=secureCookies?'__Host-vkc_session':'vkc_session';
const csrfName=secureCookies?'__Host-vkc_csrf':'vkc_csrf';
const cookieOptions={httpOnly:true,secure:secureCookies,sameSite:'strict',path:'/'};
const hash=token=>createHmac('sha256',secret).update(token).digest('hex');
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));
const publicUser=user=>({id:user.id,name:user.name,role:user.role});
function csrf(req,res){let token=cookies(req)[csrfName];if(!/^[a-f0-9]{64}$/.test(token||'')){token=randomBytes(32).toString('hex');res.cookie(csrfName,token,cookieOptions);}return token;}
async function identity(req){
 const token=cookies(req)[cookieName];if(!/^[a-f0-9]{64}$/.test(token||''))return null;
 const session=await db.session.findUnique({where:{id:hash(token)}});
 if(!session||session.expiresAt<=new Date())return null;
 const user=await db.user.findUnique({where:{id:session.userId}});
 if(user?.active&&user.tokenVersion===session.tokenVersion){req.sessionExpiresAt=session.expiresAt;return user;}return null;
}
export function installAuthentication(app,route){
 app.get('/api/config',(_req,res)=>res.json({demoMode,registrationEnabled:false,release:process.env.RENDER_GIT_COMMIT||null}));
 app.get('/api/auth/session',route(async(req,res)=>{const user=await identity(req);res.json({authenticated:!!user,...(user?{user:publicUser(user),expiresAt:req.sessionExpiresAt}:{}),demoMode,csrfToken:csrf(req,res)});}));
 app.use('/api',(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const expected=cookies(req)[csrfName]||'',actual=req.get('X-CSRF-Token')||'';
  if(req.get('origin')!==new URL(baseUrl).origin||!/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return res.status(403).json({error:'Request verification failed. Refresh and try again.'});
  if(!req.is('application/json'))return res.status(415).json({error:'JSON data is required.'});
  next();
 });
 const limiter=rateLimit({windowMs:15*60000,limit:10,skipSuccessfulRequests:true,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many login attempts. Try again later.'}});
 async function signIn(req,res,user){
  const previous=cookies(req)[cookieName];if(previous)await db.session.deleteMany({where:{id:hash(previous)}});
  await db.session.deleteMany({where:{expiresAt:{lte:new Date()}}});
  const token=randomBytes(32).toString('hex');
  await db.session.create({data:{id:hash(token),userId:user.id,tokenVersion:user.tokenVersion,expiresAt:new Date(Date.now()+sessionHours*3600000)}});
  const csrfToken=randomBytes(32).toString('hex');
  res.cookie(cookieName,token,{...cookieOptions,maxAge:sessionHours*3600000}).cookie(csrfName,csrfToken,cookieOptions).json({authenticated:true,user:publicUser(user),demoMode,csrfToken,expiresAt:new Date(Date.now()+sessionHours*3600000)});
 }
 app.post('/api/auth/login',limiter,route(async(req,res)=>{
  const {username,password}=req.body||{};
  if(typeof username!=='string'||typeof password!=='string'||password.length>200)return res.status(401).json({error:'Username or password is incorrect.'});
  const user=await db.user.findUnique({where:{username:username.trim()}});
  if(!user?.active||(appEnv==='production'&&user.role!=='OWNER')||!await bcrypt.compare(password,user.passwordHash))return res.status(401).json({error:'Username or password is incorrect.'});
  await signIn(req,res,user);
 }));
 const demoLimiter=rateLimit({windowMs:15*60000,limit:60,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Please wait before opening another demo session.'}});
 app.post('/api/auth/demo',demoLimiter,route(async(req,res)=>{
  if(!demoMode)return res.status(404).json({error:'Not available.'});
  const user=await db.user.findUnique({where:{username:'demo'}});
  if(!user?.active)return res.status(503).json({error:'Demo is being prepared. Please try again.'});
  await signIn(req,res,user);
 }));
 app.post('/api/auth/logout',route(async(req,res)=>{
  const token=cookies(req)[cookieName];if(token)await db.session.deleteMany({where:{id:hash(token)}});
  res.clearCookie(cookieName,cookieOptions).json({ok:true});
 }));
 app.use('/api',route(async(req,res,next)=>{const user=await identity(req);if(!user)return res.status(401).json({error:'Please sign in. Your pending offline bills remain on this device.'});req.user=user;next();}));
 app.use(['/api/users','/api/backups','/api/auth/password'],(req,res,next)=>demoMode?res.status(403).json({error:'Account administration and backups are disabled in the demo.'}):next());
}
