import {templateGeometry} from '../web/templates.mjs';

const EPS=1e-8,lerp=(a,b,t)=>a+(b-a)*t;
export const routePoint=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z || 0,b.z || 0,t)});
const overlap=(a,b)=>a && b && Math.max(a[0],b[0])<=Math.min(a[1],b[1])+EPS?[Math.max(a[0],b[0]),Math.min(a[1],b[1])]:null;
const union=rows=>{const valid=rows.filter(Boolean);return valid.length?[Math.min(...valid.map(r=>r[0])),Math.max(...valid.map(r=>r[1]))]:null;};
function planes(a,b,rows){
  let result=[0,1];
  for(const [nx,ny,c] of rows){const first=nx*a.x+ny*a.y-c,delta=nx*(b.x-a.x)+ny*(b.y-a.y);
    if(Math.abs(delta)<EPS){if(first>EPS)return null;continue;}
    const t=-first/delta;result=overlap(result,delta>0?[-Infinity,t]:[t,Infinity]);if(!result)return null;
  }return result;
}
function circle(a,b,x,y,r){
  const dx=b.x-a.x,dy=b.y-a.y,px=a.x-x,py=a.y-y,A=dx*dx+dy*dy,C=px*px+py*py-r*r;
  if(A<EPS)return C<=EPS?[0,1]:null;
  const B=2*(px*dx+py*dy),disc=B*B-4*A*C;if(disc<-EPS)return null;
  const root=Math.sqrt(Math.max(0,disc));return overlap([0,1],[(-B-root)/(2*A),(-B+root)/(2*A)]);
}
function capsule(a,b,p,q,r){
  const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(length<EPS)return circle(a,b,p.x,p.y,r);
  const local=v=>({x:((v.x-p.x)*dx+(v.y-p.y)*dy)/length,y:(-(v.x-p.x)*dy+(v.y-p.y)*dx)/length});
  return union([planes(local(a),local(b),[[-1,0,0],[1,0,length],[0,1,r],[0,-1,r]]),circle(a,b,p.x,p.y,r),circle(a,b,q.x,q.y,r)]);
}
function polygon(a,b,points,r){
  const edges=points.map((p,i)=>[p,points[(i+1)%points.length]]),halfplanes=edges.map(([p,q])=>[q.y-p.y,p.x-q.x,(q.y-p.y)*p.x+(p.x-q.x)*p.y]);
  return union([planes(a,b,halfplanes),...(r?edges.map(([p,q])=>capsule(a,b,p,q,r)):[])]);
}
export function areaInterval(area,a,b,scene,radius=0){
  const g=templateGeometry(area,scene),angle=area.shape==='square'?0:g.angle,c=Math.cos(angle),s=Math.sin(angle);
  const local=p=>({x:(p.x-g.x)*c+(p.y-g.y)*s,y:-(p.x-g.x)*s+(p.y-g.y)*c});
  const p=local(a),q=local(b),r=radius;
  if(area.shape==='circle')return circle(p,q,0,0,g.length+r);
  if(area.shape==='square'){const h=g.length/2;return polygon(p,q,[{x:-h,y:-h},{x:h,y:-h},{x:h,y:h},{x:-h,y:h}],r);}
  if(area.shape==='line'){const h=g.width/2;return polygon(p,q,[{x:0,y:-h},{x:g.length,y:-h},{x:g.length,y:h},{x:0,y:h}],r);}
  const h=g.halfAngle,co=Math.cos(h),si=Math.sin(h),wedge=[[-1,0,0],[-si,co,0],[-si,-co,0]];
  return union([overlap(circle(p,q,0,0,g.length+r),planes(p,q,wedge)),
    ...(r?[capsule(p,q,{x:0,y:0},{x:g.length*co,y:g.length*si},r),capsule(p,q,{x:0,y:0},{x:g.length*co,y:-g.length*si},r)]:[])]);
}
export function altitudeInterval(a,b,min,max){
  const start=a.z || 0,delta=(b.z || 0)-start;
  if(Math.abs(delta)<EPS)return start>=min-EPS && start<=max+EPS?[0,1]:null;
  return overlap([0,1],[(min-start)/delta,(max-start)/delta].sort((x,y)=>x-y));
}
export function trapInterval(trap,a,b,scene,token){
  const radius=trap.touchFootprint?scene.gridSize*token.size/2:0;
  return overlap(areaInterval(trap,a,b,scene,radius),altitudeInterval(a,b,trap.minHeight,trap.maxHeight));
}
export function routeDistance(a,b,scene,metric='straight'){
  const feet=(scene.distancePerSquare ?? 5)*(scene.distanceUnit==='m'?1/.3048:1)/scene.gridSize;
  const x=Math.abs(b.x-a.x)*feet,y=Math.abs(b.y-a.y)*feet,z=Math.abs((b.z || 0)-(a.z || 0));
  return metric==='grid'?Math.max(x,y,z):Math.hypot(x,y,z);
}
// Traverse every grid boundary crossed by the route. Supercover corner checks
// prevent a player dragging across a concealed tile between visible endpoints.
export function routeCells(a,b,scene){
  const grid=scene.gridSize,dx=b.x-a.x,dy=b.y-a.y,times=[0,1];
  for(const [start,delta] of [[a.x,dx],[a.y,dy]])if(Math.abs(delta)>EPS){
    const low=Math.min(start,start+delta),high=Math.max(start,start+delta);
    for(let edge=(Math.floor(low/grid)+1)*grid;edge<high;edge+=grid)times.push((edge-start)/delta);
  }
  times.sort((x,y)=>x-y);const cells=new Set(),cols=Math.ceil(scene.width/grid);
  const add=p=>{const x=Math.floor(p.x/grid),y=Math.floor(p.y/grid);if(x>=0 && y>=0 && x<cols && y<Math.ceil(scene.height/grid))cells.add(y*cols+x);};
  for(let i=0;i<times.length;i++){const p=routePoint(a,b,times[i]);add(p);if(i) add(routePoint(a,b,(times[i]+times[i-1])/2));
    if(i && i<times.length-1){add({x:p.x-EPS,y:p.y+EPS});add({x:p.x+EPS,y:p.y-EPS});}
  }return [...cells];
}
