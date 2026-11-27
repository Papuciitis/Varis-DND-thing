const STORAGE_KEY='vara.tabletop.layout.v1';
const make=(tag,cls)=>{const node=document.createElement(tag);node.className=cls;return node;};
export function referenceWidthBounds(viewport,leftClosed=false){
  const left=viewport>900?(leftClosed?36:viewport>=1600?300:viewport<=1250?250:280):0;
  return {min:260,max:Math.max(260,Math.min(720,viewport-left-300))};
}

export class PanelLayout {
  constructor({tools}){
    this.root=document.getElementById('game');this.tools=tools;this.panels={left:document.getElementById('campaign-slate'),right:document.getElementById('inspector'),bottom:document.getElementById('token-dock')};
    this.state={left:false,right:false,bottom:false,rightWidth:null};
    try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved && typeof saved==='object'){
      for(const key of ['left','right','bottom'])this.state[key]=saved[key]===true;
      if(Number.isFinite(saved.rightWidth))this.state.rightWidth=Math.max(260,Math.min(720,saved.rightWidth));
    }}catch{}
    this.toggles=new Map();
    for(const [key,label] of [['left','campaign'],['right','reference']]){
      const panel=this.panels[key],heading=panel.querySelector('.slate-heading');
      const toggle=this.toggle(key,label,'panel-toggle'),rail=make('div','panel-rail'),expand=this.toggle(key,label,'panel-expand');
      expand.append(document.createTextNode(label==='campaign'?'Campaign':'Reference'));rail.append(expand);heading.append(toggle);panel.prepend(rail);
    }
    const dock=this.panels.bottom,heading=dock.querySelector('.dock-heading'),content=make('div','utility-content');
    content.id='utility-content';content.append(...[...dock.children].filter(node=>node!==heading));dock.append(content);
    heading.append(this.toggle('bottom','utilities','utility-toggle'));this.utilityContent=content;
    this.mountResizer();window.addEventListener('resize',()=>this.apply());
    tools.revealUtilities=()=>this.setCollapsed('bottom',false);tools.revealReference=()=>this.setCollapsed('right',false);
    this.apply();
  }
  toggle(key,label,cls){
    const node=make('button',cls);node.type='button';node.dataset.panel=key;
    const icon=make('span','panel-chevron');icon.setAttribute('aria-hidden','true');node.append(icon);
    node.setAttribute('aria-controls',key==='bottom'?'utility-content':this.panels[key].id);
    const list=this.toggles.get(key) || [];list.push({node,label,icon});this.toggles.set(key,list);
    node.onclick=()=>this.setCollapsed(key,!this.state[key]);return node;
  }
  setCollapsed(key,value){this.state[key]=value;this.apply();this.save();}
  save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.state));}catch{}}
  apply(){
    const width=window.innerWidth,bounds=referenceWidthBounds(width,this.state.left);
    const preferred=this.state.rightWidth ?? (width>=1600?360:width<=1250?300:320);
    this.rightWidth=Math.max(bounds.min,Math.min(bounds.max,preferred));
    this.root.style.setProperty('--left-panel-width',(this.state.left?36:width>=1600?300:width<=1250?250:280)+'px');
    this.root.style.setProperty('--right-panel-width',(this.state.right?36:this.rightWidth)+'px');
    for(const [key,entries] of this.toggles){
      const closed=this.state[key];this.panels[key].classList.toggle('panel-is-collapsed',closed);
      for(const {node,label,icon} of entries){
        const text=(closed?'Expand ':'Collapse ')+label+(key==='bottom'?'':' panel');node.setAttribute('aria-label',text);node.title=text;node.setAttribute('aria-expanded',String(!closed));
        icon.textContent=key==='bottom'?(closed?'＋':'−'):key==='left'?(closed?'›':'‹'):(closed?'‹':'›');
      }
    }
    this.resizer.setAttribute('aria-valuemin',String(bounds.min));this.resizer.setAttribute('aria-valuemax',String(bounds.max));this.resizer.setAttribute('aria-valuenow',String(Math.round(this.rightWidth)));
    this.resizer.setAttribute('aria-valuetext',Math.round(this.rightWidth)+' pixels');
  }
  resize(width){const bounds=referenceWidthBounds(window.innerWidth,this.state.left);this.state.rightWidth=Math.max(bounds.min,Math.min(bounds.max,width));this.apply();}
  mountResizer(){
    const handle=make('div','reference-resizer');handle.id='reference-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','Resize reference panel');handle.setAttribute('aria-orientation','vertical');
    handle.title='Drag to resize. Arrow keys also resize; double-click to reset.';this.panels.right.append(handle);this.resizer=handle;
    handle.onpointerdown=event=>{
      if(event.button!==0 || this.state.right || window.innerWidth<=700)return;event.preventDefault();
      this.drag={id:event.pointerId,x:event.clientX,width:this.rightWidth,previous:this.state.rightWidth};handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-panels');
    };
    handle.onpointermove=event=>{if(this.drag?.id===event.pointerId)this.resize(this.drag.width+this.drag.x-event.clientX);};
    const finish=event=>{
      if(this.drag?.id!==event.pointerId)return;
      if(event.type==='pointercancel'){this.state.rightWidth=this.drag.previous;this.apply();}
      this.drag=null;document.body.classList.remove('resizing-panels');if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);this.save();
    };
    handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=finish;
    handle.ondblclick=()=>{this.state.rightWidth=null;this.apply();this.save();};
    handle.onkeydown=event=>{
      const bounds=referenceWidthBounds(window.innerWidth,this.state.left),values={ArrowLeft:this.rightWidth+24,ArrowRight:this.rightWidth-24,Home:bounds.min,End:bounds.max};
      if(!(event.key in values))return;event.preventDefault();this.resize(values[event.key]);this.save();
    };
  }
}
