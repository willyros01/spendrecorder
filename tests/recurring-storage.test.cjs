const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const R=require('../www/recurring.js'),S=require('../www/recurring-store.js');
function fixture(native=true){
 const db=native?new DatabaseSync(':memory:'):null;const local=new Map();let fail=false;
 const SQL=native?{checkConnectionsConsistency:async()=>{},createConnection:async()=>{},open:async()=>{},
  query:async({statement,values})=>({values:db.prepare(statement).all(...(values||[]))}),
  execute:async({statements})=>{db.exec(statements);},
  executeSet:async({set,transaction})=>{if(transaction)db.exec('BEGIN');try{for(let i=0;i<set.length;i++){db.prepare(set[i].statement).run(...set[i].values);if(fail&&i===0)throw Error('injected write failure');}if(transaction)db.exec('COMMIT');}catch(e){if(transaction)db.exec('ROLLBACK');throw e;}}
 }:null;
 const context={window:{Capacitor:native?{isNativePlatform:()=>true,Plugins:{CapacitorSQLite:SQL}}:null,localStorage:{setItem:(k,v)=>{if(fail)throw Error('full');local.set(k,v);},getItem:k=>local.get(k)||null,removeItem:k=>local.delete(k)}},Map,Promise,JSON,Date,Array,Set,Error,Number,Object,String};
 vm.createContext(context);vm.runInContext(fs.readFileSync('www/storage.js','utf8'),context);
 return {db,context,Store:context.Store,fail:()=>{fail=true;},recover:()=>{fail=false;}};
}
const original=()=>({id:'root',date:'2026-11-01',amount:25,currency:'CAD',vendor:'Vendor',category:'Utilities',comments:'original',home:'CAD',rate:1,rateDate:'2026-11-01',rateSource:'home',amountHome:25,createdAt:1,updatedAt:1});
const quote={currency:'CAD',home:'CAD',rate:1,usedDate:'2026-11-02',source:'home'};
for(const native of [true,false]){
 const name=native?'SQLite':'browser';
 test(name+' stores recurrence and receipts, auto-posts once and preserves historical fields',async()=>{
  const f=fixture(native);await f.Store.open();const entry={...original(),recurrence:{...R.spec('daily',1,'days','2026-11-01'),enabled:true,lastDate:'2026-11-01',nextDate:'2026-11-02',latestId:'root'}};
  await f.Store.commit([{op:'putEntry',entry,receipt:'original-photo'}]);
  const a=await S.post(f.Store,'root','2026-11-02',quote);assert.equal(a.posted,1);assert.equal((await S.post(f.Store,'root','2026-11-02',quote)).posted,0);
  const data=await f.Store.load();assert.equal(data.entries.length,2);assert.equal(await f.Store.getReceipt('root'),'original-photo');assert.equal(await f.Store.getReceipt(R.occurrenceId('root','2026-11-02')),null);
  const root=data.entries.find(x=>x.id==='root'),child=data.entries.find(x=>x.recurrenceId==='root');assert.equal(root.amount,25);assert.equal(child.home,'CAD');assert.equal(child.amountHome,25);assert.equal(root.recurrence.latestId,child.id);
 });
 test(name+' latest edit updates one future template, retains older records and supports stopping',async()=>{
  const f=fixture(native);await f.Store.open();let root={...original(),recurrence:{...R.spec('daily',1,'days','2026-11-01'),enabled:true,lastDate:'2026-11-01',nextDate:'2026-11-02'}};await f.Store.commit([{op:'putEntry',entry:root,receipt:'photo'}]);await S.post(f.Store,'root','2026-11-02',quote);
  let data=await f.Store.load(),record=data.entries.find(x=>x.recurrenceId);let context=S.series(data.entries,record);
  await S.save(f.Store,{...record,amount:40,amountHome:40},context,{spec:R.spec('weekly',1,'weeks',record.date),enabled:true},undefined,[]);
  data=await f.Store.load();root=data.entries.find(x=>x.id==='root');assert.equal(root.amount,25);assert.equal(root.date,'2026-11-01');assert.equal(root.recurrence.template.amount,40);assert.equal(root.recurrence.nextDate,'2026-11-09');assert.equal(data.entries.filter(x=>x.recurrence).length,1);assert.equal(await f.Store.getReceipt('root'),'photo');
  await S.post(f.Store,'root','2026-11-09',quote);data=await f.Store.load();record=data.entries.find(x=>x.id===R.occurrenceId('root','2026-11-09'));assert.equal(record.amount,40);
  context=S.series(data.entries,record);await S.save(f.Store,record,context,{spec:R.spec('weekly',1,'weeks',record.date),enabled:false},undefined,[]);
  data=await f.Store.load();assert.equal(data.entries.find(x=>x.id==='root').recurrence.enabled,false);assert.equal(data.entries.length,3);
 });
 test(name+' posting failure rolls back schedule, expense and receipt writes',async()=>{
  const f=fixture(native);await f.Store.open();const entry={...original(),recurrence:{...R.spec('daily',1,'days','2026-11-01'),enabled:true,lastDate:'2026-11-01',nextDate:'2026-11-02'}};await f.Store.commit([{op:'putEntry',entry,receipt:'photo'}]);f.fail();await assert.rejects(S.post(f.Store,'root','2026-11-02',quote));f.recover();const data=await f.Store.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].recurrence.nextDate,'2026-11-02');assert.equal(await f.Store.getReceipt('root'),'photo');
 });
 test(name+' repeated concurrent auto-post attempts create one record',async()=>{const f=fixture(native);await f.Store.open();const entry={...original(),recurrence:{...R.spec('daily',1,'days','2026-11-01'),enabled:true,lastDate:'2026-11-01',nextDate:'2026-11-02'}};await f.Store.commit([{op:'putEntry',entry}]);const result=await Promise.all([S.post(f.Store,'root','2026-11-02',quote),S.post(f.Store,'root','2026-11-02',quote)]);assert.equal(result.reduce((n,x)=>n+x.posted,0),1);assert.equal((await f.Store.load()).entries.length,2);});
}
test('existing SQLite expenses and receipt survive additive metadata table creation',async()=>{const f=fixture(true);const c=f.context;f.db.exec(c.SCHEMA.replace(/CREATE TABLE IF NOT EXISTS expense_metadata[^;]+;/,''));f.db.prepare(c.UPSERT_EXPENSE).run(...c.expenseValues(original()));f.db.prepare('INSERT INTO receipts VALUES (?,?)').run('root','existing-photo');await f.Store.open();const data=await f.Store.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].amount,25);assert.equal(await f.Store.getReceipt('root'),'existing-photo');assert.ok(f.db.prepare("SELECT name FROM sqlite_master WHERE name='expense_metadata'").get());});
test('export/import retains latest identity and template defaults',()=>{const e={...original(),recurrence:{...R.spec('monthly',1,'months','2026-11-01'),enabled:true,lastDate:'2026-11-01',nextDate:'2026-12-01',latestId:'root',template:{amount:40,currency:'CAD',vendor:'V',category:'Other',comments:'',submittedBy:''}}};const d=S.importMetadata(S.exportMetadata(e));assert.deepEqual(d.recurrence,e.recurrence);});
