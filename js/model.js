/* Regras de atendimento. Os perfis são identidades simuladas, sem autenticação. */
(function(root) {
  'use strict';
  const USERS = [
    {id:'alex',name:'Alex Sander',role:'manager',initials:'AS',color:'#586fe8',job:'Gestor de atendimento'},
    {id:'julia',name:'Júlia Mendes',role:'agent',initials:'JM',color:'#8e73cb',job:'Atendente · Sistemas'},
    {id:'lucas',name:'Lucas Costa',role:'agent',initials:'LC',color:'#439b9c',job:'Atendente · Infraestrutura'},
    {id:'camila',name:'Camila Rocha',role:'requester',initials:'CR',color:'#cf9660',job:'Solicitante · Financeiro'},
    {id:'pedro',name:'Pedro Alves',role:'requester',initials:'PA',color:'#7899ba',job:'Solicitante · Operações'}
  ];
  const STATUSES = {open:'Aberto',in_progress:'Em atendimento',waiting:'Aguardando cliente',resolved:'Resolvido',closed:'Fechado'};
  const PRIORITIES = {urgent:{label:'Urgente',hours:4,color:'#d25f66'},high:{label:'Alta',hours:24,color:'#d58f42'},normal:{label:'Normal',hours:72,color:'#5879d5'},low:{label:'Baixa',hours:120,color:'#73978a'}};
  const CATEGORIES = ['Acessos e contas','Sistemas e aplicativos','Equipamentos','Rede e conectividade','Solicitação de serviço'];
  const FINISHED = ['resolved','closed'];
  const ATTACHMENT_MAX_BYTES = 600 * 1024;
  const ATTACHMENT_TYPES = ['image/png','image/jpeg','image/webp'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const instant = value => { const d = new Date(value === undefined ? Date.now() : value); if (!Number.isFinite(d.getTime())) fail('Data ou horário inválido.'); return d.toISOString(); };
  const actor = id => USERS.find(u => u.id === id) || fail('Perfil inválido.');
  const text = (value,label,min,max) => { const result=String(value ?? '').trim(); if(result.length<min || result.length>max) fail(`${label}: informe entre ${min} e ${max} caracteres.`); return result; };
  function attachment(value) {
    if(value === undefined || value === null) return null;
    if(typeof value!=='object' || Array.isArray(value)) fail('Anexe apenas um print por chamado.');
    const {name,mimeType,dataUrl,size,width,height}=value;
    if(typeof name!=='string' || !name.trim() || name.trim().length>160) fail('Nome do print inválido.');
    if(!ATTACHMENT_TYPES.includes(mimeType)) fail('O print deve ser uma imagem PNG, JPEG ou WebP.');
    if(!Number.isInteger(size) || size<1 || size>ATTACHMENT_MAX_BYTES) fail('O print precisa ter até 600 KB após o preparo.');
    if(!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width>1920 || height>1920) fail('Dimensões do print inválidas.');
    const prefix=`data:${mimeType};base64,`;
    if(typeof dataUrl!=='string' || !dataUrl.startsWith(prefix) || dataUrl.length>prefix.length+Math.ceil(ATTACHMENT_MAX_BYTES/3)*4) fail('Conteúdo do print inválido.');
    const payload=dataUrl.slice(prefix.length);
    if(!payload || payload.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) fail('Conteúdo do print inválido.');
    let bytes;
    try { bytes=atob(payload); } catch { fail('Conteúdo do print inválido.'); }
    if(bytes.length!==size || btoa(bytes)!==payload) fail('O tamanho ou a codificação do print é inválido.');
    const code=i=>bytes.charCodeAt(i);
    const valid=mimeType==='image/png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : mimeType==='image/jpeg' ? code(0)===255 && code(1)===216 && code(2)===255 && code(size-2)===255 && code(size-1)===217 : bytes.startsWith('RIFF') && bytes.slice(8,12)==='WEBP';
    if(!valid) fail('O conteúdo não corresponde ao formato do print.');
    return {name:name.trim(),mimeType,dataUrl,size,width,height};
  }
  const canRead = (user,ticket) => user.role !== 'requester' || ticket.requesterId === user.id;
  const canWork = (user,ticket) => user.role === 'manager' || (user.role === 'agent' && ticket.assigneeId === user.id);
  const getRaw = (state,id) => state.tickets.find(t => t.id === id) || fail('Chamado não encontrado.');
  function allowed(state,userId,id) { const user=actor(userId),ticket=getRaw(state,id); if(!canRead(user,ticket)) fail('Você não tem permissão para acessar este chamado.'); return {user,ticket}; }
  function event(ticket,user,type,body,at) { ticket.events.push({id:`event-${ticket.events.length+1}`,authorId:user.id,type,body,createdAt:at}); ticket.updatedAt=at; }
  function visibleTickets(state,userId) { const user=actor(userId); return state.tickets.filter(t=>canRead(user,t)).map(t=>getTicket(state,userId,t.id)); }
  function getTicket(state,userId,id) { const {user,ticket}=allowed(state,userId,id), result=clone(ticket); if(user.role==='requester') result.comments=result.comments.filter(c=>!c.internal); return result; }
  function createTicket(state,userId,input,now) {
    const user=actor(userId),at=instant(now),priority=input.priority || 'normal';
    if(!Object.hasOwn(PRIORITIES,priority)) fail('Prioridade inválida.');
    if(!CATEGORIES.includes(input.category)) fail('Selecione uma categoria válida.');
    const requesterId=user.role==='requester'?user.id:input.requesterId;
    if(user.role==='requester' && input.requesterId && input.requesterId!==user.id) fail('Você só pode abrir chamados em seu próprio nome.');
    if(actor(requesterId).role!=='requester') fail('Selecione um solicitante válido.');
    const number=Math.max(1040,...state.tickets.map(t=>t.number))+1;
    const ticket={id:`CH-${number}`,number,title:text(input.title,'Assunto',5,140),description:text(input.description,'Descrição',10,4000),attachment:attachment(input.attachment),category:input.category,priority,status:'open',requesterId,assigneeId:null,createdAt:at,updatedAt:at,dueAt:new Date(Date.parse(at)+PRIORITIES[priority].hours*3600000).toISOString(),resolvedAt:null,closedAt:null,resolution:'',comments:[],events:[]};
    event(ticket,user,'created','Chamado aberto e enviado para triagem.',at);
    const next=clone(state); next.tickets.push(ticket); return next;
  }
  function updateManagement(state,userId,id,input,now) {
    const {user}=allowed(state,userId,id); if(user.role!=='manager') fail('Somente o gestor pode alterar responsáveis, prioridades e prazos.');
    const next=clone(state),ticket=getRaw(next,id),at=instant(now);
    if(FINISHED.includes(ticket.status)) fail('Reabra o chamado antes de alterar os dados de atendimento.');
    const changes=[];
    if(Object.hasOwn(input,'assigneeId')) {
      const target=input.assigneeId || null;
      if(target && actor(target).role!=='agent') fail('O responsável precisa ser um atendente.');
      if(!target && ticket.status!=='open') fail('Chamados em atendimento precisam de um responsável.');
      if(target!==ticket.assigneeId) { ticket.assigneeId=target; changes.push(target?`Responsável: ${actor(target).name}.`:'Responsável removido; aguardando triagem.'); }
    }
    if(Object.hasOwn(input,'priority')) { if(!Object.hasOwn(PRIORITIES,input.priority)) fail('Prioridade inválida.'); if(ticket.priority!==input.priority){ticket.priority=input.priority;changes.push(`Prioridade alterada para ${PRIORITIES[input.priority].label.toLowerCase()}.`);} }
    if(Object.hasOwn(input,'dueAt')) { const due=instant(input.dueAt); if(due!==ticket.dueAt && Date.parse(due)<=Date.parse(at)) fail('O novo prazo precisa estar no futuro.'); if(Date.parse(due)<Date.parse(ticket.createdAt)) fail('O prazo não pode ser anterior à abertura.'); if(ticket.dueAt!==due){ticket.dueAt=due;changes.push('Prazo de atendimento atualizado.');} }
    if(!changes.length) fail('Nenhuma alteração para salvar.');
    event(ticket,user,'management',changes.join(' '),at); return next;
  }
  function takeTicket(state,userId,id,now) {
    const {user,ticket:original}=allowed(state,userId,id);
    if(user.role!=='agent') fail('Apenas um atendente pode assumir um chamado da fila.');
    if(original.assigneeId || original.status!=='open') fail('Este chamado já possui responsável ou saiu da fila de triagem.');
    const next=clone(state),ticket=getRaw(next,id);ticket.assigneeId=user.id; ticket.status='in_progress';event(ticket,user,'assigned',`${user.name} assumiu o atendimento.`,instant(now));return next;
  }
  function transition(state,userId,id,status,resolution='',now) {
    const {user,ticket:original}=allowed(state,userId,id),next=clone(state),ticket=getRaw(next,id),at=instant(now);
    if(!Object.hasOwn(STATUSES,status) || status===ticket.status) fail('Selecione uma nova etapa válida.');
    const reopen=status==='open' && FINISHED.includes(ticket.status);
    if(user.role==='requester') {
      if(!reopen || original.status!=='resolved') fail('Você pode reabrir um chamado resolvido. As outras etapas são controladas pelo atendimento.');
    } else if(!canWork(user,ticket)) fail('Somente o responsável ou o gestor pode mover este chamado.');
    const edges={open:['in_progress'],in_progress:['waiting','resolved'],waiting:['in_progress','resolved'],resolved:['open','closed'],closed:['open']};
    if(!edges[ticket.status].includes(status)) fail('Esta mudança não faz parte do fluxo de atendimento.');
    if(['in_progress','waiting','resolved'].includes(status) && !ticket.assigneeId) fail('Defina um responsável antes de iniciar o atendimento.');
    if(status==='closed' && user.role!=='manager') fail('Apenas o gestor pode encerrar definitivamente o chamado.');
    if(status==='resolved') { ticket.resolution=text(resolution,'Solução',10,2000);ticket.resolvedAt=at; }
    if(status==='closed') ticket.closedAt=at;
    if(reopen) { ticket.resolution='';ticket.resolvedAt=null;ticket.closedAt=null;ticket.dueAt=new Date(Date.parse(at)+PRIORITIES[ticket.priority].hours*3600000).toISOString(); }
    const previous=ticket.status;ticket.status=status;event(ticket,user,'status',`${STATUSES[previous]} → ${STATUSES[status]}.${reopen?' Um novo prazo foi iniciado.':''}${status==='resolved'?` Solução: ${ticket.resolution}`:''}`,at);return next;
  }
  function addComment(state,userId,id,input,now) {
    const {user,ticket:original}=allowed(state,userId,id);
    if(original.status==='closed') fail('Este chamado está fechado. Reabra-o antes de comentar.');
    if(user.role==='agent' && !canWork(user,original)) fail('Assuma o chamado ou seja definido como responsável antes de comentar.');
    if(input.internal && user.role==='requester') fail('Notas internas são exclusivas da equipe de atendimento.');
    const next=clone(state),ticket=getRaw(next,id),at=instant(now),body=text(input.body,'Comentário',2,3000);
    ticket.comments.push({id:`comment-${ticket.comments.length+1}`,authorId:user.id,body,internal:Boolean(input.internal),createdAt:at}); ticket.updatedAt=at;
    // A resposta pública do cliente devolve automaticamente o chamado à fila do responsável.
    if(user.role==='requester' && ticket.status==='waiting') {ticket.status='in_progress';event(ticket,user,'status','Cliente respondeu; atendimento retomado.',at);}
    return next;
  }
  function metrics(state,userId,now) {
    const tickets=visibleTickets(state,userId),at=Date.parse(instant(now)),active=tickets.filter(t=>!FINISHED.includes(t.status));
    return {total:tickets.length,active:active.length,unassigned:active.filter(t=>!t.assigneeId).length,overdue:active.filter(t=>Date.parse(t.dueAt)<at).length,dueSoon:active.filter(t=>Date.parse(t.dueAt)>=at && Date.parse(t.dueAt)-at<=86400000).length,resolved:tickets.filter(t=>FINISHED.includes(t.status)).length,byStatus:Object.fromEntries(Object.keys(STATUSES).map(s=>[s,tickets.filter(t=>t.status===s).length])),byPriority:Object.fromEntries(Object.keys(PRIORITIES).map(p=>[p,active.filter(t=>t.priority===p).length]))};
  }
  function validateState(state) {
    if(!state || state.version!==1 || !Array.isArray(state.tickets) || state.tickets.length>10000) fail('Dados incompatíveis.');
    const ids=new Set();
    for(const t of state.tickets) {
      if(t.id!==`CH-${t.number}` || !Number.isInteger(t.number) || ids.has(t.id)) fail('Identificador de chamado inválido ou duplicado.');ids.add(t.id);
      text(t.title,'Assunto',5,140);text(t.description,'Descrição',10,4000);
      attachment(t.attachment);
      if(!Object.hasOwn(STATUSES,t.status) || !Object.hasOwn(PRIORITIES,t.priority) || !CATEGORIES.includes(t.category)) fail('Classificação inválida.');
      if(actor(t.requesterId).role!=='requester') fail('Solicitante inválido.');
      if(t.assigneeId && actor(t.assigneeId).role!=='agent') fail('Responsável inválido.');
      if(t.status!=='open' && !t.assigneeId) fail('Atendimento sem responsável.');
      for(const key of ['createdAt','updatedAt','dueAt']) if(typeof t[key]!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(t[key]) || instant(t[key])!==t[key]) fail('Data inválida.');
      if(Date.parse(t.dueAt)<Date.parse(t.createdAt) || Date.parse(t.updatedAt)<Date.parse(t.createdAt)) fail('Sequência de datas inválida.');
      if(FINISHED.includes(t.status)){text(t.resolution,'Solução',10,2000);if(!t.resolvedAt || instant(t.resolvedAt)!==t.resolvedAt)fail('Data de resolução inválida.');}
      else if(t.resolvedAt!==null || t.closedAt!==null || t.resolution!=='') fail('Dados de encerramento inconsistentes.');
      if(t.status==='closed' && (!t.closedAt || instant(t.closedAt)!==t.closedAt)) fail('Data de encerramento inválida.');
      if(!Array.isArray(t.comments)||!Array.isArray(t.events))fail('Histórico inválido.');
      for(const c of t.comments){const a=actor(c.authorId);text(c.body,'Comentário',2,3000);if(typeof c.internal!=='boolean'||(c.internal&&a.role==='requester')|| (a.role==='requester'&&a.id!==t.requesterId))fail('Permissão de comentário inválida.');instant(c.createdAt);}
      for(const e of t.events){actor(e.authorId);text(e.body,'Evento',1,5000);instant(e.createdAt);}
    }
    return state;
  }
  function createSeed(now) {
    const base=Date.parse(instant(now)),ago=hours=>new Date(base-hours*3600000).toISOString();
    const data=[
      ['Não consigo acessar o sistema financeiro','Acessos e contas','urgent','open','camila',null,5,-1],
      ['Impressora do 2º andar sem conexão','Equipamentos','high','in_progress','pedro','lucas',20,4],
      ['Erro ao exportar relatório de vendas','Sistemas e aplicativos','high','in_progress','camila','julia',30,-6],
      ['Solicitação de acesso à pasta compartilhada','Acessos e contas','normal','open','pedro',null,10,62],
      ['VPN desconecta durante reuniões','Rede e conectividade','high','waiting','camila','lucas',18,6],
      ['Atualização do aplicativo de projetos','Sistemas e aplicativos','normal','open','pedro',null,3,69],
      ['Monitor apresenta falhas de imagem','Equipamentos','normal','in_progress','camila','lucas',35,37],
      ['Criação de assinatura de e-mail','Solicitação de serviço','low','open','camila',null,6,114],
      ['Permissão para instalar ferramenta de design','Acessos e contas','normal','waiting','pedro','julia',40,32],
      ['Recuperação de arquivo da equipe','Solicitação de serviço','normal','resolved','camila','julia',60,12],
      ['Configuração de novo equipamento','Equipamentos','low','resolved','pedro','lucas',80,40],
      ['Redefinição de senha de acesso','Acessos e contas','high','closed','pedro','julia',96,-72]
    ];
    const state={version:1,tickets:data.map((r,i)=>{const finished=FINISHED.includes(r[3]),createdAt=ago(r[6]),updatedAt=ago(Math.min(2,r[6]/2));return {id:`CH-${1041+i}`,number:1041+i,title:r[0],description:`Olá, equipe! Preciso de ajuda com a seguinte solicitação: ${r[0].toLowerCase()}. A situação afeta minhas atividades de trabalho. Podem verificar, por favor?`,category:r[1],priority:r[2],status:r[3],requesterId:r[4],assigneeId:r[5],createdAt,updatedAt,dueAt:ago(-r[7]),resolvedAt:finished?ago(3):null,closedAt:r[3]==='closed'?ago(1):null,resolution:finished?'Solicitação atendida, configuração validada e funcionamento confirmado com o solicitante.':'',comments:r[5]?[{id:'comment-1',authorId:r[5],body:r[3]==='waiting'?'Precisamos de mais informações. Você pode confirmar os detalhes para continuarmos?':'Recebemos sua solicitação e iniciamos a análise. Vamos manter você atualizado por aqui.',internal:false,createdAt:updatedAt},{id:'comment-2',authorId:r[5],body:'Verificar o histórico do ambiente antes de aplicar a correção. Alinhamento interno da equipe.',internal:true,createdAt:updatedAt}]:[],events:[{id:'event-1',authorId:r[4],type:'created',body:'Chamado aberto e enviado para triagem.',createdAt},...(r[5]?[{id:'event-2',authorId:'alex',type:'assigned',body:`Chamado atribuído a ${actor(r[5]).name}.`,createdAt:ago(Math.min(4,r[6]/2))}]:[])]};})};return validateState(state);
  }
  root.DeskModel={USERS,STATUSES,PRIORITIES,CATEGORIES,FINISHED,ATTACHMENT_MAX_BYTES,actor,canRead,canWork,visibleTickets,getTicket,createTicket,updateManagement,takeTicket,transition,addComment,metrics,validateState,createSeed};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.DeskModel;
})(typeof globalThis!=='undefined'?globalThis:this);
