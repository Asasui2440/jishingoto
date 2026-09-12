import type { HazardEvent, LatLng } from "./evac-content";
export type GeoCategory = "slope" | "liquefaction" | "shaking";
export type GeoEvidence = {
  featureId: string;
  code: string;
  classification: string;
  regionId: string;
  datasetVersion: string;
  downloadedAt: string;
  sourceName: string;
  sourceUrl: string;
  aiReason: string;
  uncertainties: string[];
};
export type GeoRegion = {
  id: string;
  name: string;
  center: LatLng;
  bounds: number[];
  version: string;
  downloadedAt: string;
  featureCount: number;
};
export type GeoConfig = {
  aiConfigured: boolean;
  regions: GeoRegion[];
  source: { name: string; url: string; licenseUrl: string };
};
export type GeoPoint = {
  id: string;
  t: number;
  position: LatLng;
  heading: number;
  remainingM: number;
  remainingS: number;
  event: HazardEvent;
};
export type GeoAnalysisResult = {
  source: "geo-ai";
  regionIds: string[];
  points: GeoPoint[];
  note: string;
};
