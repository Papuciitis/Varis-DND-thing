import {tokenRadius} from './resources.mjs';

export const CONDITION_COLORS={control:'#91bfe7',injury:'#edaaa1',disadvantage:'#d7bf77',fear:'#bea0de',mind:'#dba5c3',benefit:'#98c6a5'};
export const conditionColor=row=>CONDITION_COLORS[row.color] || CONDITION_COLORS.disadvantage;
export const conditionAbbreviation=row=>{
  const words=row.name.replace(/[^\p{L}\p{N} ]/gu,' ').trim().split(/\s+/);
  return (words.length>1?words.map(word=>word[0]).join(''):words[0]?.slice(0,2) || '?').slice(0,2).toUpperCase();
};

// Screen-space markers follow the token and wrap independently of private bars.
// At small scales a bounded overflow marker opens the complete condition list.
export function conditionMarkerLayout(scene,token,camera){
  const conditions=token.conditions || [];if(!conditions.length)return null;
  const footprint=scene.gridSize*token.size*camera.z,scale=Math.max(.7,Math.min(1.15,footprint/50));
  const size=Math.round(18*scale),gap=Math.round(3*scale);
  const columns=Math.min(4,conditions.length,Math.max(1,Math.floor((footprint+gap)/(size+gap))));
  const limit=columns*3,overflow=conditions.length>limit?conditions.length-limit+1:0;
  const visible=conditions.slice(0,overflow?limit-1:limit),count=visible.length+(overflow?1:0),rows=Math.ceil(count/columns);
  const width=columns*size+(columns-1)*gap,height=rows*size+(rows-1)*gap;
  return {x:camera.x+token.x*camera.z-width/2,y:camera.y+token.y*camera.z+tokenRadius(scene,token)*camera.z+5,
    width,height,size,gap,columns,visible,overflow,offset:height+8};
}
