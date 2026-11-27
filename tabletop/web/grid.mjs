// Tiny footprints use a half-square grid: its centres are the four quarters
// of each normal square. Other token sizes keep the normal grid step.
export const tokenGridStep=(scene,token)=>scene.gridSize*(token.size<1?.5:1);

export function snapToken(scene,token,point) {
  const step=tokenGridStep(scene,token);
  const axis=(value,extent)=>{
    const cell=Math.floor(value/step);
    if(token.size<1)return (Math.max(0,Math.min(Math.floor(extent/step)-1,cell))+.5)*step;
    return Math.max(0,Math.min(extent-1,(cell+.5)*step));
  };
  return {x:axis(point.x,scene.width),y:axis(point.y,scene.height)};
}
