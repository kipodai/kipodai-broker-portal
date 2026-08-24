import React, { useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import statesTopology from 'us-atlas/states-10m.json';
import { fmtMoney, fmtChg, deltaClass } from '../lib/format.js';

const STATE_ABBREVIATIONS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

const STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

const US_STATES = feature(statesTopology, statesTopology.objects.states).features;
const mapProjection = geoAlbersUsa().fitSize([960, 580], { type: 'FeatureCollection', features: US_STATES });
const mapPath = geoPath(mapProjection);

function stateCode(value) {
  const normalized = String(value || '').trim();
  return STATE_NAMES[normalized.toLowerCase()] || normalized.toUpperCase();
}

function mapFill(value, maxValue) {
  if (value === null || value === undefined || !maxValue) return '#a3adb3';
  const intensity = Math.max(0.2, Math.pow(value / maxValue, 0.55));
  return `hsl(197 86% ${81 - intensity * 42}%)`;
}

export default function GeographyPanel({ geography }) {
  const { top5States = [], fastestGrowing3, decliners3, statePerformance = [] } = geography;
  const [hoveredState, setHoveredState] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const hasStateMapData = statePerformance.length > 0;
  const stateData = useMemo(() => new Map(statePerformance.map((state) => [stateCode(state.State), state])), [statePerformance]);
  const maxSales = useMemo(() => Math.max(...statePerformance.map((state) => state['POS $'] || 0), 0), [statePerformance]);
  const activeState = hoveredState || selectedState;
  const activeData = activeState ? stateData.get(activeState) : null;
  const featuredState = activeData || (!activeState ? top5States[0] : null);
  const featuredCode = featuredState ? stateCode(featuredState.State) : null;

  return (
    <div className="geography-panel">
      <h3>Geography</h3>
      <div className="geography-grid">
        <div className="geography-chart">
          <p className="panel-subtitle">{hasStateMapData ? 'Sales footprint by state' : 'Sales footprint by state — available in newly published reports'}</p>
          <div className="us-map-wrap">
            <div className="geo-map-stage">
              <div className="geo-map-stage-header">
                <span>Retail footprint</span>
                <span>{hasStateMapData ? `${statePerformance.length} markets reported` : 'Historical report'}</span>
              </div>
              {featuredState && (
                <div className="geo-map-callout">
                  <span>{selectedState === featuredCode ? 'Selected market' : activeState ? 'Market spotlight' : 'Leading market'}</span>
                  <strong>{featuredCode} · {fmtMoney(featuredState['POS $'])}</strong>
                  {featuredState['POS $ %Chg vs LY'] !== null && featuredState['POS $ %Chg vs LY'] !== undefined && <small className={deltaClass(featuredState['POS $ %Chg vs LY'])}>{fmtChg(featuredState['POS $ %Chg vs LY'])} vs LY</small>}
                </div>
              )}
              <svg className="us-map" viewBox="0 0 960 580" role="group" aria-labelledby="us-map-title us-map-description">
                <title id="us-map-title">United States sales map</title>
                <desc id="us-map-description">States are shaded by point-of-sale sales. Deeper blue indicates greater sales. Select a state to reveal its performance.</desc>
                {US_STATES.map((state) => {
                  const code = STATE_ABBREVIATIONS[String(state.id).padStart(2, '0')];
                  const data = stateData.get(code);
                  return (
                    <path
                      key={state.id}
                      d={mapPath(state) || undefined}
                      className={`us-map-state${activeState === code ? ' is-active' : ''}`}
                      fill={mapFill(data?.['POS $'], maxSales)}
                      onMouseEnter={() => hasStateMapData && setHoveredState(code)}
                      onMouseLeave={() => hasStateMapData && setHoveredState(null)}
                      onFocus={() => hasStateMapData && setHoveredState(code)}
                      onBlur={() => hasStateMapData && setHoveredState(null)}
                      onClick={() => hasStateMapData && setSelectedState((current) => current === code ? null : code)}
                      onKeyDown={(event) => {
                        if (hasStateMapData && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          setSelectedState((current) => current === code ? null : code);
                        }
                      }}
                      tabIndex={hasStateMapData ? 0 : -1}
                      role={hasStateMapData ? 'button' : undefined}
                      aria-pressed={hasStateMapData ? selectedState === code : undefined}
                      aria-label={`${code}: ${data?.['POS $'] !== null && data?.['POS $'] !== undefined ? fmtMoney(data['POS $']) : 'No sales data'}`}
                    />
                  );
                })}
              </svg>
            </div>
            <div className="us-map-legend" aria-hidden="true"><span className="us-map-no-data-swatch" /><span>No data</span><span>Lower sales</span><i /><i /><i /><span>Higher sales</span></div>
            <p className="us-map-detail" aria-live="polite">
              {!hasStateMapData
                ? 'This saved report predates the full state-level map. Publish a new report to populate it.'
                : activeState
                  ? (activeData ? <><strong>{activeState}</strong> {fmtMoney(activeData['POS $'])} {activeData['POS $ %Chg vs LY'] !== null && <span className={deltaClass(activeData['POS $ %Chg vs LY'])}>({fmtChg(activeData['POS $ %Chg vs LY'])} vs LY)</span>}</> : <><strong>{activeState}</strong> No sales data</>)
                  : 'Hover or focus a state to explore.'}
            </p>
          </div>
        </div>
        <div className="geography-lists">
          <div className="geo-trend-card geo-growth-card">
            <p className="panel-subtitle">Fastest growing</p>
            <ul className="geo-list">
              {fastestGrowing3.length === 0 && <li className="geo-list-empty">Not enough data.</li>}
              {fastestGrowing3.map((s) => (
                <li key={s.State}>
                  <span>{s.State}</span>
                  <span className={deltaClass(s['POS $ %Chg vs LY'])}>{fmtChg(s['POS $ %Chg vs LY'])}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="geo-trend-card geo-decline-card">
            <p className="panel-subtitle">Declining</p>
            <ul className="geo-list">
              {decliners3.length === 0 && <li className="geo-list-empty">Not enough data.</li>}
              {decliners3.map((s) => (
                <li key={s.State}>
                  <span>{s.State}</span>
                  <span className={deltaClass(s['POS $ %Chg vs LY'])}>{fmtChg(s['POS $ %Chg vs LY'])}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
