export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextElement {
  text: string;
  frame: Rect;
  recognizedLanguages: string[];
}

export interface TextLine {
  text: string;
  frame: Rect;
  recognizedLanguages: string[];
  elements: TextElement[];
}

export interface TextBlock {
  text: string;
  frame: Rect;
  recognizedLanguages: string[];
  lines: TextLine[];
}

export interface OcrText {
  text: string;
  blocks: TextBlock[];
}

export type ContactSuggestions = Partial<{
  contactFirstName: string;
  contactLastName: string;
  contactCompany: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  contactMobile: string;
  contactWebsite: string;
  contactStreet: string;
  contactZip: string;
  contactCity: string;
  contactCountry: string;
}>;

export type RecognizeTextInput = {
  imagePath: string;
};

export type RecognizeTextResult = {
  rawText: string;
  blocks: TextBlock[];
};

export type ParseBusinessCardInput = {
  rawText: string;
  blocks?: unknown;
};

export type ParseBusinessCardResult = {
  suggestions: ContactSuggestions;
  debug?: {
    lines: string[];
    picked?: Record<string, string>;
  };
};
