export const TRAVEL_MODES=['walk','fly','hover','swim','climb','burrow'];
export const TRAVEL_NAMES={walk:'Walking',fly:'Flying',hover:'Hovering',swim:'Swimming',climb:'Climbing',burrow:'Burrowing'};
export const feet=value=>Number((Number(value) || 0).toFixed(1))+' ft';
export function travelLabel(token){
  const mode=token.mobility?.mode || 'walk',height=token.mobility?.z || 0;
  return (TRAVEL_NAMES[mode] || mode)+(height?' · '+feet(Math.abs(height))+(height<0?' down':' up'):'');
}
