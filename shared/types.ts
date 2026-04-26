// Shared TypeScript types used across client and server.
// Day 1 stub. Filled as the API surface materialises.

export type Bbox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PoiCategory = "vip" | "guest" | "staff" | "banned" | "missing";
