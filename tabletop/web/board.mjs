export class MapBoard {
  constructor(canvas,{onSelect,onMove,onFog,onError}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');Object.assign(this,{onSelect,onMove,onFog,onError});
    this.tool='select';this.brush=1;this.enabled=false;this.camera=null;this.selected=null;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.move(e));
    canvas.addEventListener('pointerup',e=>this.up(e));
    canvas.addEventListener('pointercancel',()=>{this.drag=null;this.stroke=null;this.draw();});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY>0 ? .9 : 1.1,e.offsetX,e.offsetY);},{passive:false});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
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
    this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio || 1,2);
    this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);
    if(this.view)this.initialPosition();else this.draw();
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
  canMove(t) {return this.enabled && (this.view.self.role==='dm' || t.ownerId===this.view.self.id);}
  hit(p) {return [...this.view.scene.tokens].reverse().find(t=>Math.hypot(t.x-p.x,t.y-p.y)<this.view.scene.gridSize*t.size*.46);}
  down(e) {
    if(!this.view || !this.camera || e.button>1)return;
    this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);
    const p=this.point(e);
    if(['reveal','conceal'].includes(this.tool) && this.view.self.role==='dm' && this.enabled) {
      this.stroke={cells:new Set(),reveal:this.tool==='reveal'};this.paint(p);return;
    }
    if(this.tool==='measure') {this.measure={start:p,end:p};this.drag={kind:'measure'};this.draw();return;}
    const token=this.tool==='select' && e.button===0 ? this.hit(p) : null;
    if(token) {
      this.selected=token.id;this.onSelect(token.id);
      if(this.canMove(token))this.drag={kind:'token',id:token.id,x:token.x,y:token.y};
      this.draw();return;
    }
    this.drag={kind:'pan',x:e.clientX,y:e.clientY,cx:this.camera.x,cy:this.camera.y};
  }
  move(e) {
    if(!this.view || !this.camera)return;
    if(this.stroke){this.paint(this.point(e));return;}
    if(!this.drag){const hovered=this.hit(this.point(e))?.id;if(hovered!==this.hovered){this.hovered=hovered;this.draw();}return;}
    if(this.drag.kind==='pan'){this.camera.x=this.drag.cx+e.clientX-this.drag.x;this.camera.y=this.drag.cy+e.clientY-this.drag.y;}
    else if(this.drag.kind==='measure')this.measure.end=this.point(e);
    else {const p=this.point(e),s=this.view.scene;this.drag.x=Math.max(0,Math.min(s.width-1,p.x));this.drag.y=Math.max(0,Math.min(s.height-1,p.y));}
    this.draw();
  }
  up(e) {
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    const drag=this.drag,stroke=this.stroke;this.drag=null;this.stroke=null;this.draw();
    if(stroke?.cells.size)this.onFog([...stroke.cells],stroke.reveal);
    if(drag?.kind==='token')this.onMove(drag.id,drag.x,drag.y);
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
    if(s.showGrid){ctx.strokeStyle='#d8dbc327';ctx.lineWidth=1/c.z;ctx.beginPath();
      for(let x=0;x<=s.width;x+=s.gridSize){ctx.moveTo(x,0);ctx.lineTo(x,s.height);}
      for(let y=0;y<=s.height;y+=s.gridSize){ctx.moveTo(0,y);ctx.lineTo(s.width,y);}ctx.stroke();}
    const revealed=new Set(s.fog.revealed);
    if(this.stroke)for(const cell of this.stroke.cells)this.stroke.reveal?revealed.add(cell):revealed.delete(cell);
    if(s.fog.enabled){const cols=Math.ceil(s.width/s.gridSize),rows=Math.ceil(s.height/s.gridSize);
      ctx.save();ctx.beginPath();ctx.rect(0,0,s.width,s.height);ctx.clip();ctx.fillStyle=dm?'#101f19a8':'#14251e';
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(!revealed.has(y*cols+x))ctx.fillRect(x*s.gridSize,y*s.gridSize,s.gridSize+.5,s.gridSize+.5);ctx.restore();}
    ctx.strokeStyle='#8e977450';ctx.lineWidth=2/c.z;ctx.strokeRect(0,0,s.width,s.height);
    for(const token of s.tokens) {
      const t=this.drag?.kind==='token' && this.drag.id===token.id ? {...token,x:this.drag.x,y:this.drag.y}:token;
      const r=s.gridSize*.35*t.size;
      ctx.save();ctx.globalAlpha=t.hidden ? .55 : 1;
      if(t.id===s.combat.activeId || t.id===this.selected){ctx.beginPath();ctx.arc(t.x,t.y,r+7/c.z,0,Math.PI*2);ctx.strokeStyle=t.id===this.selected?'#e1c47e':'#9abf8c';ctx.lineWidth=2/c.z;ctx.stroke();}
      ctx.shadowColor='#07160c99';ctx.shadowBlur=10/c.z;ctx.shadowOffsetY=3/c.z;
      ctx.beginPath();ctx.arc(t.x,t.y,r,0,Math.PI*2);ctx.fillStyle=t.color;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.strokeStyle=t.kind==='monster'?'#c08a6c':'#d0b87c';ctx.lineWidth=3/c.z;if(t.hidden)ctx.setLineDash([4/c.z,3/c.z]);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#fff5d9';ctx.font=`bold ${Math.max(s.gridSize*.36*t.size,13/c.z)}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.name.slice(0,1).toUpperCase(),t.x,t.y+1/c.z);
      if(t.id===this.selected || t.id===this.hovered || t.id===s.combat.activeId){
        const label=t.name+(t.hidden?' · hidden':'');ctx.font=`${10/c.z}px 'Segoe UI',sans-serif`;
        const width=ctx.measureText(label).width+12/c.z,y=t.id===this.selected ? t.y+r+14/c.z : t.y-r-15/c.z;
        ctx.fillStyle='#14251cdb';ctx.fillRect(t.x-width/2,y-8/c.z,width,16/c.z);ctx.fillStyle='#e1e2c9';ctx.fillText(label,t.x,y);
      }
      if(t.hp!==null && t.maxHp){ctx.fillStyle='#223b25';ctx.fillRect(t.x-r,t.y+r+24/c.z,r*2,3/c.z);ctx.fillStyle=t.hp/t.maxHp<.3?'#c78362':'#99b67b';ctx.fillRect(t.x-r,t.y+r+24/c.z,r*2*(t.hp/t.maxHp),3/c.z);}
      ctx.restore();
    }
    if(this.measure){const {start,end}=this.measure;ctx.strokeStyle='#e8d194';ctx.lineWidth=2/c.z;ctx.setLineDash([5/c.z,4/c.z]);ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.setLineDash([]);
      const text=(Math.hypot(end.x-start.x,end.y-start.y)/s.gridSize).toFixed(1)+' squares';ctx.font=`bold ${12/c.z}px 'Segoe UI'`;ctx.textAlign='center';ctx.fillStyle='#f0dfae';ctx.fillText(text,(start.x+end.x)/2,(start.y+end.y)/2-10/c.z);}
    ctx.restore();
    this.canvas.style.cursor=this.tool==='pan'?'grab':['reveal','conceal','measure'].includes(this.tool)?'crosshair':'default';
  }
}
