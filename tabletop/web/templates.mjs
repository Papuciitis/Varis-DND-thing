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
export function templateLabel(template) {
  const unit=template.unit==='squares'?'sq':template.unit;
  return template.shape==='circle'?template.size+' '+unit+' radius':
    template.shape==='line'?template.size+' × '+template.width+' '+unit+' line':
    template.shape==='cone'?template.size+' '+unit+' · '+template.coneAngle+'° cone':
    template.size+' × '+template.size+' '+unit;
}
