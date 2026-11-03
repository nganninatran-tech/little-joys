// Bumble's server-side gardening guide. The API key never reaches the browser.
// This endpoint is inactive until OPENAI_API_KEY is set in Netlify's Functions environment.
const reply=(message,status=200)=>new Response(JSON.stringify({reply:message}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const hits=new Map();
export default async function handler(request){
  if(request.method!=='POST')return reply('Method not allowed',405);
  const origin=request.headers.get('origin');
  const requestOrigin=new URL(request.url).origin;
  if(origin&&origin!==requestOrigin)return reply('Origin not allowed',403);
  const key=Netlify.env.get('OPENAI_API_KEY');
  if(!key)return reply('Bumble’s expanded flower guide needs its private AI connection configured.',503);
  const ip=(request.headers.get('x-nf-client-connection-ip')||request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
  const now=Date.now(),recent=(hits.get(ip)||[]).filter(t=>now-t<600000);
  if(recent.length>=15)return reply('Bumble has answered quite a few questions! Please try again in a little while.',429);
  recent.push(now);hits.set(ip,recent);
  if(hits.size>500)for(const [addr,arr] of hits){if(arr.every(t=>now-t>600000))hits.delete(addr);}
  const length=Number(request.headers.get('content-length')||0);
  if(length>4000)return reply('That question is too long for Bumble.',413);
  let body;
  try{body=await request.json()}catch{return reply('Please send Bumble a flower question.',400);}
  const message=typeof body?.message==='string'?body.message.trim().slice(0,500):'';
  if(!message)return reply('Please ask Bumble a question.',400);
  const context=Array.isArray(body?.history)?body.history.slice(-8).filter(m=>m&&['you','bumble'].includes(m.who)&&typeof m.text==='string').map(m=>({role:m.who==='you'?'user':'assistant',content:m.text.slice(0,450)})):[];
  try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
    let result;
    try{result=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{authorization:'Bearer '+key,'content-type':'application/json'},
      body:JSON.stringify({
        model:'gpt-4.1-mini',store:false,max_output_tokens:500,
        instructions:'You are Bumble, a friendly, curious bee and serious horticultural guide in the Little Joys journaling app. Help with flowers, ornamental plants, pollinators, propagation, common diseases, seasonality, light, watering, soil, and plant identification questions. Answer any flower species, not just the 24 in the Flower Clock. Give clear, practical, plant-specific guidance in 2-5 short sentences, asking for location or botanical species only when it materially affects advice. Distinguish species and cultivar differences; never fabricate precise horticultural claims, cultivar identity, or a photo diagnosis. For pet toxicity (especially dogs or cats), be conservative, note uncertainty, recommend checking ASPCA or a veterinarian with exact botanical ID, and never recommend feeding plants to pets. If a pet might have ingested a toxic plant, recommend prompt veterinarian contact. Do not claim to know live weather, local conditions, user records, or their location. Do not ask for personal information or expose secrets. Maintain Bumble’s light warmth without excessive roleplay.',
        input:[...context,{role:'user',content:message}]
      })
    });}finally{clearTimeout(timeout);}
    if(!result.ok)return reply('My flower books are temporarily out of reach. Please try again soon.',502);
    const data=await result.json();
    const text=typeof data.output_text==='string'?data.output_text:
      (data.output||[]).flatMap(part=>(part.content||[]).filter(c=>c.type==='output_text').map(c=>c.text||'')).join('\n');
    return reply(text?.trim().slice(0,1700)||'I could not find a clear answer. Try asking about a specific flower.');
  }catch{return reply('My garden connection is having trouble. Please try again soon.',502);}
}

// Netlify enforces this across instances; the in-memory check above is an extra safeguard.
export const config={path:'/api/bumble',rateLimit:{windowLimit:12,windowSize:60,aggregateBy:['ip','domain']}};
