/* map.js */
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiajBobndlc2wzeSIsImEiOiJjbWFxam40ZngwMG9xMmxva285bnpsMHRiIn0.y8BwmCYZIsdWPJwbvor0LA';

/* helpers & state */
let timeFilter = -1;
let baseStations = [];
let trips = [];
let circles;
let radiusScale;

const tooltip = d3.select('#tooltip');
const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
const fmtTime = (m) =>
  new Date(0, 0, 0, 0, m).toLocaleString('en-US', { timeStyle: 'short' });
const mins = (d) => d.getHours() * 60 + d.getMinutes();

function computeTraffic(stations, t) {
  const out = d3.rollup(t, v => v.length, d => d.start_station_id);
  const inn = d3.rollup(t, v => v.length, d => d.end_station_id);
  return stations.map((s) => {
    const id = s.short_name;
    s.departures   = out.get(id) ?? 0;
    s.arrivals     = inn.get(id) ?? 0;
    s.totalTraffic = s.departures + s.arrivals;
    return s;
  });
}
const filterTrips = (trs, tf) =>
  tf === -1 ? trs :
  trs.filter((d)=>Math.abs(mins(d.started_at)-tf)<=60||
                  Math.abs(mins(d.ended_at)-tf)<=60);

/* map */
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0936, 42.3592],
  zoom: 12
});
const px = (s) => map.project([+s.lon, +s.lat]);

map.on('load', async () => {
  const [stJson, tripCsv] = await Promise.all([
    d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json'),
    d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (d)=>({...d,started_at:new Date(d.started_at),ended_at:new Date(d.ended_at)})
    )
  ]);
  baseStations = stJson.data.stations;
  trips = tripCsv;

  const initialStations = computeTraffic(baseStations.map(d=>({...d})),trips);
  radiusScale = d3.scaleSqrt()
    .domain([0,d3.max(initialStations,d=>d.totalTraffic)])
    .range([0,25]);

  map.addSource('boston',{type:'geojson',data:'Existing_Bike_Network_2022.geojson'});
  map.addLayer({id:'boston',type:'line',source:'boston',
                paint:{'line-color':'#32D400','line-width':5,'line-opacity':0.6}});
  map.addSource('camb',{type:'geojson',data:'cambridge-bike-lanes.geojson'});
  map.addLayer({id:'camb',type:'line',source:'camb',
                paint:{'line-color':'#0066CC','line-width':4,'line-opacity':0.6}});
  map.addControl(new mapboxgl.NavigationControl(),'top-right');

  const svg=d3.select('#map').select('svg');

  function redraw(data){
    circles = svg.selectAll('circle')
      .data(data,d=>d.short_name)
      .join(
        enter=>enter.append('circle')
                    .attr('stroke','white').attr('stroke-width',1)
                    .attr('opacity',0.85).attr('pointer-events','auto')
                    .on('mouseenter',(e,d)=>
                      tooltip.style('display','block')
                             .html(`<strong>${d.totalTraffic} trips</strong><br/>
                                    ${d.departures} departures<br/>
                                    ${d.arrivals} arrivals`))
                    .on('mousemove',(e)=>
                      tooltip.style('left',`${e.pageX+12}px`)
                             .style('top',`${e.pageY+12}px`))
                    .on('mouseleave',()=>tooltip.style('display','none')),
        update=>update
      )
      .attr('r',d=>radiusScale(d.totalTraffic))
      .attr('cx',d=>px(d).x)
      .attr('cy',d=>px(d).y)
      .style('--departure-ratio',d=>
        stationFlow(d.totalTraffic?d.departures/d.totalTraffic:0));
  }
  redraw(initialStations);
  map.on('move zoom resize moveend',()=>
    circles.attr('cx',d=>px(d).x).attr('cy',d=>px(d).y));

  const slider=document.getElementById('time-slider');
  const timeEl=document.getElementById('selected-time');
  const anyEl=document.getElementById('any-time');
  function update(){
    timeFilter=+slider.value;
    if(timeFilter===-1){
      anyEl.style.display='block';timeEl.textContent='';
      radiusScale.range([0,25]);
    }else{
      anyEl.style.display='none';timeEl.textContent=fmtTime(timeFilter);
      radiusScale.range([3,50]);
    }
    redraw(
      computeTraffic(baseStations.map(d=>({...d})),
                     filterTrips(trips,timeFilter))
    );
  }
  slider.addEventListener('input',update);
  update();
});
