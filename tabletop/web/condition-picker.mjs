const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function field(parent,title,id,tag='input'){
  const label=el('label','field',title),input=el(tag);input.id=id;label.htmlFor=id;label.append(input);parent.append(label);return input;
}

// Show the available names before the user types; keep custom effects explicit.
export class ConditionPicker {
  constructor(parent,prefix){
    this.element=el('div','condition-picker');parent.append(this.element);
    this.search=field(this.element,'Search conditions',prefix+'-condition-search');this.search.type='search';this.search.placeholder='Browse all conditions or search';
    this.select=field(this.element,'Condition',prefix+'-condition','select');this.select.size=6;
    this.hint=el('p','field-note condition-picker-count');this.element.append(this.hint);
    this.customName=field(this.element,'Custom effect name',prefix+'-custom-condition');this.customName.maxLength=80;
    this.search.oninput=()=>this.render();this.select.onchange=()=>{this.selected=this.select.value;this.setEnabled(this.enabled);this.onChange?.();};
    this.load(null);
  }
  render(){
    const definitions=[...(globalThis.CharacterConditions?.definitions || [])].sort((a,b)=>a.name.localeCompare(b.name)),query=this.search.value.trim().toLowerCase();
    const matches=definitions.filter(row=>row.name.toLowerCase().includes(query)),rows=definitions.filter(row=>matches.includes(row) || row.id===this.selected);
    const placeholder=new Option(matches.length?'Choose a condition…':'No matching standard conditions','');placeholder.disabled=true;
    this.select.replaceChildren(placeholder,...rows.map(row=>new Option(row.name,row.id)),new Option('Custom effect…','__custom__'));
    this.select.value=this.selected || '';this.hint.textContent=query?matches.length+' matching standard conditions':definitions.length+' standard conditions; custom effects are separate.';
    this.setEnabled(this.enabled);
  }
  load(row){
    this.current=row;this.search.value='';const definition=globalThis.CharacterConditions?.lookup(row?.id) || globalThis.CharacterConditions?.lookup(row?.name);
    this.selected=row?(definition?.id || '__custom__'):'';this.customName.value=definition?'':row?.name || '';this.render();
  }
  setEnabled(enabled){
    this.enabled=!!enabled;this.element.hidden=!enabled;this.search.disabled=this.select.disabled=!enabled;this.select.required=!!enabled;
    const custom=!!enabled && this.selected==='__custom__';this.customName.closest('label').hidden=!custom;this.customName.disabled=!custom;this.customName.required=custom;
  }
  value(stacks){
    const rules=globalThis.CharacterConditions,definition=rules.lookup(this.select.value);
    if(!definition && this.select.value!=='__custom__')throw new Error('Choose a condition from the list.');
    const name=definition?.name || this.customName.value.trim(),id=definition?.id || rules.customId(name),previous=this.current?.id===id?this.current:{};
    return rules.normalize([{...previous,id,name,stacks}],{strict:true})[0];
  }
}
