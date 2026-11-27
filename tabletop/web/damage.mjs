// The character sheet's confirmed order: Arcane Health, Temp HP, then HP.
// Amount is damage remaining after Block and other mitigation have been resolved.
export function damagePlan(token,amount) {
  let remaining=amount;
  const pools=[['arcaneHealth','Arcane Health'],['tempHP','Temp HP'],['hp','HP']].map(([key,label])=>{
    const before=key==='hp'?token.hp:token.resources[key].current,spent=Math.min(before,remaining);
    remaining-=spent;return {key,label,before,spent,after:before-spent};
  });
  return {amount,pools,remaining};
}
