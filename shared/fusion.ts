// Zod schemas for fusion_layers.payload, validated server-side before insert.
// Day 8 will fill the per-layer payload shapes (see plan §0.5 D4).
// Day 1 only defines the layer enum, used by both server and client.

import { z } from "zod";

export const FUSION_LAYERS = ["identity", "web_presence", "geographic", "authenticity"] as const;
export type FusionLayer = (typeof FUSION_LAYERS)[number];

export const fusionLayerSchema = z.enum(FUSION_LAYERS);

export const FUSION_LAYER_STATUS = ["pending", "running", "done", "failed"] as const;
export type FusionLayerStatus = (typeof FUSION_LAYER_STATUS)[number];

export const fusionLayerStatusSchema = z.enum(FUSION_LAYER_STATUS);
