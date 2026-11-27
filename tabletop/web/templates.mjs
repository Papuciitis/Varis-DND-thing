export function worldDistance(value,unit,scene) {
  const scale=scene.distancePerSquare ?? 5,scaleUnit=scene.distanceUnit ?? 'ft';
  const meters=unit==='squares'?value*scale*(scaleUnit==='m'?1:.3048):value*(unit==='m'?1:.3048);
  return meters/(scale*(scaleUnit==='m'?1:.3048))*scene.gridSize;
}
export function templateGeometry(template,scene) {
  return {x:template.x,y:template.y,angle:template.angle*Math.PI/180,
    length:worldDistance(template.size,template.unit,scene),
    width:worldDistance(template.width,template.unit,scene),halfAngle:template.coneAngle*Math.PI/360};
}
export function templateContains(template,point,scene) {
  const g=templateGeometry(template,scene),dx=point.x-g.x,dy=point.y-g.y;
  if(template.shape==='circle')return Math.hypot(dx,dy)<=g.length;
  if(template.shape==='square')return Math.abs(dx)<=g.length/2 && Math.abs(dy)<=g.length/2;
  const x=dx*Math.cos(g.angle)+dy*Math.sin(g.angle),y=-dx*Math.sin(g.angle)+dy*Math.cos(g.angle);
  if(template.shape==='line')return x>=0 && x<=g.length && Math.abs(y)<=g.width/2;
  return Math.hypot(x,y)<=g.length && Math.abs(Math.atan2(y,x))<=g.halfAngle;
}
export function templateLabel(template) {
  const unit=template.unit==='squares'?'sq':template.unit;
  return template.shape==='circle'?template.size+' '+unit+' radius':
    template.shape==='line'?template.size+' × '+template.width+' '+unit+' line':
    template.shape==='cone'?template.size+' '+unit+' · '+template.coneAngle+'° cone':
    template.size+' × '+template.size+' '+unit;
}
