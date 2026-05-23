// Operadoras (APN), modelos de rastreador e comandos extras.
// Fontes: manuais Coban GPS103, GT06/Concox e Suntech ST300.

export const APNS = {
  algar:      { name:'Algar',       apn:'voxter.br', login:'algar',  senha:'algar',
                note:'PIN do chip Algar: 1212. Se o equipamento tiver opcao de PIN/PIN CODE, configure-o — sem o PIN o aparelho pode so funcionar na rede TIM e travar em outras operadoras.' },
  vivo:       { name:'Vivo',        apn:'vxt.br',    login:'vivo',   senha:'vivo'  },
  claro:      { name:'Claro',       apn:'voxter.br', login:'claro',  senha:'claro' },
  linksfield: { name:'Links Field', apn:'voxter.br', login:'voxter', senha:'voxter' },
  emnify:     { name:'Emnify',      apn:'voxter.br', login:'voxter', senha:'voxter' },
};

export const MODELS = {
  st310: { name:'ST310 / ST300 (ST310U)',
    fields:[{key:'id',label:'ID do equipamento (substitui XXXXXXXXX)',placeholder:'Ex: 205123456',def:''}],
    note:'Comando unico da Suntech. Informe o ID do equipamento no lugar de XXXXXXXXX.',
    build:(v,a)=>[`ST300NTW;${v.id||'XXXXXXXXX'};02;1;${a.apn};${a.login};${a.senha};68.183.63.49;14402;68.183.63.49;14402;;`] },
  mini: { name:'Mini Tracker', fields:[],
    note:'Atencao: este modelo usa IP/porta DIFERENTES dos demais (159.65.43.73:5015).',
    build:(v,a)=>[`APN,${a.apn},${a.login},${a.senha}#`,'IP,159.65.43.73,5015#','TIMER,20#','WKMD,0#'] },
  small: { name:'Small Tracker',
    fields:[{key:'zd',label:'Codigo ZD (senha do aparelho)',placeholder:'1234',def:'1234'}],
    note:"O APN usa o valor oficial da operadora (corrigido o 'jvoxter.br' do comando original).",
    build:(v,a)=>{const zd=v.zd||'1234';return[`ZD${zd},MSERVER*68.183.63.49,14400#`,`ZD${zd},APN*${a.apn},${a.login},${a.senha}#`,`ZD${zd},TE*10,5,360#`,`ZD${zd},SENSVIB*1#`,`ZD${zd},allgps*OFF#`];} },
  rk4g: { name:'RK 4G',
    fields:[{key:'pw',label:'Senha do aparelho',placeholder:'123456',def:'123456'}], note:'',
    build:(v,a)=>{const p=v.pw||'123456';return[`adminip${p} 68.183.63.49 14413`,`apn${p} ${a.apn} ${a.login} ${a.senha}`,`fix030s060m***n${p}`,`time zone${p} 0`,`acc${p} 1`,`LBS${p} 1`];} },
  rk4gb: { name:'RK-4GB', fields:[], note:'',
    build:(v,a)=>[`APN,${a.apn},${a.login},${a.senha}#`,'SERVER,0,68.183.63.49,14431,0#','UTC,OFF#','GMT,W,0,0#','ACCALM,OFF#','TIMER,20,1800#','BATALM,ON,0#','SZCS#SOURCE_OFF_TYPE=1','SZCS#BLIND_DEBUG=1'] },
  rastrek_v1_2g: { name:'Rastrek 4G V1 / Rastrek 2G', fields:[], note:'',
    build:(v,a)=>['SERVER,0,68.183.63.49,14425,0#',`APN,${a.apn},${a.login},${a.senha}#`,'UTC,OFF#','GMT,W,0,0#','ACCALM,OFF#','TIMER,20,1800#','BATALM,ON,0#','SZCS#SOURCE_OFF_TYPE=1','SZCS#BLIND_DEBUG=1'] },
  rastrek_v2: { name:'Rastrek-4G V2',
    fields:[{key:'pw',label:'Senha do aparelho',placeholder:'123456',def:'123456'}], note:'',
    build:(v,a)=>{const p=v.pw||'123456';return[`Begin${p}`,`adminip${p} 68.183.63.49 14435`,`APN${p} ${a.apn} ${a.login} ${a.senha}`,`fix015s060m***n${p}`,`GPRS${p} ON`,`LBS${p} 1`];} },
  tk303: { name:'TK303 / TK311 / TK403 (Rastrek 303/311)',
    fields:[{key:'pw',label:'Senha do aparelho',placeholder:'123456',def:'123456'}], note:'',
    build:(v,a)=>{const p=v.pw||'123456';return[`Begin${p}`,`APN${p} ${a.apn}`,`up${p} ${a.login} ${a.senha}`,`adminip${p} 68.183.63.49 14403`,`save030s***n${p}`,`GPRS${p}`,`LBS${p} 1`];} },
};

function cobanExtras(v){ const p=(v&&v.pw)||'123456'; return [
  {cat:'block',   label:'🔒 Bloquear motor',       danger:true, cmd:`stop${p}`},
  {cat:'unblock', label:'🔓 Desbloquear motor',                 cmd:`resume${p}`},
  {cat:'reboot',  label:'🔁 Reiniciar',                         cmd:`reset${p}`},
  {cat:'factory', label:'♻ Reset de fabrica',      danger:true, cmd:`begin${p}`},
  {cat:'status',  label:'📋 Status / diagnostico',              cmd:`check${p}`},
  {cat:'location',label:'📍 Localizacao (endereco)',            cmd:`address${p}`},
];}
function gt06Extras(){ return [
  {cat:'block',   label:'🔒 Bloquear motor',       danger:true, cmd:'RELAY,1#'},
  {cat:'unblock', label:'🔓 Desbloquear motor',                 cmd:'RELAY,0#'},
  {cat:'reboot',  label:'🔁 Reiniciar',                         cmd:'RESET#'},
  {cat:'factory', label:'♻ Reset de fabrica',      danger:true, cmd:'FACTORY#'},
  {cat:'status',  label:'📋 Status',                            cmd:'STATUS#'},
  {cat:'location',label:'📍 Localizacao',                       cmd:'WHERE#'},
];}

export const EXTRAS = {
  st310: { conf:'alta', build:v=>{ const id=(v&&v.id)||'XXXXXXXXX'; return [
      {cat:'block',   label:'🔒 Bloquear motor (saida 1)', danger:true, cmd:`ST300CMD;${id};02;Enable1`},
      {cat:'unblock', label:'🔓 Desbloquear motor (saida 1)',          cmd:`ST300CMD;${id};02;Disable1`},
      {cat:'reboot',  label:'🔁 Reiniciar',                            cmd:`ST300CMD;${id};02;Reboot`},
      {cat:'factory', label:'♻ Reset de fabrica', danger:true,         cmd:`ST300CMD;${id};02;Reset`},
      {cat:'status',  label:'📋 Status / posicao',                     cmd:`ST300CMD;${id};02;StatusReq`},
      {cat:'location',label:'📍 Localizacao (Google Maps)',            cmd:`ST300CMD;${id};02;ReqGoogleMap`},
    ];}, note:'Bloqueio usa a Saida 1 (Enable1/Disable1): so corta o motor se a saida estiver ligada ao rele do imobilizador. Requer o ID do equipamento preenchido.' },
  tk303:        { conf:'alta',  build:cobanExtras, note:"Familia Coban GPS103. 'Localizacao' (address) exige APN configurado; ligar para o chip tambem retorna a posicao." },
  rk4g:         { conf:'media', build:cobanExtras, note:'Comandos da familia Coban GPS103 — confirme em bancada antes de usar.' },
  rastrek_v2:   { conf:'media', build:cobanExtras, note:'Comandos da familia Coban GPS103 — confirme em bancada antes de usar.' },
  rk4gb:        { conf:'media', build:gt06Extras,  note:'Familia GT06/Concox. Rele: RELAY,1# corta / RELAY,0# restaura.' },
  rastrek_v1_2g:{ conf:'media', build:gt06Extras,  note:'Familia GT06/Concox. Rele: RELAY,1# corta / RELAY,0# restaura.' },
  mini: { conf:'baixa', build:()=>[
      {cat:'location',label:'📍 Localizacao',                cmd:'WHERE#'},
      {cat:'status',  label:'📋 Status',                     cmd:'STATUS#'},
      {cat:'reboot',  label:'🔁 Reiniciar',                  cmd:'RESET#'},
      {cat:'factory', label:'♻ Reset de fabrica', danger:true, cmd:'FACTORY#'},
    ], note:'Mini Tracker geralmente NAO tem rele de corte (sem bloqueio de motor). Comandos GT06 genericos — confirme em bancada.' },
};
