"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from "react-leaflet";
import { useTheme } from "next-themes";

export type GeoEntity = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  location: string | null;
  domain: string | null;
  industry: string | null;
};

export type Viewport = { south: number; west: number; north: number; east: number; centerLat: number; centerLng: number };

function ViewportReporter({ onChange }: { onChange: (v: Viewport) => void }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
    load: () => emit(),
  });
  function emit() {
    const b = map.getBounds();
    const c = map.getCenter();
    onChange({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast(), centerLat: c.lat, centerLng: c.lng });
  }
  return null;
}

export default function EntityMap({
  entities,
  onViewport,
}: {
  entities: GeoEntity[];
  onViewport: (v: Viewport) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const tiles = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      worldCopyJump
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "transparent" }}
    >
      <TileLayer url={tiles} attribution='&copy; OpenStreetMap, &copy; CARTO' />
      <ViewportReporter onChange={onViewport} />
      {entities.map((e) => (
        <CircleMarker
          key={e.id}
          center={[e.lat, e.lng]}
          radius={7}
          pathOptions={{ color: "#5AB0E8", fillColor: "#5AB0E8", fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <div className="text-sm font-medium">{e.name}</div>
            {e.location && <div className="text-xs text-neutral-500">{e.location}</div>}
            <a href={`/crm/entity/${e.id}`} className="text-xs text-[#5AB0E8] underline">Open</a>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
