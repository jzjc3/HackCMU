import {feature,merge} from 'topojson-client';
import {geoCentroid} from 'd3';
import type {GeoGeometryObjects} from 'd3-geo';
import type {Region} from '@/lib/types';
const GROUPS:Record<Region,string[]>={
 'North America':['United States of America','Canada','Mexico','Greenland','Guatemala','Belize','Honduras','El Salvador','Nicaragua','Costa Rica','Panama','Cuba','Haiti','Dominican Rep.','Jamaica','Bahamas','Puerto Rico','Trinidad and Tobago'],
 'South America':['Brazil','Argentina','Chile','Peru','Colombia','Venezuela','Bolivia','Ecuador','Paraguay','Uruguay','Guyana','Suriname','Falkland Is.'],
 Europe:['France','Spain','Portugal','Germany','Poland','Italy','United Kingdom','Ireland','Iceland','Norway','Sweden','Finland','Denmark','Netherlands','Belgium','Luxembourg','Switzerland','Austria','Czechia','Slovakia','Hungary','Romania','Bulgaria','Greece','Albania','North Macedonia','Serbia','Bosnia and Herz.','Croatia','Slovenia','Montenegro','Kosovo','Ukraine','Belarus','Lithuania','Latvia','Estonia','Moldova','Cyprus','N. Cyprus'],
 Asia:['Russia','China','India','Kazakhstan','Mongolia','Iran','Iraq','Saudi Arabia','Yemen','Oman','United Arab Emirates','Qatar','Kuwait','Jordan','Israel','Palestine','Lebanon','Syria','Turkey','Georgia','Armenia','Azerbaijan','Turkmenistan','Uzbekistan','Kyrgyzstan','Tajikistan','Afghanistan','Pakistan','Nepal','Bhutan','Bangladesh','Myanmar','Thailand','Laos','Vietnam','Cambodia','Malaysia','Indonesia','Philippines','Brunei','Sri Lanka','Japan','South Korea','North Korea','Taiwan','Timor-Leste'],
 Africa:['Morocco','Algeria','Tunisia','Libya','Egypt','Sudan','S. Sudan','Ethiopia','Eritrea','Djibouti','Somalia','Somaliland','Kenya','Uganda','Tanzania','Rwanda','Burundi','Dem. Rep. Congo','Congo','Gabon','Eq. Guinea','Cameroon','Nigeria','Niger','Chad','Mali','Mauritania','Senegal','Gambia','Guinea-Bissau','Guinea','Sierra Leone','Liberia',"Côte d'Ivoire",'Ghana','Togo','Benin','Burkina Faso','Central African Rep.','Angola','Zambia','Zimbabwe','Mozambique','Malawi','Namibia','Botswana','South Africa','Lesotho','eSwatini','Madagascar','W. Sahara'],
 Oceania:['Australia','New Zealand','Papua New Guinea','Solomon Is.','Vanuatu','Fiji','New Caledonia'],Antarctica:['Antarctica','Fr. S. Antarctic Lands']};
type Geometry={properties:{name:string};[key:string]:unknown};
type Topology={objects:{countries:{geometries:Geometry[]}};arcs:unknown;transform?:unknown;type:'Topology'};
export interface RegionFeature {id:Region;type:'Feature';properties:{name:Region};geometry:GeoGeometryObjects|null}
export async function loadGeography(signal?:AbortSignal):Promise<RegionFeature[]>{
 const response=await fetch('/data/countries-110m.json',{signal});if(!response.ok)throw new Error('Map data unavailable');
 const topo=await response.json() as Topology;const geos=topo.objects.countries.geometries;const byName=Object.fromEntries(geos.map(g=>[g.properties.name,g]));const assigned=new Set<string>();
 const out=(Object.keys(GROUPS) as Region[]).map(k=>{const gs=GROUPS[k].map(n=>byName[n]).filter(Boolean);gs.forEach(g=>assigned.add(g.properties.name));return{id:k,type:'Feature' as const,properties:{name:k},geometry:merge(topo as never,gs as never)}});
 const extras:Partial<Record<Region,Geometry[]>>={};geos.filter(g=>!assigned.has(g.properties.name)).forEach(g=>{const c=geoCentroid(feature(topo as never,g as never) as never);const k:Region=c[1]<-60?'Antarctica':c[0]>110&&c[1]<0?'Oceania':c[0]>40?'Asia':c[0]>-25&&c[1]>35?'Europe':c[0]>-25?'Africa':c[1]>12?'North America':'South America';(extras[k]??=[]).push(g)});
 out.forEach(f=>{const extra=extras[f.id];if(extra)f.geometry=merge(topo as never,[...GROUPS[f.id].map(n=>byName[n]).filter(Boolean),...extra] as never)});return out;
}
