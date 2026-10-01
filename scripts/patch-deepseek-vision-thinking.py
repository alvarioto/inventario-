from pathlib import Path

core_path = Path('src/lib/ai-core.mjs')
test_path = Path('tests/core.mjs')
core = core_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')

replacements = [
    (
        "export async function deepseek(messages,{key,model='deepseek-flash',fetcher=fetch,maxTokens=1800,timeoutMs=55000,retries=0,jsonMode=true}){",
        "export async function deepseek(messages,{key,model='deepseek-flash',fetcher=fetch,maxTokens=1800,timeoutMs=55000,retries=0,jsonMode=true,thinking='disabled',reasoningEffort='none'}){"
    ),
    (
        "   const body={model,messages,max_tokens:maxTokens,stream:false,thinking:{type:'disabled'}};",
        "   const thinkingType=thinking==='enabled'?'enabled':'disabled';\n   const body={model,messages,max_tokens:maxTokens,stream:false,thinking:{type:thinkingType}};\n   if(thinkingType==='enabled')body.reasoning_effort=['low','high','max'].includes(reasoningEffort)?reasoningEffort:'high';"
    ),
    (
        "  ],{...config,maxTokens:500,timeoutMs:18000,retries:0,jsonMode:false});",
        "  ],{...config,maxTokens:900,timeoutMs:30000,retries:0,jsonMode:false,thinking:'enabled',reasoningEffort:'high'});"
    ),
    (
        " ],{...config,maxTokens:1200,timeoutMs:30000,retries:1,jsonMode:false});",
        " ],{...config,maxTokens:1600,timeoutMs:42000,retries:1,jsonMode:false,thinking:'enabled',reasoningEffort:'high'});"
    ),
    (
        "   ],{...config,maxTokens:1200,timeoutMs:25000,retries:0,jsonMode:false});",
        "   ],{...config,maxTokens:1600,timeoutMs:38000,retries:0,jsonMode:false,thinking:'enabled',reasoningEffort:'high'});"
    ),
    (
        "  ...rows.map((url,index)=>({type:'image_url',image_url:{url},detail:index===0?'high':'low'}))",
        "  ...rows.map(url=>({type:'image_url',image_url:{url,detail:'original'}}))"
    ),
    (
        "    ...images.slice(0,2).map((url,index)=>({type:'image_url',image_url:{url},detail:index===0?'high':'low'}))",
        "    ...images.slice(0,2).map(url=>({type:'image_url',image_url:{url,detail:'original'}}))"
    ),
]

for old, new in replacements:
    count = core.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, got {count}: {old[:100]}')
    core = core.replace(old, new, 1)

old_test = " assert.equal(body.thinking?.type,'disabled');\n assert.equal(body.reasoning_effort,undefined);"
new_test = " assert.equal(body.thinking?.type,'enabled');\n assert.equal(body.reasoning_effort,'high');"
if tests.count(old_test) != 1:
    raise SystemExit(f'Expected identify thinking assertion once, got {tests.count(old_test)}')
tests = tests.replace(old_test, new_test, 1)

old_static = "assert.match(currentCoreSource,/thinking:\\{type:'disabled'\\}/);"
new_static = "assert.match(currentCoreSource,/thinking='disabled'/);\nassert.match(currentCoreSource,/reasoningEffort='none'/);"
if tests.count(old_static) != 1:
    raise SystemExit(f'Expected static thinking assertion once, got {tests.count(old_static)}')
tests = tests.replace(old_static, new_static, 1)

# Add a regression that the shared helper still defaults to non-thinking mode,
# so pricing/search behavior is not silently changed by this vision-only upgrade.
anchor = "assert.equal((await deepseek([{role:'user',content:'test'}],{key:'test',fetcher:fakeFetch})).summary,'Ficha contrastada');\n"
addition = """assert.equal((await deepseek([{role:'user',content:'test'}],{key:'test',fetcher:fakeFetch})).summary,'Ficha contrastada');

let defaultDeepSeekBody=null;
const defaultThinkingFetch=async(_url,init)=>{
 defaultDeepSeekBody=JSON.parse(init.body);
 return new Response(JSON.stringify({choices:[{message:{content:'{\"ok\":true}'}}]}),{status:200,headers:{'content-type':'application/json'}});
};
await deepseek([{role:'user',content:'default thinking guard'}],{key:'test',fetcher:defaultThinkingFetch});
assert.equal(defaultDeepSeekBody.thinking?.type,'disabled');
assert.equal(defaultDeepSeekBody.reasoning_effort,undefined);
"""
if tests.count(anchor) != 1:
    raise SystemExit(f'Expected deepseek anchor once, got {tests.count(anchor)}')
tests = tests.replace(anchor, addition, 1)

core_path.write_text(core, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
print('DeepSeek vision thinking patch applied')
