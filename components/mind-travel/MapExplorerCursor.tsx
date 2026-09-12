'use client';

import React from 'react';
import {attachMapExplorer} from './map-explorer-controller';

/** A pre-rendered 3D illustration, not a live 3D scene or an assistant. */
export function MapExplorerCursor({surfaceRef, reducedMotion}: {
  surfaceRef: React.RefObject<SVGSVGElement | null>;
  reducedMotion: boolean;
}) {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const spriteRef = React.useRef<HTMLImageElement>(null);
  const hotspotRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (!surfaceRef.current || !layerRef.current || !spriteRef.current || !hotspotRef.current) return;
    return attachMapExplorer({surface: surfaceRef.current, layer: layerRef.current,
      sprite: spriteRef.current, hotspot: hotspotRef.current, reducedMotion});
  }, [surfaceRef, reducedMotion]);
  return <div ref={layerRef} className="mt-explorer-cursor" data-testid="map-explorer-cursor" aria-hidden="true">
    <img ref={spriteRef} className="mt-explorer-sprite" src="/images/map-explorer.webp" alt="" draggable={false}/>
    <span ref={hotspotRef} className="mt-explorer-hotspot" data-testid="map-explorer-hotspot"/>
  </div>;
}
