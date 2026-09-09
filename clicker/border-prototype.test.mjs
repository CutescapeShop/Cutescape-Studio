import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadClickerModules} from '../tools/clicker-test-modules.mjs';
import {loadRealContourFixtures,mechanicalHash} from '../tools/real-contour-fixtures.mjs';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let code=await readFile(new URL('./border-prototype.js',import.meta.url),'utf8');
for(const name of ['../vendor/clipper-lib-6.4.2.esm.js','./geometry-math.js'])code=code.replace(name,url(await readFile(new URL(name,import.meta.url),'utf8')));
const {smoothBorderPrototype}=await import(url(code)),m=await loadClickerModules(),p=m['stem-profile'].CLICKER_PROFILE,k=m['keycap-geometry'];
const {default:C}=await import(url(await readFile(new URL('../vendor/clipper-lib-6.4.2.esm.js',import.meta.url),'utf8')));
const paths=loops=>loops.map(loop=>loop.map(q=>({X:Math.round(q.x*1e4),Y:Math.round(q.y*1e4)})));
function contained(inner,outer){const c=new C.Clipper(),out=[];c.AddPaths(paths(inner),C.PolyType.ptSubject,true);c.AddPaths(paths(outer),C.PolyType.ptClip,true);c.Execute(C.ClipType.ctDifference,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);assert.ok(out.every(a=>Math.abs(C.Clipper.Area(a))<100),'complete moving TOP fits chamber');}
function distance(q,loops){let d=Infinity;for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((q.x-a.x)*x+(q.y-a.y)*y)/(x*x+y*y)));d=Math.min(d,Math.hypot(q.x-a.x-t*x,q.y-a.y-t*y));}return d;}
function expanded(loops,mm){const offset=new C.ClipperOffset(2,10),out=[];offset.AddPaths(paths(loops),C.JoinType.jtRound,C.EndType.etClosedPolygon);offset.Execute(out,mm*1e4);return out.map(l=>l.map(q=>({x:q.X/1e4,y:q.Y/1e4})));}
function validSTL(geometry,label){
 const group=new m.three.Group();group.add(new m.three.Mesh(geometry));group.updateMatrixWorld(true);
 const stl=new m.STLExporter().parse(group,{binary:true}),edges=new Map();
 assert.equal(stl.byteLength,84+50*stl.getUint32(80,true));
 for(let i=0;i<stl.getUint32(80,true);i++){
  const values=Array.from({length:12},(_,j)=>stl.getFloat32(84+i*50+j*4,true));
  assert.ok(values.every(Number.isFinite),`${label}: finite STL`);
  const v=values.slice(3),u=v.slice(3,6).map((x,k)=>x-v[k]),w=v.slice(6,9).map((x,k)=>x-v[k]);
  assert.ok(Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])>0,`${label}: no collapsed triangles`);
  const keys=[0,3,6].map(k=>v.slice(k,k+3).join(','));
  for(let j=0;j<3;j++){const a=keys[j],b=keys[(j+1)%3],id=[a,b].sort().join('|'),e=edges.get(id)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(id,e);}
 }
 assert.ok([...edges.values()].every(([count,winding])=>count===2&&winding===0),`${label}: closed, consistently oriented STL`);
}
const selected=process.env.CLICKER_TEST_ARTWORK?.split(',');
for(const [name,f] of Object.entries(await loadRealContourFixtures())){
 if(selected&&!selected.includes(name))continue;
 const size=35,fit=m['geometry-math'].computeAutoFitTransform(f.mechanicalLoops,size,size),before=JSON.stringify(f);
 assert.equal(mechanicalHash(m,f.mechanicalLoops,size),f.mechanicalHashes[m.three.REVISION][size],'exact mode baseline');
 const border=smoothBorderPrototype(f.mechanicalLoops,fit.scale),rawMM=f.mechanicalLoops.map(l=>l.map(q=>({x:q.x*fit.scale,y:q.y*fit.scale}))),borderMM=border.map(l=>l.map(q=>({x:q.x*fit.scale,y:q.y*fit.scale})));
 contained(rawMM.filter(l=>m['geometry-math'].signedArea2D(l)>0),borderMM);
 const x=rawMM.flat().map(q=>q.x),bx=borderMM.flat().map(q=>q.x);assert.ok(Math.abs(Math.min(...x)-Math.min(...bx)-1.5)<.03);assert.ok(Math.abs(Math.max(...bx)-Math.max(...x)-1.5)<.03);
 const exact=k.createTopRearShellGeometries(f.mechanicalLoops,fit,1,p.topShell.bodyDepthMM,p.topShell.transitionThicknessMM,p.topShell,p.topSocket);
 const shell=k.createTopRearShellGeometries(border,fit,1,p.topShell.bodyDepthMM,p.topShell.transitionThicknessMM,p.topShell,p.topSocket,exact.pedestalLocation,true);
 assert.equal(shell.pedestalLocation.x,exact.pedestalLocation.x);assert.equal(shell.pedestalLocation.y,exact.pedestalLocation.y);
 const boss=s=>k.createTopPedestalGeometry(s.outerMMLoops,s.cavityLoops,p.topSocket,p.topShell.bodyDepthMM,p.topShell.transitionThicknessMM,p.topShell.bossKeepOutMM,p.topShell.minimumWallMM,s.pedestalLocation).geometry;
 const b1=boss(exact),b2=boss(shell);assert.deepEqual(b1.attributes.position.array,b2.attributes.position.array,'boss/socket mesh unchanged');
 const d={},house=m['housing-geometry'].createHousingGeometries(border,fit,1,p.housing,d,shell.pedestalLocation,shell.outerMMLoops,true);
 contained(shell.outerMMLoops,d.chamberLoopsMM);
 const clearance=Math.min(...shell.outerMMLoops.flat().filter((_,i)=>i%20===0).map(q=>distance(q,d.chamberLoopsMM)));
 const wall=Math.min(...d.chamberLoopsMM.flat().filter((_,i)=>i%20===0).map(q=>distance(q,d.housingOuterMMLoops)));
 assert.ok(clearance>=.39);assert.ok(wall>=3.19);assert.equal(JSON.stringify(f),before,'artwork unchanged');
 // Full-footprint offset containment supplements the sampled measurements.
 contained(expanded(shell.outerMMLoops,.39),d.chamberLoopsMM);
 contained(expanded(d.chamberLoopsMM,3.19),d.housingOuterMMLoops);
 const exactDiagnostics={},exactHouse=m['housing-geometry'].createHousingGeometries(f.mechanicalLoops,fit,1,p.housing,exactDiagnostics,exact.pedestalLocation,exact.outerMMLoops);
 for(const field of ['pocketLoopMM','plateLoopMM','zRanges','functionalCenter'])assert.deepEqual(d[field],exactDiagnostics[field],`${field} unchanged`);
 assert.equal(d.openEdges,0);assert.equal(d.nonManifoldEdges,0);
 const top=k.createTopBaseGeometries(border,fit,1,0,p.topBase.thicknessMM,true);
 const backing=k.createTopTransitionGeometries(border,fit,1,p.topShell.transitionThicknessMM,shell.diagnostics.structuralExtension?shell.outerMMLoops:null,true);
 for(const [label,geoms] of Object.entries({top,backing,shell:shell.geometries,house,boss:[b2]}))for(const g of geoms)validSTL(g,`${name} ${label}`);
 for(const angle of [0,90,180,270]){
  const ring=m['keychain-loop'].createKeychainLoopGeometry(d.housingOuterMMLoops,d.pocketLoopMM,d.plateLoopMM,angle,p.keychainLoop);
  assert.ok(ring.geometry,`${name}: safe keychain attachment at ${angle}`);
  validSTL(ring.geometry,`${name} keychain ${angle}`);ring.geometry.dispose();
 }
 for(const g of [...exact.geometries,...shell.geometries,...house,...exactHouse,...top,...backing,b1,b2])g.dispose();
 console.log(`${name} 35 mm: +1.5 mm border; exact baseline, artwork and boss unchanged; clearance ${clearance.toFixed(4)}, wall ${wall.toFixed(4)}`);
}
