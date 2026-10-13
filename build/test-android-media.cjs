#!/usr/bin/env node
'use strict';
// Deterministic native bridge regressions for Android Fire HD 8.
// Test REAL React source and compiled browser JS; mock Capacitor's injected Plugins.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function helperSource(file) {
  const app = fs.readFileSync(file,'utf8');
  const begin = app.indexOf('/* Android-only bridge: Fairpot');
  const end = app.indexOf('/* ===================== terms of use', begin);
  assert(begin > 0 && end > begin, 'Missing Android adapter: '+file);
  assert.match(app, /if\s*\(RecorderAndroid\)\s*\{\s*const saved = await saveExportAndroid\(filename, base64, mime\)/);
  assert.match(app, /Saved to Downloads/);
  assert.match(app, /handleReceiptCamera/);
  assert.match(app, /photoFromAndroidCamera\(\)/);
  assert.match(app, /Add photo \(Camera \/ Gallery\)/);
  assert.match(app, /SpendRecorderDocument/);
  // Android branch must not silently use the generic Share sheet for exports.
  const fn = app.slice(app.indexOf('async function offerFile('),app.indexOf('const exportRow ='));
  assert(fn.indexOf('if(RecorderAndroid)')>=0 || fn.indexOf('if (RecorderAndroid)')>=0);
  assert(fn.indexOf('saveExportAndroid') < fn.indexOf('ShareP'));
  return app.slice(begin,end);
}
const src = helperSource('src/app.jsx');
const built = helperSource('www/app.js');
assert.equal(src.replace(/\s+/g,' '), built.replace(/\s+/g,' '),
  'The Android bridge must be identical in source and compiled app');
console.log('PASS: React source and compiled app use the same native bridge');

async function scenario(platform, mode) {
  const calls = {camera:[], downloads:[], share:0, compression:[]};
  const plugins = {
    Share:{share:async()=>{calls.share++;}},
    Camera:{getPhoto:async opts=>{
      calls.camera.push(opts);
      if(mode==='cameraFail') throw Error('Camera failed');
      return {format:'jpeg',base64String:Buffer.from('fixture image').toString('base64')};
    }},
    SpendRecorderDocument:{saveToDownloads:async opts=>{
      calls.downloads.push(opts);
      if(mode==='failSave') throw Error('Storage full');
      if(mode==='unconfirmed') return {saved:false,fileName:opts.fileName,location:'Downloads'};
      return {saved:true,fileName:opts.fileName,location:'Downloads'};
    }}
  };
  if(mode==='missingCamera') delete plugins.Camera;
  if(mode==='missingSave') delete plugins.SpendRecorderDocument;
  const sandbox = {
    window:{Capacitor:{isNativePlatform:()=>true,getPlatform:()=>platform,Plugins:plugins}},
    Blob,
    Uint8Array,
    atob,
    compressImageSafe:async blob=>{
      calls.compression.push(blob);
      return 'data:image/jpeg;base64,fixture';
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(src,sandbox,{filename:'spendrecorder-native.js'});
  return {calls,api:{
    isAndroid:vm.runInContext('RecorderAndroid',sandbox),
    camera:()=>vm.runInContext('photoFromAndroidCamera()',sandbox),
    save:(f,b,m)=>vm.runInContext('saveExportAndroid',sandbox)(f,b,m)
  }};
}

async function run(){
  const android=await scenario('android','ok');
  assert.equal(android.api.isAndroid,true);
  const img=await android.api.camera();
  assert.equal(img,'data:image/jpeg;base64,fixture');
  assert.equal(android.calls.camera[0].source,'PROMPT');
  assert.equal(android.calls.camera[0].resultType,'base64');
  assert.match(android.calls.camera[0].promptLabelPicture,/Take Photo/);
  assert.equal(android.calls.compression[0].size,13);
  console.log('PASS: Android camera offers Photo/Gallery and compresses receipt');

  const csv='spendrecorder-2026-10-12.csv';
  const xlsx='spendrecorder-2026-10-12.xlsx';
  assert.equal(await android.api.save(csv,'YQ==','text/csv'),csv);
  assert.equal(await android.api.save(xlsx,'UEsDBA==','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),xlsx);
  assert.equal(android.calls.downloads.length,2);
  assert.equal(android.calls.downloads[1].mimeType,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(android.calls.share,0);
  console.log('PASS: CSV and Excel call native Downloads, never Share');

  for(const mode of ['missingSave','failSave','unconfirmed']){
    const fail=await scenario('android',mode);
    await assert.rejects(fail.api.save(csv,'YQ==','text/csv'),/unavailable|Storage full|not confirmed saved/);
    assert.equal(fail.calls.share,0);
  }
  const absent=await scenario('android','missingCamera');
  await assert.rejects(absent.api.camera(),/Camera service unavailable/);
  const cameraFailure=await scenario('android','cameraFail');
  await assert.rejects(cameraFailure.api.camera(),/Camera failed/);
  console.log('PASS: failed/missing native plugins are explicit errors, never false success');

  const ios=await scenario('ios','ok');
  assert.equal(ios.api.isAndroid,false);
  assert.equal(ios.calls.camera.length,0);
  assert.equal(ios.calls.downloads.length,0);
  // iOS/web continue using their existing input/file sharing paths.
  console.log('PASS: iOS and web paths remain platform isolated');

  const native=fs.readFileSync('build/android-native.sh','utf8');
  assert.match(native,/registerPlugin\(SpendRecorderDocumentPlugin.class\)/);
  assert.match(native,/MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(native,/WRITE_EXTERNAL_STORAGE/);
  assert.match(native,/android:maxSdkVersion="28"/);
  assert.match(native,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  console.log('PASS: Android native Downloads code and permissions in build script');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
