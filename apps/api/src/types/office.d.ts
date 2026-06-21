declare module "mammoth" {
  export interface ExtractOptions {
    buffer: Buffer;
  }

  export interface Result {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export function extractRawText(options: ExtractOptions): Promise<Result>;
}

declare module "xlsx" {
  export function read(data: any, opts?: any): Workbook;
  export namespace utils {
    function decode_range(ref: string): Range;
    function encode_cell(cell: CellAddress): string;
    function sheet_to_json(sheet: Worksheet, opts?: any): any[];
  }
  export interface Workbook {
    SheetNames: string[];
    Sheets: { [key: string]: Worksheet };
  }
  export interface Worksheet {
    [cell: string]: Cell | undefined;
    "!ref"?: string;
    "!cols"?: any[];
    "!rows"?: any[];
  }
  export interface Cell {
    type: string;
    v: any;
    w?: string;
    f?: string;
  }
  export interface Range {
    s: { r: number; c: number };
    e: { r: number; c: number };
  }
  export interface CellAddress {
    r: number;
    c: number;
  }
}

declare module "jszip" {
  export default class JSZip {
    constructor();
    loadAsync(data: any): Promise<JSZip>;
    file(name: string): ZipObject | null;
    files: { [key: string]: ZipObject };
    forEach(callback: (relativePath: string, file: ZipObject) => void): void;
  }

  export interface ZipObject {
    name: string;
    dir: boolean;
    date: Date;
    _data: any;
    async(type: string): Promise<any>;
  }
}
