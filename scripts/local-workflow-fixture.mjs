// Explicit local browser fixture. No production route imports this file.
// Credentials stay in memory; the loopback launcher creates real Supabase sessions.
import { createServer } from "node:http";
import { createLocalFixtureCookies } from "../src/server/test/local-fixture-cookies.ts";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

if (process.env.MMHR_LOCAL_WORKFLOW_FIXTURE !== "1") throw new Error("Explicit local fixture opt-in required");
const local = JSON.parse(process.env.MMHR_LOCAL_FIXTURE_CONFIG ?? "null");
delete process.env.MMHR_LOCAL_FIXTURE_CONFIG;
const config = readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8");
const dbPort = config.match(/\[db\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];
const apiPort = config.match(/\[api\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];
const dbUrl = new URL(local.DB_URL); const apiUrl = new URL(local.API_URL);
if (dbUrl.hostname!=="127.0.0.1" || dbUrl.port!==dbPort || apiUrl.hostname!=="127.0.0.1" || apiUrl.port!==apiPort) throw new Error("Fixture requires this project's local Supabase endpoints");
const owner = postgres(local.DB_URL,{max:1,onnotice:()=>{}});
const admin = createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const runId = randomUUID();
const actors = new Map();
const appOrigin = "http://127.0.0.1:3006";
const launcherOrigin = "http://127.0.0.1:3076";
const nonce = randomBytes(24).toString("hex");
function totp(secret) {
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits=[...secret.toUpperCase().replace(/=+$/,"")].map(c=>alphabet.indexOf(c).toString(2).padStart(5,"0")).join("");
  const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac("sha1",key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,"0");
}
async function principal(label,staff=false,existingId=null) {
  const existing=existingId ? (await owner`SELECT id,auth_user_id,normalized_email FROM public.identities WHERE id=${existingId}::uuid`)[0] : null;
  if(existing && !/^workflow-(staff|reviewer|customer|vendor)-[0-9a-f-]+@example\.invalid$/.test(existing.normalized_email)) throw new Error("Refusing non-fixture administrator");
  if(existing && staff && process.env.MMHR_LOCAL_FIXTURE_ROTATE_MFA!=="1") {
    throw new Error("Resuming synthetic staff requires explicit approval to replace their generated MFA factors");
  }
  const email=existing?.normalized_email ?? `workflow-${label}-${runId}@example.invalid`;
  const password=randomBytes(32).toString("base64url");
  const created=existing ? await admin.auth.admin.updateUserById(existing.auth_user_id,{password}) : await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error || !created.data.user) throw new Error(`Synthetic ${label} account creation failed`);
  const identityId=existing?.id ?? randomUUID();
  if(!existing) await owner`INSERT INTO public.identities(id,auth_user_id,normalized_email,email_verified_at,status,activated_at,synchronized_at,migration_review_required)
    VALUES(${identityId}::uuid,${created.data.user.id}::uuid,${email},clock_timestamp(),'active',clock_timestamp(),clock_timestamp(),false)`;
  const actor={label,email,password,identityId,subject:created.data.user.id,staff};
  if(staff) {
    if(existing) {
      const factors=await admin.auth.admin.mfa.listFactors({userId:actor.subject});
      if(factors.error || factors.data.factors.some(factor=>!factor.friendly_name?.startsWith("Local workflow"))) {
        throw new Error("Refusing to replace unrecognized MFA factors");
      }
      for(const factor of factors.data.factors) {
        const removed=await admin.auth.admin.mfa.deleteFactor({userId:actor.subject,id:factor.id});
        if(removed.error) throw new Error("Synthetic MFA replacement failed");
      }
    }
    const client=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    if((await client.auth.signInWithPassword({email,password})).error) throw new Error("Synthetic staff login failed");
    const enrollment=await client.auth.mfa.enroll({factorType:"totp",friendlyName:`Local workflow ${runId}`});
    if(enrollment.error) throw new Error(`Synthetic MFA enrollment failed: ${enrollment.error.code}`);
    actor.factorId=enrollment.data.id; actor.secret=enrollment.data.totp.secret;
    const verify=await client.auth.mfa.challengeAndVerify({factorId:actor.factorId,code:totp(actor.secret)});
    if(verify.error) throw new Error("Synthetic MFA verification failed");
    actor.client=client;

  }
  actors.set(label,actor); return actor;
}
async function membership(org,actor,role="organization_admin") {
  await owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
    VALUES(${org}::uuid,${actor.identityId}::uuid,${actor.subject}::uuid,
      ${role==="organization_admin"?"admin":"contributor"}::public.org_role,${role},false)`;
}
async function organization(name,type) {
  const [row]=await owner`INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
    VALUES(${name},${type}::public.organization_type,'active',clock_timestamp(),false) RETURNING id`;
  return row.id;
}
const [bootstrap]=await owner`SELECT state,target_identity_id,second_target_identity_id FROM public.security_bootstrap_state WHERE singleton_key=1`;
if(bootstrap && bootstrap.state!=="consumed") throw new Error("Local bootstrap requires review before fixture startup");
const staff=await principal("staff",true,bootstrap?.target_identity_id);
const reviewer=await principal("reviewer",true,bootstrap?.second_target_identity_id);
const organizationAdmin=await principal("administrator",true);
actors.delete("administrator");
// Retire quarantined legacy test workspaces without clearing their review flags.
await owner`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp() WHERE status='active' AND migration_review_required AND name IN ('R1.3 customer','R1.3 other')`;
// Repair only known synthetic workspaces left by local fixture runs.
const oldOrgs=await owner`SELECT id FROM public.orgs WHERE status='active' AND (name LIKE 'Synthetic%browser workflow' OR name IN ('R1.3 customer','R1.3 other'))`;
for(const org of oldOrgs) await membership(org.id,organizationAdmin);

if(!bootstrap) {
  const first=await staff.client.auth.getClaims(),second=await reviewer.client.auth.getClaims();
  if(first.error || second.error || first.data?.claims.aal!=="aal2" || second.data?.claims.aal!=="aal2") throw new Error("Verified bootstrap MFA required");
  await owner.begin(async(sql)=>{
    await sql`SELECT mmhr_private.r1_lock_security()`;
    const [foreign]=await sql`SELECT count(*)::int count FROM public.platform_role_assignments a JOIN public.identities i ON i.id=a.identity_id WHERE a.state='active' AND i.normalized_email NOT LIKE 'workflow-%@example.invalid'`;
    if(foreign.count) throw new Error("Refusing to change non-fixture platform authority");
    await sql`UPDATE public.platform_role_assignments SET state='revoked',revoked_at=clock_timestamp(),revocation_reason='Repair incomplete synthetic bootstrap' WHERE state='active'`;
    await sql`SELECT mmhr_private.r1_prepare_super_admin_bootstrap(${staff.identityId}::uuid,${reviewer.identityId}::uuid,'product:local-synthetic-fixture','security:local-synthetic-fixture',${randomUUID()}::uuid)`;
    const a=first.data.claims,b=second.data.claims;
    await sql`SELECT mmhr_private.r1_complete_super_admin_bootstrap(${a.sub}::uuid,${a.session_id}::uuid,${new Date(a.exp*1000).toISOString()}::timestamptz,${b.sub}::uuid,${b.session_id}::uuid,${new Date(b.exp*1000).toISOString()}::timestamptz,${randomUUID()}::uuid)`;
  });
}
const resumeIntake=process.env.MMHR_LOCAL_FIXTURE_RESUME_INTAKE;
if(resumeIntake) {
  if(!/^[0-9a-f-]{36}$/.test(resumeIntake)) throw new Error("Invalid local resume intake");
  const [saved]=await owner`SELECT i.organization_id,i.created_by_identity_id,u.normalized_email FROM public.intakes i JOIN public.identities u ON u.id=i.created_by_identity_id WHERE i.id=${resumeIntake}::uuid`;
  if(!saved || !saved.normalized_email.startsWith('workflow-customer-')) throw new Error("Only synthetic intakes can resume");
  const customer=await principal('customer',false,saved.created_by_identity_id);customer.org=saved.organization_id;
  staff.org=customer.org;reviewer.org=customer.org;
  const [savedVendor]=await owner`SELECT id FROM public.identities WHERE normalized_email=${saved.normalized_email.replace('workflow-customer-','workflow-vendor-')}`;
  const vendor=await principal('vendor',false,savedVendor.id);
  const [member]=await owner`SELECT org_id FROM public.org_members WHERE identity_id=${vendor.identityId}::uuid AND status='active'`;
  vendor.org=member.org_id;
} else {
const customer=await principal("customer");
const vendor=await principal("vendor");
const customerOrg=await organization("Synthetic customer · browser workflow","customer");
await membership(customerOrg,organizationAdmin);
for(const actor of [staff,reviewer,customer]) { await membership(customerOrg,actor,"contributor"); actor.org=customerOrg; }
for(const actor of [staff,reviewer]) await owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason) VALUES(${actor.identityId}::uuid,'workspace.access','organization',${customerOrg}::uuid,${'organization:'+customerOrg},'allow',${actor===staff?reviewer.identityId:staff.identityId}::uuid,'Local synthetic staff workspace')`;
await owner`INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason)
  VALUES(${customerOrg}::uuid,'customer',${staff.identityId}::uuid,'Approved local browser fixture')`;
for(let index=1;index<=6;index++) {
  const org=await organization(`Synthetic provider ${index} · browser workflow`,"vendor");
  const profile=randomUUID(),product=randomUUID(),source=randomUUID(),fact=randomUUID(),evidence=randomUUID();
  await membership(org,organizationAdmin);
  if(index===1) { await membership(org,vendor); vendor.org=org; }
  await owner`INSERT INTO public.portal_access_grants(organization_id,portal,issued_by_identity_id,issue_reason)
    VALUES(${org}::uuid,'vendor',${staff.identityId}::uuid,'Approved local browser fixture')`;
  await owner`INSERT INTO public.vendor_profiles(id,organization_id,status,approved_at,approved_by_identity_id,created_by_identity_id,updated_by_identity_id)
    VALUES(${profile}::uuid,${org}::uuid,'active',clock_timestamp(),${staff.identityId}::uuid,${staff.identityId}::uuid,${staff.identityId}::uuid)`;
  await owner`INSERT INTO public.products(id,organization_id,vendor_profile_id,stable_key,name,status,created_by_identity_id,updated_by_identity_id)
    VALUES(${product}::uuid,${org}::uuid,${profile}::uuid,${`workflow_product_${index}`},${`Synthetic payroll ${index}`},'active',${staff.identityId}::uuid,${staff.identityId}::uuid)`;
  await owner`INSERT INTO public.vendor_sources(id,organization_id,vendor_profile_id,uri,source_type,captured_at,active,created_by_identity_id)
    VALUES(${source}::uuid,${org}::uuid,${profile}::uuid,'https://example.invalid/local-fixture','manual',clock_timestamp()-interval '1 day',true,${staff.identityId}::uuid)`;
  await owner`INSERT INTO public.vendor_facts(id,organization_id,vendor_profile_id,product_id,field_key,value,observed_at,status,created_by_identity_id)
    VALUES(${fact}::uuid,${org}::uuid,${profile}::uuid,${product}::uuid,'input_payroll','yes',clock_timestamp()-interval '1 day','published',${staff.identityId}::uuid)`;
  await owner`INSERT INTO public.vendor_evidence_versions(id,organization_id,fact_id,source_id,version,content_hash,captured_at,fresh_until,citation)
    VALUES(${evidence}::uuid,${org}::uuid,${fact}::uuid,${source}::uuid,1,${"a".repeat(64)},clock_timestamp()-interval '1 day',clock_timestamp()+interval '2 days','Synthetic local evidence')`;
  await owner`INSERT INTO public.vendor_fact_reviews(organization_id,evidence_id,reviewer_identity_id,decision,decided_at,reason)
    VALUES(${org}::uuid,${evidence}::uuid,${staff.identityId}::uuid,'approved',clock_timestamp()-interval '1 hour','Synthetic approved input')`;
}
}
await owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
console.log("Synthetic bootstrap and administration capacity verified");
await owner`NOTIFY pgrst,'reload schema'`;

const menu=`<!doctype html><html><head><meta charset="utf-8"><title>MMHR local workflow test</title></head><body style="font:18px system-ui;max-width:720px;margin:60px auto;padding:24px"><h1>MMHR local workflow test</h1><p>Synthetic accounts. Local Supabase only. No external messages.</p>${[...actors.keys()].map(label=>`<p><a href="/${nonce}/open/${label}">Open synthetic ${label}</a></p>`).join("")}</body></html>`;
const server=createServer(async(req,res)=>{
  try {
    if(req.headers.host!=="127.0.0.1:3076") {res.writeHead(403).end();return;}
    res.setHeader("Cache-Control","no-store"); res.setHeader("Referrer-Policy","no-referrer");
    res.setHeader("Content-Security-Policy",`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${appOrigin}; frame-ancestors 'none'`);
    if(req.method==="GET" && req.url===`/${nonce}`) {res.setHeader("Content-Type","text/html");res.end(menu);return;}
    const label=req.url?.startsWith(`/${nonce}/open/`)?req.url.slice(`/${nonce}/open/`.length):null;
    const actor=actors.get(label);
    if(req.method!=="GET" || !actor) {res.writeHead(403).end();return;}
    const cookies=createLocalFixtureCookies(req.headers.cookie??"",{freshLocalSession:true});
    const client=createServerClient(local.API_URL,local.ANON_KEY,{cookies});
    const signed=await client.auth.signInWithPassword({email:actor.email,password:actor.password});
    if(signed.error) throw new Error("Local sign-in failed");
    if(actor.staff) {
      const verified=await client.auth.mfa.challengeAndVerify({factorId:actor.factorId,code:totp(actor.secret)});
      if(verified.error) throw new Error("Local MFA failed; wait for the next code period and retry");
      const verifiedClaims=await client.auth.getClaims();
      if(verifiedClaims.error || verifiedClaims.data?.claims.aal!=="aal2") throw new Error("Local MFA session not verified");
    }
    const latest=new Map(cookies.responseCookies().map(cookie=>[cookie.name,cookie]));
    res.setHeader("Set-Cookie",[...latest.values()].map(cookie=>`${cookie.name}=${encodeURIComponent(cookie.value)}; Path=/; SameSite=Lax; Max-Age=${cookie.options.maxAge??3600}`).concat(`mmhr-organization-id=${actor.org}; Path=/; HttpOnly; SameSite=Lax`));
    res.writeHead(303,{Location:`${appOrigin}/${actor.staff?"admin/evaluations":actor.label==="customer"?"customer":"vendor"}`}).end();
  } catch { res.writeHead(500,{"Content-Type":"text/plain"}).end("Local fixture sign-in failed. Check the test service."); }
});
server.listen(3076,"127.0.0.1",()=>console.log(`Local synthetic workflow launcher: ${launcherOrigin}/${nonce}`));
process.on("SIGINT",()=>{server.close();void owner.end({timeout:5});});

