// Minimal ambient typings for the server-side `pdfmake` API (class `PdfPrinter`, from "pdfmake/src/printer.js").
// The published `@types/pdfmake` package targets the browser-only `createPdf` API and has no
// `PdfPrinter`/`svg` node typings, so we declare only the subset this codebase actually uses.
declare module "pdfmake" {
  import type { Readable } from "node:stream";

  export interface PdfFontDescriptor {
    normal: string;
    bold?: string;
    italics?: string;
    bolditalics?: string;
  }

  export type PdfFontDictionary = Record<string, PdfFontDescriptor>;

  export interface PdfTextNode {
    text: string | PdfContentNode[];
    style?: string | string[];
    bold?: boolean;
    italics?: boolean;
    fontSize?: number;
    color?: string;
    alignment?: "left" | "right" | "center" | "justify";
    margin?: number | number[];
    pageBreak?: "before" | "after";
    width?: number | string;
    lineHeight?: number;
  }

  export interface PdfTableCellNode extends PdfTextNode {
    colSpan?: number;
    fillColor?: string;
  }

  export interface PdfTableNode {
    table: {
      headerRows?: number;
      widths?: Array<number | string>;
      body: PdfContentNode[][];
    };
    layout?: string | Record<string, unknown>;
    margin?: number | number[];
  }

  export interface PdfSvgNode {
    svg: string;
    width?: number;
    height?: number;
    margin?: number | number[];
  }

  export interface PdfColumnsNode {
    columns: PdfContentNode[];
    columnGap?: number;
    margin?: number | number[];
  }

  export interface PdfStackNode {
    stack: PdfContentNode[];
    margin?: number | number[];
  }

  export type PdfContentNode =
    | string
    | PdfTextNode
    | PdfTableCellNode
    | PdfTableNode
    | PdfSvgNode
    | PdfColumnsNode
    | PdfStackNode
    | PdfContentNode[];

  export interface PdfDocumentDefinition {
    content: PdfContentNode[];
    defaultStyle?: Record<string, unknown>;
    styles?: Record<string, Record<string, unknown>>;
    pageSize?: string;
    pageMargins?: number | [number, number] | [number, number, number, number];
    info?: {
      title?: string;
      author?: string;
      subject?: string;
    };
  }

  export interface PdfKitDocument extends Readable {
    end(): void;
  }

  export default class PdfPrinter {
    constructor(fonts: PdfFontDictionary);
    createPdfKitDocument(
      docDefinition: PdfDocumentDefinition,
      options?: Record<string, unknown>,
    ): PdfKitDocument;
  }
}
