import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionMarkerLayout,conditionAbbreviation} from '../tabletop/web/condition-markers.mjs';
import {referenceWidthBounds} from '../tabletop/web/panel-layout.mjs';

const scene={gridSize:50},conditions=Array.from({length:20},(_,index)=>({id:'effect-'+index,name:'Effect '+index,stacks:index+1,color:'injury'}));
test('condition markers follow token coordinates at every size and zoom without overlapping each other',()=>{
  for(const size of [.5,1,2,3,4,6])for(const z of [.2,.5,1,4]){
    const token={id:'creature',x:350,y:450,size,conditions},camera={x:10,y:20,z},layout=conditionMarkerLayout(scene,token,camera);
    assert.equal(layout.x+layout.width/2,camera.x+token.x*z);
    assert(layout.y>camera.y+token.y*z);
    const count=layout.visible.length+(layout.overflow?1:0);
    assert(count<=12);assert.equal(layout.visible.length+layout.overflow,conditions.length);
    const rects=Array.from({length:count},(_,index)=>({x:index%layout.columns*(layout.size+layout.gap),y:Math.floor(index/layout.columns)*(layout.size+layout.gap)}));
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i],b=rects[j];assert(a.x+layout.size<=b.x || b.x+layout.size<=a.x || a.y+layout.size<=b.y || b.y+layout.size<=a.y);
    }
    assert(layout.offset>layout.height,'Resource bars need room below all condition markers.');
  }
});
test('public markers do not depend on private health and preserve individual stack counts',()=>{
  const token={x:100,y:200,size:1,conditions:conditions.slice(0,2)},camera={x:0,y:0,z:1};
  assert.deepEqual(conditionMarkerLayout(scene,{...token,hp:null,canViewStats:false},camera),conditionMarkerLayout(scene,{...token,hp:40,canViewStats:true},camera));
  assert.deepEqual(conditionMarkerLayout(scene,token,camera).visible.map(row=>row.stacks),[1,2]);
  assert.equal(conditionMarkerLayout(scene,{...token,conditions:[]},camera),null);
  assert.equal(conditionAbbreviation({name:'Acid exposure'}),'AE');
});
test('reference resizing reserves map space and reclaims collapsed campaign width',()=>{
  for(const width of [701,800,901,1100,1440,1920]){
    const bounds=referenceWidthBounds(width);assert(bounds.max>=bounds.min);assert(bounds.max<=720);
    assert(referenceWidthBounds(width,true).max>=bounds.max);
    const left=width>900?(width>=1600?300:width<=1250?250:280):0;
    assert(width-left-bounds.max>=300);
  }
});
