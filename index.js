const t=Symbol(),e="undefined"!=typeof window&&window.document,n=(e,[o,...i])=>i.length?n(e[o],i):e[o]&&e[o][t];export const _CURRENT=Symbol();const o=(i,r,s)=>(c={},f={id:""},u=[],a=[],d)=>{s||"function"==typeof r||(s=r||[],r=!1);const l=(t,e,n,o)=>{if(!t||e in t&&t[e]===c[e])return c;const s=n?t:u.reduce((n,[o,i,r])=>((n=r?i(n)&&c:o in t?t[o]===n[o]?n:o===e?{...n,[o]:t[e]}:i(t[o]):t)instanceof Promise||(c=n),n),c);return s instanceof Promise?(s.then(t=>l(t,e,!1,o)),c):(c=i["t"]?i["t"](s,t[e]):s,r&&r(c,o)||c)},y=(t,[i,y,b])=>{const[,,m,,p]=i.match(/(([\w]+):)?(\s*(.+))?/),[g,w=""]=p.split("@");if("init"===w)return c=y(c[f.o]),f.state[f.o]=c,t;let j=w.startsWith("/")&&n(t,w.slice(1).split("/"));const R=!b&&w.startsWith("/");if(R)j=[],a.push([i,y,j]);else if(j)return b.forEach(t=>j.push(t)),t;const O=s?g?[].concat(s||e).reduce((t,e)=>{return[...t,...Array.from((n=e,o=g,[".","#",""].reduce((t,e)=>t.length?t:n.querySelectorAll(e+o),[])))];var n,o},[]):s:[],h=O.length&&m||g.replace(/[#\.\-\[\]\(\)\"\=\^\&]/g,""),x=`${f.id}/${h}`,C="function"!=typeof y&&o(y,(t,e)=>l(e.endsWith("/")?t:{...c,[h]:t},h,!1,e),O)("object"==typeof c[h]?c[h]:c,{id:x,state:c,o:h},j||[],a,R),E=function(t){t===_CURRENT&&(t=c[h]);const e=h||f.o;return l(C?t:this||!O.length?y.call({i:e,s:this},c,t):O.reduce((n,o)=>y.call({i:e,s:o},n,t),c),h||f.o,d,x)};return w&&!w.startsWith("/")&&"state"!==w&&O.forEach(t=>{t.addEventListener(w,E)}),u.push([h||f.o,C?r:E,d]),t[m||h]=t=>E(t)[h],C?Object.defineProperty(t,h,{get:()=>C}):t},b=Object.entries(i).reduce(y,{[t]:u});return f.id?b:Object.defineProperty(a.reduce(y,b),"state",{get:()=>c})};export default o;