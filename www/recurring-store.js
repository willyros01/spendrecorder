/* SpendRecorder adapters: all schedule changes use Store.update's serialized
   read/plan/transaction boundary. No platform-specific business logic. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./recurring.js'));
 else root.SpendRecurring=factory(root.Recurring);
})(typeof globalThis!=='undefined'?globalThis:this,function(R){
 'use strict';
 function series(entries,entry){const ids=new Map(entries.map(x=>[x.id,x])),root=entry.recurrence?entry:ids.get(entry.recurrenceId);return root&&root.recurrence?{root,record:entry,latest:R.latestId(root,ids)===entry.id}:null;}
 async function save(Store,entry,context,settings,receipt,extraOps){
  return Store.update(data=>{
   let records=[entry];
   if(context){
    const ids=new Set(data.entries.map(x=>x.id));
    if(!ids.has(entry.id))throw Error('This expense was deleted. Reopen History.');
    const root=data.entries.find(x=>x.id===context.root.id);
    records=R.seriesEdit(root,entry,context.record,context.root.recurrence,context.latest,settings.spec,settings.enabled,ids);
   }else if(settings){entry={...entry,recurrence:{...R.edited(null,settings.spec,settings.enabled),latestId:entry.id}};records=[entry];}
   const ops=records.map(record=>({op:'putEntry',entry:record,receipt:record.id===entry.id?receipt:undefined}));
   return {ops:ops.concat(extraOps||[]),result:true};
  });
 }
 async function post(Store,rootId,due,quote){
  return Store.update(data=>{
   const root=data.entries.find(x=>x.id===rootId);
   const currentHome=data.settings.home||'CAD';
   if(!root||!R.active(root.recurrence)||root.recurrence.nextDate!==due||R.template(root).currency!==quote.currency||currentHome!==quote.home)
    return {ops:[],result:{root,posted:0}};
   const id=R.occurrenceId(rootId,due),existing=data.entries.some(x=>x.id===id);
   const plan=R.autoPost(root,due,quote,existing);
   const ops=[{op:'putEntry',entry:plan.root,receipt:undefined}];
   if(plan.entry){
    const {amountCAD,status,approvedBy,approvedAt,...expense}=plan.entry;
    ops.push({op:'putEntry',entry:{...expense,home:quote.home,amountHome:expense.amount*quote.rate},receipt:null});
   }
   return {ops,result:{root:plan.root,posted:plan.entry?1:0}};
  });
 }
 function exportMetadata(entry){return entry.recurrence||entry.recurrenceId?JSON.stringify({id:entry.id,recurrence:entry.recurrence||null,recurrenceId:entry.recurrenceId||null,scheduledDate:entry.scheduledDate||null}):'';}
 function importMetadata(value){
  if(!value)return {};
  const v=JSON.parse(String(value)),id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,250}$/.test(x);
  if(!id(v.id))throw Error('Invalid recurring record ID');
  const result={id:v.id};
  if(v.recurrence){const r=v.recurrence;R.date(r.lastDate);R.date(r.nextDate);const spec=R.spec('custom',r.every,r.unit,r.anchor);
   if(r.nextDate<=r.lastDate||r.nextDate!==R.next(spec,r.lastDate>r.anchor?r.lastDate:r.anchor))throw Error('Invalid recurring progress');
   result.recurrence={...spec,enabled:!!r.enabled,lastDate:r.lastDate,nextDate:r.nextDate};
   if(r.latestId){if(!id(r.latestId))throw Error('Invalid latest occurrence ID');result.recurrence.latestId=r.latestId;}
   if(r.template)result.recurrence.template=R.templateFields(r.template);
  }
  if(v.recurrenceId){if(!id(v.recurrenceId)||v.id!==R.occurrenceId(v.recurrenceId,v.scheduledDate))throw Error('Invalid recurring occurrence');result.recurrenceId=v.recurrenceId;result.scheduledDate=v.scheduledDate;}
  if(!result.recurrence&&!result.recurrenceId)throw Error('Missing recurring metadata');return result;
 }
 return {series,save,post,exportMetadata,importMetadata};
});
