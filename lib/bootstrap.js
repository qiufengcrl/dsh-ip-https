/**
 * HTML <head> IIFE: pin connection.isLoopback before official settings
 * surfaces bind (they choose host vs memory during apply).
 *
 * Technique adapted from dsh-full-remote (MIT): wrap __ModuleLoader__ so
 * @deepseek-ai/dsh-client-connection's apply() pins isLoopback on the
 * connection handle. Do not assign ctx.provide — Context is a Proxy.
 *
 * Also polyfills crypto.randomUUID on insecure origins.
 */
export const CONNECTION_CLIENT_ID = '@deepseek-ai/dsh-client-connection'
export const TRUST_FLAG = '__DSH_IP_HTTPS_TRUSTED__'
export const BOOTSTRAP_FAILED = '__DSH_IP_HTTPS_BOOTSTRAP_FAILED__'
export const DATA_PLUGIN = 'dsh-ip-https'

export const PAGE_BOOTSTRAP_SOURCE = '(function(){'
  + 'var c=globalThis.crypto;'
  + 'if(c&&typeof c.randomUUID!=="function"&&typeof c.getRandomValues==="function"){'
  + 'function u(){var b=c.getRandomValues(new Uint8Array(16));'
  + 'b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=[];'
  + 'for(var i=0;i<16;i++){var s=b[i].toString(16);h[i]=s.length===1?"0"+s:s}'
  + 'return h[0]+h[1]+h[2]+h[3]+"-"+h[4]+h[5]+"-"+h[6]+h[7]+"-"+h[8]+h[9]+"-"+h[10]+h[11]+h[12]+h[13]+h[14]+h[15]}'
  + 'try{Object.defineProperty(c,"randomUUID",{value:u,configurable:true})}'
  + 'catch(e){try{c.randomUUID=u}catch(e2){}}}'
  + 'var CONN=' + JSON.stringify(CONNECTION_CLIENT_ID) + ';'
  + 'var FLAG=' + JSON.stringify(TRUST_FLAG) + ';'
  + 'var FAIL=' + JSON.stringify(BOOTSTRAP_FAILED) + ';'
  + 'function wrapApply(fn){'
  + 'if(fn&&fn.__dshIpHttpsApply)return fn;'
  + 'function wrapped(ctx){'
  + 'var result=fn.apply(this,arguments);'
  + 'function pin(){'
  + 'if(!ctx||typeof ctx.get!=="function"||globalThis[FLAG]!==1)return;'
  + 'try{var connection=ctx.get("connection",false);'
  + 'if(connection&&typeof connection==="object"){'
  + 'Object.defineProperty(connection,"isLoopback",{value:true,configurable:true,enumerable:true,writable:true})}'
  + '}catch(e5){}}'
  + 'if(result&&typeof result.then==="function")return result.then(function(v){pin();return v});'
  + 'pin();return result}'
  + 'try{Object.defineProperty(wrapped,"__dshIpHttpsApply",{value:true})}catch(eW){wrapped.__dshIpHttpsApply=true}'
  + 'return wrapped}'
  + 'function wrapExports(mod){if(!mod)return mod;'
  + 'try{if(typeof mod.apply==="function")mod.apply=wrapApply(mod.apply);'
  + 'if(mod.default&&typeof mod.default.apply==="function")mod.default.apply=wrapApply(mod.default.apply)}catch(e8){'
  + 'try{globalThis[FAIL]=1}catch(e8b){}}'
  + 'return mod}'
  + 'function wrapLoadFn(fn){'
  + 'if(typeof fn!=="function")return fn;'
  + 'if(fn.__dshIpHttpsLoad)return fn;'
  + 'function wrappedLoad(h){'
  + 'if(h&&h.id===CONN&&typeof h.factory==="function"){'
  + 'var inner=h.factory;'
  + 'h=Object.assign({},h,{factory:function(req){return wrapExports(inner(req))}})'
  + '}'
  + 'return fn.call(this,h)};'
  + 'try{Object.defineProperty(wrappedLoad,"__dshIpHttpsLoad",{value:true})}catch(eL){wrappedLoad.__dshIpHttpsLoad=true}'
  + 'return wrappedLoad}'
  + 'function installLoadTrap(loader){'
  + 'if(!loader)return;'
  + 'var desc;try{desc=Object.getOwnPropertyDescriptor(loader,"load")}catch(eD){desc=undefined}'
  + 'if(desc&&typeof desc.set==="function"&&desc.set.__dshIpHttpsLoadTrap)return;'
  + 'var current=wrapLoadFn(typeof loader.load==="function"?loader.load:undefined);'
  + 'function setLoad(v){current=wrapLoadFn(v)}'
  + 'setLoad.__dshIpHttpsLoadTrap=true;'
  + 'try{Object.defineProperty(loader,"load",{configurable:true,enumerable:true,get:function(){return current},set:setLoad})}'
  + 'catch(eT){if(typeof loader.load==="function")loader.load=wrapLoadFn(loader.load)}}'
  + 'function wrapCreate(loader){'
  + 'if(!loader||typeof loader.create!=="function"||loader.create.__dshIpHttpsCreate)return;'
  + 'var origCreate=loader.create;'
  + 'function wrappedCreate(){'
  + 'var result=origCreate.apply(this,arguments);'
  + 'installLoadTrap(this);installLoadTrap(loader);'
  + 'if(result&&result!==loader&&result!==this)installLoadTrap(result);'
  + 'return result}'
  + 'try{Object.defineProperty(wrappedCreate,"__dshIpHttpsCreate",{value:true})}catch(eC){wrappedCreate.__dshIpHttpsCreate=true}'
  + 'try{loader.create=wrappedCreate}catch(eC2){}}'
  + 'function wrapLoader(loader){'
  + 'if(!loader)return loader;installLoadTrap(loader);wrapCreate(loader);return loader}'
  + 'var current;'
  + 'try{current=globalThis.__ModuleLoader__;'
  + 'Object.defineProperty(globalThis,"__ModuleLoader__",{'
  + 'configurable:true,enumerable:true,'
  + 'get:function(){return current},'
  + 'set:function(v){current=wrapLoader(v)}'
  + '});'
  + 'if(current)current=wrapLoader(current);'
  + 'try{Object.defineProperty(globalThis,FLAG,{value:1,configurable:true})}'
  + 'catch(e3){try{globalThis[FLAG]=1}catch(e4){}}'
  + '}catch(e10){try{globalThis[FAIL]=1}catch(e10b){}}'
  + '})();'

export function injectBootstrap(html) {
  if (typeof html !== 'string') return html
  if (html.includes(`data-plugin="${DATA_PLUGIN}"`)) return html
  const tag = `<script data-plugin="${DATA_PLUGIN}">${PAGE_BOOTSTRAP_SOURCE}</script>`
  if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`)
  if (html.includes('<head>')) return html.replace('<head>', `<head>${tag}`)
  return tag + html
}
