import {auxiliaryReadings,healthSummary,tokenBarsVisible,distanceLabel,tokenRadius} from './resources.mjs';
import {templateGeometry,templateLabel,templateContains} from './templates.mjs';

export class MapBoard {
  constructor(canvas,{onSelect,onMove,onFog,onError,onContext}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');Object.assign(this,{onSelect,onMove,onFog,onError,onContext});
    this.measureUnit='ft';
    this.templateConfig={shape:'circle',size:20,width:5,coneAngle:60,unit:'ft'};
    this.tool='select';this.brush=1;this.enabled=false;this.camera=null;this.selected=null;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.move(e));
    canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.hovered=null;this.draw();}});
    canvas.addEventListener('pointerup',e=>this.up(e));
    canvas.addEventListener('pointercancel',()=>{clearTimeout(this.longPress);this.drag=null;this.stroke=null;this.draw();});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY>0 ? .9 : 1.1,e.offsetX,e.offsetY);},{passive:false});
    canvas.addEventListener('contextmenu',e=>{e.preventDefault();this.context(e);});
    canvas.addEventListener('keydown',e=>{
      const vectors={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
      const t=this.view?.scene.tokens.find(t=>t.id===this.selected);
      if (!vectors[e.key] || !t || !this.canMove(t))return;
      e.preventDefault();const [x,y]=vectors[e.key],s=this.view.scene;
      this.onMove(t.id,Math.max(0,Math.min(s.width-1,t.x+x*s.gridSize)),Math.max(0,Math.min(s.height-1,t.y+y*s.gridSize)));
    });
  }
  setView(view) {
    const old=this.view?.scene;
    this.view=view;
    if(!this.camera || old?.width!==view.scene.width || old?.height!==view.scene.height)this.initialPosition();
    this.draw();
  }
  setImage(url) {
    const image=new Image();this.image=image;
    image.onload=()=>this.draw();image.onerror=()=>this.onError('The map image could not be loaded.');image.src=url;
  }
  resize() {
    const r=this.canvas.getBoundingClientRect();if(!r.width || !r.height)return;
    const oldWidth=this.width,oldHeight=this.height;
    this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio || 1,2);
    this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);
    if(this.view && (!this.camera || !oldWidth || !oldHeight))this.initialPosition();
    else {if(this.camera){this.camera.x+=(r.width-oldWidth)/2;this.camera.y+=(r.height-oldHeight)/2;}this.draw();}
  }
  initialPosition() {
    const token=this.view?.scene.tokens.find(t=>t.ownerId===this.view.self.id) || this.view?.scene.tokens[0];
    if(this.width<600 && token){const z=.9;this.camera={z,x:this.width/2-token.x*z,y:this.height/2-token.y*z};this.draw();}
    else this.fit();
  }
  fit() {
    if(!this.view || !this.width || !this.height)return;
    const s=this.view.scene,z=Math.max(.08,Math.min((this.width-40)/s.width,(this.height-110)/s.height));
    this.camera={z,x:(this.width-s.width*z)/2,y:(this.height-s.height*z)/2+10};this.draw();
  }
  zoom(factor,x=this.width/2,y=this.height/2) {
    if(!this.camera)return;
    const c=this.camera,z=Math.min(4,Math.max(.08,c.z*factor)),k=z/c.z;
    c.x=x-(x-c.x)*k;c.y=y-(y-c.y)*k;c.z=z;this.draw();
  }
  point(e) {
    const r=this.canvas.getBoundingClientRect(),c=this.camera;
    return {x:(e.clientX-r.left-c.x)/c.z,y:(e.clientY-r.top-c.y)/c.z};
  }
  center(point) {this.camera.x=this.width/2-point.x*this.camera.z;this.camera.y=this.height/2-point.y*this.camera.z;this.draw();}
  measureFrom(point) {this.tool='measure';this.measure={start:point,end:point};this.measureAnchor=point;this.draw();}
  context(e) {
    if(!this.view || !this.camera)return;
    clearTimeout(this.longPress);this.drag=null;this.stroke=null;
    const point=this.point(e),token=this.hit(point);
    if(token){this.selected=token.id;this.onSelect(token.id);}
    const templateIds=[...(this.view.scene.templates || [])].reverse().filter(area=>templateContains(area,point,this.view.scene)).map(area=>area.id);
    const preview=!!this.templatePreview && templateContains(this.templatePreview,point,this.view.scene);
    this.onContext?.({tokenId:token?.id || null,templateIds,preview,x:e.clientX,y:e.clientY,point});this.draw();
  }
  canMove(t) {return this.enabled && (this.view.self.role==='dm' || t.ownerId===this.view.self.id);}
  hit(p) {
    return [...this.view.scene.tokens].reverse().find(token=>{
      const r=tokenRadius(this.view.scene,token);
      if(Math.hypot(token.x-p.x,token.y-p.y)<r*1.3)return true;
      const bars=tokenBarsVisible(token,this.selected,this.hovered)?1+auxiliaryReadings(token).length:0,z=this.camera.z;
      const halfWidth=(token.id===this.selected?78:72)/z,top=token.y+r+6/z;
      return bars && Math.abs(p.x-token.x)<=halfWidth && p.y>=top && p.y<=top+bars*26/z;
    });
  }
  down(e) {
    if(!this.view || !this.camera || e.button>1)return;
    this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);
    const p=this.point(e);
    if(e.pointerType==='touch'){
      this.touchStart={x:e.clientX,y:e.clientY};this.longPressed=false;
      this.longPress=setTimeout(()=>{this.longPressed=true;this.context(e);},550);
    }
    if(['reveal','conceal'].includes(this.tool) && this.view.self.role==='dm' && this.enabled) {
      this.stroke={cells:new Set(),reveal:this.tool==='reveal'};this.paint(p);return;
    }
    if(this.tool==='template'){
      const origin=this.templateAnchor || {x:Math.max(0,Math.min(this.view.scene.width-1,p.x)),y:Math.max(0,Math.min(this.view.scene.height-1,p.y))};
      this.templatePreview={...this.templateConfig,...origin,angle:0};this.templateAnchor=null;
      this.drag={kind:'template'};this.onTemplate?.();this.draw();return;
    }
    if(this.tool==='measure') {this.measure={start:this.measureAnchor || p,end:p};this.measureAnchor=null;this.drag={kind:'measure'};this.draw();return;}
    const token=this.tool==='select' && e.button===0 ? this.hit(p) : null;
    if(token) {
      this.selected=token.id;this.onSelect(token.id);
      if(this.canMove(token))this.drag={kind:'token',id:token.id,x:token.x,y:token.y,offsetX:p.x-token.x,offsetY:p.y-token.y};
      this.draw();return;
    }
    this.drag={kind:'pan',x:e.clientX,y:e.clientY,cx:this.camera.x,cy:this.camera.y};
  }
  move(e) {
    if(!this.view || !this.camera)return;
    if(this.touchStart && Math.hypot(e.clientX-this.touchStart.x,e.clientY-this.touchStart.y)>8)clearTimeout(this.longPress);
    if(this.longPressed)return;
    if(this.stroke){this.paint(this.point(e));return;}
    if(!this.drag){const hovered=this.hit(this.point(e))?.id;if(hovered!==this.hovered){this.hovered=hovered;this.draw();}return;}
    if(this.drag.kind==='pan'){this.camera.x=this.drag.cx+e.clientX-this.drag.x;this.camera.y=this.drag.cy+e.clientY-this.drag.y;}
    else if(this.drag.kind==='measure')this.measure.end=this.point(e);
    else if(this.drag.kind==='template'){
      const p=this.point(e),area=this.templatePreview;
      area.angle=Math.atan2(p.y-area.y,p.x-area.x)*180/Math.PI;
    }
    else {const p=this.point(e),s=this.view.scene;this.drag.x=Math.max(0,Math.min(s.width-1,p.x-this.drag.offsetX));this.drag.y=Math.max(0,Math.min(s.height-1,p.y-this.drag.offsetY));}
    this.draw();
  }
  up(e) {
    clearTimeout(this.longPress);this.touchStart=null;
    if(this.longPressed){this.longPressed=false;return;}
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    const drag=this.drag,stroke=this.stroke;this.drag=null;this.stroke=null;this.draw();
    if(stroke?.cells.size)this.onFog([...stroke.cells],stroke.reveal);
    if(drag?.kind==='token')this.onMove(drag.id,drag.x,drag.y);
    if(drag?.kind==='template')this.onTemplate?.();
  }
  paint(p) {
    const s=this.view.scene,cols=Math.ceil(s.width/s.gridSize),rows=Math.ceil(s.height/s.gridSize),radius=Math.floor(this.brush/2);
    const x=Math.floor(p.x/s.gridSize),y=Math.floor(p.y/s.gridSize);
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++) {
      const a=x+dx,b=y+dy;if(a>=0 && a<cols && b>=0 && b<rows)this.stroke.cells.add(b*cols+a);
    }
    this.draw();
  }
  draw() {
    const ctx=this.ctx;if(!this.width || !this.height)return;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
    if(!this.view || !this.camera)return;
    const s=this.view.scene,c=this.camera,dm=this.view.self.role==='dm';
    ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.z,c.z);
    ctx.fillStyle='#314735';ctx.fillRect(0,0,s.width,s.height);
    if(this.image?.complete && this.image.naturalWidth)ctx.drawImage(this.image,0,0,s.width,s.height);
    if(s.showGrid){ctx.lineWidth=2.5/c.z;ctx.strokeStyle='rgba(8,20,14,'+(s.gridOpacity ?? .6)+')';ctx.beginPath();
      for(let x=0;x<=s.width;x+=s.gridSize){ctx.moveTo(x,0);ctx.lineTo(x,s.height);}
      for(let y=0;y<=s.height;y+=s.gridSize){ctx.moveTo(0,y);ctx.lineTo(s.width,y);}ctx.stroke();
      ctx.lineWidth=1/c.z;ctx.strokeStyle='rgba(248,246,221,'+(s.gridOpacity ?? .6)+')';ctx.stroke();}
    for(const template of s.templates || [])this.drawTemplate(template,false);
    if(this.templatePreview)this.drawTemplate(this.templatePreview,true);
    const revealed=new Set(s.fog.revealed);
    if(this.stroke)for(const cell of this.stroke.cells)this.stroke.reveal?revealed.add(cell):revealed.delete(cell);
    if(s.fog.enabled){const cols=Math.ceil(s.width/s.gridSize),rows=Math.ceil(s.height/s.gridSize);
      ctx.save();ctx.beginPath();ctx.rect(0,0,s.width,s.height);ctx.clip();ctx.fillStyle=dm?'#101f19a8':'#14251e';
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(!revealed.has(y*cols+x))ctx.fillRect(x*s.gridSize,y*s.gridSize,s.gridSize+.5,s.gridSize+.5);ctx.restore();}
    ctx.strokeStyle='#8e977450';ctx.lineWidth=2/c.z;ctx.strokeRect(0,0,s.width,s.height);
    for(const token of s.tokens) {
      const t=this.drag?.kind==='token' && this.drag.id===token.id ? {...token,x:this.drag.x,y:this.drag.y}:token;
      const r=tokenRadius(s,t);
      ctx.save();ctx.globalAlpha=t.hidden ? .55 : 1;
      if(t.id===s.combat.activeId || t.id===this.selected){ctx.beginPath();ctx.arc(t.x,t.y,r+7/c.z,0,Math.PI*2);ctx.strokeStyle=t.id===this.selected?'#e1c47e':'#9abf8c';ctx.lineWidth=2/c.z;ctx.stroke();}
      ctx.shadowColor='#07160c99';ctx.shadowBlur=10/c.z;ctx.shadowOffsetY=3/c.z;
      ctx.beginPath();ctx.arc(t.x,t.y,r,0,Math.PI*2);ctx.fillStyle=t.color;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.strokeStyle=t.kind==='monster'?'#c08a6c':'#d0b87c';ctx.lineWidth=3/c.z;if(t.hidden)ctx.setLineDash([4/c.z,3/c.z]);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#fff5d9';ctx.font=`bold ${Math.max(s.gridSize*.36*t.size,13/c.z)}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.name.slice(0,1).toUpperCase(),t.x,t.y+1/c.z);
      if(t.id===this.selected || t.id===this.hovered || t.id===s.combat.activeId){
        const label=t.name+(t.hidden?' · hidden':'');ctx.font=`${10/c.z}px 'Segoe UI',sans-serif`;
        ctx.font=13/c.z+"px 'Segoe UI',sans-serif";
        const width=ctx.measureText(label).width+12/c.z,y=t.y-r-16/c.z;
        ctx.fillStyle='#14251cf0';ctx.fillRect(t.x-width/2,y-11/c.z,width,22/c.z);ctx.fillStyle='#f6f2dc';ctx.fillText(label,t.x,y);
      }
      ctx.restore();
    }
    if(this.measure){const {start,end}=this.measure;ctx.strokeStyle='#e8d194';ctx.lineWidth=2/c.z;ctx.setLineDash([5/c.z,4/c.z]);ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.setLineDash([]);
      const text=distanceLabel(s,start,end,this.measureUnit);ctx.font=`bold ${12/c.z}px 'Segoe UI'`;ctx.textAlign='center';ctx.fillStyle='#f0dfae';ctx.fillText(text,(start.x+end.x)/2,(start.y+end.y)/2-10/c.z);}
    ctx.restore();
    this.drawResources();
    this.onMeasure?.(this.measure?distanceLabel(s,this.measure.start,this.measure.end,this.measureUnit):'');
    this.canvas.style.cursor=this.tool==='pan'?'grab':['reveal','conceal','measure'].includes(this.tool)?'crosshair':'default';
  }
  drawResources() {
    const ctx=this.ctx,c=this.camera,s=this.view.scene;
    for(const original of s.tokens){
      const token=this.drag?.kind==='token' && this.drag.id===original.id?{...original,x:this.drag.x,y:this.drag.y}:original;
      if(!tokenBarsVisible(token,this.selected,this.hovered))continue;
      const health=healthSummary(token),bars=auxiliaryReadings(token);
      const x=c.x+token.x*c.z,r=tokenRadius(s,token)*c.z,y=c.y+token.y*c.z+r+6;
      const width=token.id===this.selected?156:144,left=x-width/2;
      ctx.save();ctx.globalAlpha=token.hidden ? .6 : 1;
      ctx.strokeStyle='#d4c18c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x,y);ctx.stroke();
      ctx.fillStyle='#183227';ctx.strokeStyle='#d4c18c';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+26,y);ctx.lineTo(left+26,y+16);ctx.lineTo(left+13,y+26);ctx.lineTo(left,y+16);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#fffce9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font="700 13px 'Segoe UI'";ctx.fillText(health.armorClass,left+13,y+9);
      ctx.font="8px 'Segoe UI'";ctx.fillText('AC',left+13,y+20);
      const trackLeft=left+30,trackWidth=width-30;ctx.fillStyle='#102019';ctx.fillRect(trackLeft,y,trackWidth,21);
      let offset=0;
      for(const segment of health.segments){const size=trackWidth*segment.fraction;ctx.fillStyle=segment.color;ctx.fillRect(trackLeft+offset,y,size,21);offset+=size;}
      ctx.strokeStyle='#d3d9bd';ctx.strokeRect(trackLeft,y,trackWidth,21);
      ctx.font="600 12px 'Segoe UI'";ctx.lineWidth=3;ctx.strokeStyle='#102019';ctx.fillStyle='#fffce9';
      const total=health.current+' / '+health.max;ctx.strokeText(total,trackLeft+trackWidth/2,y+10.5);ctx.fillText(total,trackLeft+trackWidth/2,y+10.5);ctx.lineWidth=1;
      bars.forEach((bar,index)=>{
        const top=y+29+index*23;
        ctx.fillStyle='#0f211bf2';ctx.fillRect(left,top,width,19);
        const ratio=bar.max?Math.min(1,bar.current/bar.max):bar.current?1:0;
        ctx.fillStyle=index===0 && ratio<.3?'#a34e40':bar.color;
        ctx.globalAlpha=token.hidden ? .4 : .75;ctx.fillRect(left+1,top+1,(width-2)*ratio,17);
        ctx.globalAlpha=token.hidden ? .6 : 1;ctx.strokeStyle='#d3d9bd88';ctx.strokeRect(left,top,width,19);
        const value=bar.max===null?String(bar.current):bar.current+' / '+bar.max;
        ctx.font="600 12px 'Segoe UI',sans-serif";ctx.textBaseline='middle';ctx.textAlign='left';
        let label=bar.label;
        while(label && ctx.measureText(label+'…').width>width-ctx.measureText(value).width-14)label=label.slice(0,-1);
        if(label!==bar.label)label+='…';
        ctx.fillStyle='#fffce9';ctx.shadowColor='#000';ctx.shadowBlur=3;ctx.fillText(label,left+4,top+9.5);
        ctx.textAlign='right';ctx.fillText(value,left+width-4,top+9.5);ctx.shadowBlur=0;
      });
      ctx.restore();
    }
  }
  drawTemplate(template,preview) {
    const ctx=this.ctx,c=this.camera,geometry=templateGeometry(template,this.view.scene);
    ctx.save();ctx.translate(geometry.x,geometry.y);
    if(template.shape!=='circle' && template.shape!=='square')ctx.rotate(geometry.angle);
    ctx.beginPath();
    if(template.shape==='circle')ctx.arc(0,0,geometry.length,0,Math.PI*2);
    else if(template.shape==='square')ctx.rect(-geometry.length/2,-geometry.length/2,geometry.length,geometry.length);
    else if(template.shape==='line')ctx.rect(0,-geometry.width/2,geometry.length,geometry.width);
    else {ctx.moveTo(0,0);ctx.arc(0,0,geometry.length,-geometry.halfAngle,geometry.halfAngle);ctx.closePath();}
    ctx.fillStyle=preview?'#ecc76b38':'#b08bc344';ctx.strokeStyle=preview?'#ffe09a':'#d0a5e4';
    ctx.lineWidth=2/c.z;if(preview)ctx.setLineDash([6/c.z,4/c.z]);ctx.fill();ctx.stroke();ctx.setLineDash([]);
    ctx.restore();ctx.save();
    ctx.font='600 '+13/c.z+"px 'Segoe UI',sans-serif";ctx.textAlign='center';ctx.textBaseline='middle';
    const text=templateLabel(template),width=ctx.measureText(text).width+14/c.z;
    const y=template.y-(template.shape==='circle'?geometry.length:0)-16/c.z;
    ctx.fillStyle='#13251bed';ctx.fillRect(template.x-width/2,y-11/c.z,width,22/c.z);
    ctx.fillStyle=preview?'#ffe09a':'#e6c4f4';ctx.fillText(text,template.x,y);ctx.restore();
  }
}
