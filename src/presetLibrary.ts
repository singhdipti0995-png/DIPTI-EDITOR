import { PhotoAdjustments } from './editor';

export type PresetCategory =
  | 'Cinematic'
  | 'Portrait'
  | 'Nature'
  | 'Vintage'
  | 'Moody'
  | 'Black & White'
  | 'Gold'
  | 'Purple'
  | 'Travel'
  | 'Social Media';

export interface LibraryPresetItem {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  accentColor: string;
  adjustments: Partial<PhotoAdjustments>;
  isBuiltIn: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PresetLibraryMetaRecord {
  id: '__library_meta__';
  favorites: string[];
  renamed: Record<string, string>;
  deletedBuiltins: string[];
}

export interface CompatibleVideoColorGrade {
  filterId: string;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  vignette: number;
  grain: number;
}
