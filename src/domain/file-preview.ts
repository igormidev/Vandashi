export type FilePreview =
  | { kind: 'image' | 'audio' | 'video'; url: string }
  | { kind: 'pdf'; base64: string }
  | { kind: 'text'; text: string }
  | { kind: 'other' };
