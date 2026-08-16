export interface PixelCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  isValid: boolean;
  error?: string;
}

export interface DiagramCropResult {
  croppedBuffer: Buffer;
  base64Png: string;
  cropRect: PixelCropRect;
  isValid: boolean;
}

export declare function bboxToPixelRect(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
  margin?: number
): PixelCropRect;

export declare function cropDiagramFromPage(params: {
  pagePngBuffer: Buffer | string;
  bbox: [number, number, number, number];
  imageWidth?: number;
  imageHeight?: number;
  windowRef?: any;
}): Promise<DiagramCropResult>;
