import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
const deps=process.env.OUTLINE_TEST_DEPS;
if(!deps) throw new Error('Set OUTLINE_TEST_DEPS to a directory containing node_modules with three@0.167.1, clipper-lib@6.4.2, harfbuzzjs@0.8.0 and @xmldom/xmldom.');
const dependency=(p)=>pathToFileURL(path.resolve(deps,'node_modules',p)).href;
for(const [name,version] of [['three','0.167.1'],['clipper-lib','6.4.2'],['harfbuzzjs','0.8.0']]) assert.equal(JSON.parse(fs.readFileSync(path.resolve(deps,'node_modules',name,'package.json'))).version,version);
const coreURL='data:text/javascript;base64,'+Buffer.from(fs.readFileSync('outline-clipper.js','utf8')).toString('base64');
let workerSource=fs.readFileSync('outline-worker.js','utf8').replace('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm',dependency('clipper-lib/clipper.js')).replace('./outline-clipper.js',coreURL);
workerSource='import {parentPort} from "node:worker_threads"; globalThis.self={postMessage:data=>parentPort.postMessage(data)};\n'+workerSource+'\nparentPort.on("message",data=>self.onmessage({data}));';
const worker=new Worker(new URL('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64')));
const THREE=await import(dependency('three/build/three.module.js'));
const {TTFLoader}=await import(dependency('three/examples/jsm/loaders/TTFLoader.js'));
const {FontLoader}=await import(dependency('three/examples/jsm/loaders/FontLoader.js'));
const {SVGLoader}=await import(dependency('three/examples/jsm/loaders/SVGLoader.js'));
const {STLExporter}=await import(dependency('three/examples/jsm/exporters/STLExporter.js'));
const {default:ClipperLib}=await import(dependency('clipper-lib/clipper.js'));
const {default:hbPromise}=await import(dependency('harfbuzzjs/index.js'));
const {DOMParser}=await import(dependency('@xmldom/xmldom/lib/index.js'));
globalThis.DOMParser=DOMParser;
const root=process.cwd();
const reference=JSON.parse(fs.readFileSync('tools/outline-reference.json')).cases;
const source=fs.readFileSync(root+'/viewer.js','utf8');
function checkExportHandler(group, text) {
 const downloads=[],urls=new Map();let click;
 const document={getElementById:()=>({addEventListener:(_,handler)=>{click=handler;}}),body:{appendChild(){}},createElement:()=>({click(){downloads.push(urls.get(this.href));},remove(){}})};
 const URL={createObjectURL(blob){const id=String(urls.size);urls.set(id,blob);return id;},revokeObjectURL(){}};
 const handler=source.slice(source.indexOf('const orderButton = document.getElementById("orderButton")'));
 const run=new Function('THREE','STLExporter','productGroup','baseMaterial','textMaterial','nameInput','document','URL','Blob','setTimeout','pending',`const fontLoading=false,geometryRevision=1,renderedRevision=pending?0:1; ${handler}`);
 const args=[THREE,STLExporter,group,group.children[0].material,group.children[1].material,{value:text},document,URL,Blob,fn=>fn()];
 run(...args,true);click();assert.equal(downloads.length,0,'Pending export must emit no files');
 run(...args,false);click();assert.equal(downloads.length,2,'Completed export must emit BASE and TEXT');
 assert(downloads.every(blob=>blob.size>84),'STLs must contain triangles');
}

const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const hb=await hbPromise;
const cases=reference.map(r=>[r.fontName,r.text,r.line2,r.margin]);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const results=[];
try {
for(let k=0;k<cases.length;k++){
 const [fontName,text,line2,margin]=cases[k], bytes=fs.readFileSync(root+'/assets/fonts/'+fontName+'.ttf');
 const font=new FontLoader().parse(new TTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
 const blob=hb.createBlob(bytes), face=hb.createFace(blob,0), hbFont=hb.createFont(face);hbFont.setScale(1000,1000);
 let captured={},clipMs=0;
 let body=extract('function createOutlineProduct(', 'function createStickerProduct(');
 body=body.replaceAll('const offsetter = new ClipperLib.ClipperOffset','const clipStart=performance.now(); const offsetter = new ClipperLib.ClipperOffset');
 body=body.replace('const baseShapes = unitedPaths','capture(paths,unitedPaths,outlineMargin,performance.now()-clipStart); const baseShapes = unitedPaths');
 const build=new Function('THREE','SVGLoader','ClipperLib','loadedFont','harfBuzzApi','harfBuzzFont','capture','outlineJobs', `
 const geometryRevision=1; function clearProduct(){productGroup.clear();}
 const fontSelect={value:${JSON.stringify(fontName)}},outlineSlider={value:${margin}},nameSizeSlider={value:100};
 const svgLoader=new SVGLoader(),productGroup=new THREE.Group(),baseMaterial=new THREE.MeshBasicMaterial(),textMaterial=new THREE.MeshBasicMaterial();
 const TWO_LINE_GAP_MAX_FACTOR=.4,TWO_LINE_OVERLAP_MIN_FACTOR=.3,ringOuterWidth=.748,ringOuterHeight=.578,ringHoleDiameter=.357;
 function isThaiText(t){return /[\u0E00-\u0E7F]/.test(t);}
 ${extract('function patchThaiCombiningMarks(', 'function loadStarSvgShape(')}
 ${extract('function generateHarfBuzzShapes(', 'function fitTextGeometry(')}
 ${extract('function applyNameTextScale(', 'function createOutlineProduct(')}
 ${body}
 patchThaiCombiningMarks(loadedFont);
 return {build:createOutlineProduct,group:productGroup};
 `)(THREE,SVGLoader,ClipperLib,font,hb,hbFont,(paths,unitedPaths,margin,ms)=>{captured={paths,unitedPaths,margin};clipMs=ms}, {request:(paths,outlineMargin)=>new Promise((resolve,reject)=>{const start=performance.now(); worker.once("error",reject);worker.once("message",data=>{if(data.error)return reject(new Error(data.error));captured={paths,unitedPaths:data.unitedPaths,margin:outlineMargin};clipMs=performance.now()-start;resolve(data.unitedPaths);});worker.postMessage({id:k,paths,outlineMargin});})});
 const start=performance.now(); const width=await build.build(text,line2);const totalMs=performance.now()-start;
 build.group.updateMatrixWorld(true);
 checkExportHandler(build.group,text);
 const stl=new STLExporter().parse(build.group,{binary:true});
 const meshes=build.group.children.map(m=>({position:m.position.toArray(),attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([n,a])=>[n,hash(Buffer.from(a.array.buffer))])),triangles:m.geometry.attributes.position.count/3}));
 
 const result={case:k,fontName,text,line2,margin,width,totalMs,clipMs,pathsHash:hash(JSON.stringify(captured.unitedPaths)),stlHash:hash(Buffer.from(stl.buffer)),meshes};
 for(const key of ['pathsHash','stlHash','meshes','width']) assert.deepEqual(result[key],reference[k][key], 'Case '+k+': '+key);
 results.push(result);console.log('PASS geometry case '+k+' ('+fontName+'): identical paths, buffers, ring, width and STL');
 build.group.children.forEach(m=>m.geometry.dispose());hbFont.destroy();face.destroy();blob.destroy();
}


} finally { await worker.terminate(); }

