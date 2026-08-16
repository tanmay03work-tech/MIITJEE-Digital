export interface R2UploadResult {
  success: boolean;
  key: string;
  imageUrl: string;
  byteSize: number;
}

export interface R2AccessVerification {
  isAccessible: boolean;
  status: number;
  contentType: string;
  isPngValid: boolean;
  byteSize?: number;
  error?: string;
}

export declare function uploadDiagramToR2(params: {
  setId: string;
  questionNumber: string;
  pageNumber: number;
  croppedBuffer: Buffer | string;
  backendUrl?: string;
}): Promise<R2UploadResult>;

export declare function verifyDiagramAccess(
  imageUrl: string,
  backendUrl?: string
): Promise<R2AccessVerification>;
