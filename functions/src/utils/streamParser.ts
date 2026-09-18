/**
 * Multi-File Stream Parser & Delimiter State Machine
 *
 * Parses incoming token streams delimited by:
 * <<<FILE:filename>>>
 * file content...
 * <<</FILE>>>
 *
 * Handles chunk boundary fragmentation (tokens split across delimiters)
 * and emits structured file events for real-time SSE streaming.
 */

export interface StreamParserCallbacks {
  onFileStart?: (filename: string) => void;
  onFileContent?: (filename: string, content: string) => void;
  onFileEnd?: (filename: string) => void;
  onRawToken?: (token: string) => void;
}

export class MultiFileStreamParser {
  private buffer: string = "";
  private currentFilename: string | null = null;
  private callbacks: StreamParserCallbacks;
  private extractedFiles: Record<string, string> = {};

  constructor(callbacks: StreamParserCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Returns all files extracted so far
   */
  public getFiles(): Record<string, string> {
    return { ...this.extractedFiles };
  }

  /**
   * Ingests a new streaming token/chunk
   */
  public ingest(token: string): void {
    if (!token) return;

    this.callbacks.onRawToken?.(token);
    this.buffer += token;
    this.processBuffer();
  }

  /**
   * Process the accumulated buffer looking for opening and closing tags
   */
  private processBuffer(): void {
    let advanced = true;

    while (advanced) {
      advanced = false;

      if (!this.currentFilename) {
        // We are currently outside a file, look for <<<FILE:filename>>>
        const openMatch = this.buffer.match(/<<<FILE:([a-zA-Z0-9_.-]+)>>>\r?\n?/);
        if (openMatch && openMatch.index !== undefined) {
          const filename = openMatch[1];
          this.currentFilename = filename;
          if (!this.extractedFiles[filename]) {
            this.extractedFiles[filename] = "";
          }

          // Advance buffer past the delimiter
          const cutIdx = openMatch.index + openMatch[0].length;
          this.buffer = this.buffer.slice(cutIdx);

          this.callbacks.onFileStart?.(filename);
          advanced = true;
        } else {
          // If there is a partial delimiter like "<<<FILE:" at the tail, preserve it
          const possibleTailMatch = this.buffer.lastIndexOf("<<<");
          if (possibleTailMatch !== -1 && this.buffer.length - possibleTailMatch < 80) {
            // Keep buffer from possibleTailMatch onward, discard preceding non-file text
            this.buffer = this.buffer.slice(possibleTailMatch);
          } else if (this.buffer.length > 80) {
            // No potential delimiter at tail, trim excess buffer
            this.buffer = this.buffer.slice(-40);
          }
        }
      } else {
        // We are inside a file, look for closing <<</FILE>>> or next <<<FILE:
        const closeMatch = this.buffer.match(/<<<\/FILE>>>\r?\n?/);
        const nextOpenMatch = this.buffer.match(/<<<FILE:([a-zA-Z0-9_.-]+)>>>\r?\n?/);

        if (closeMatch && closeMatch.index !== undefined) {
          // Found closing delimiter
          const fileContentChunk = this.buffer.slice(0, closeMatch.index);
          if (fileContentChunk) {
            this.extractedFiles[this.currentFilename] += fileContentChunk;
            this.callbacks.onFileContent?.(this.currentFilename, fileContentChunk);
          }

          const filename = this.currentFilename;
          this.currentFilename = null;

          // Advance buffer past closing tag
          const cutIdx = closeMatch.index + closeMatch[0].length;
          this.buffer = this.buffer.slice(cutIdx);

          this.callbacks.onFileEnd?.(filename);
          advanced = true;
        } else if (nextOpenMatch && nextOpenMatch.index !== undefined) {
          // LLM started next file without explicitly closing the previous one
          const fileContentChunk = this.buffer.slice(0, nextOpenMatch.index);
          if (fileContentChunk) {
            this.extractedFiles[this.currentFilename] += fileContentChunk;
            this.callbacks.onFileContent?.(this.currentFilename, fileContentChunk);
          }

          const filename = this.currentFilename;
          this.currentFilename = null;
          this.callbacks.onFileEnd?.(filename);

          // Buffer now starts at nextOpenMatch
          this.buffer = this.buffer.slice(nextOpenMatch.index);
          advanced = true;
        } else {
          // No full delimiter found yet. Check if buffer tail might be start of "<<</FILE>>>" or "<<<FILE:"
          const possibleTailMatch = this.buffer.lastIndexOf("<<<");
          if (possibleTailMatch !== -1 && this.buffer.length - possibleTailMatch < 80) {
            // Safe chunk to emit is everything before the potential delimiter
            const safeContent = this.buffer.slice(0, possibleTailMatch);
            if (safeContent.length > 0) {
              this.extractedFiles[this.currentFilename] += safeContent;
              this.callbacks.onFileContent?.(this.currentFilename, safeContent);
              this.buffer = this.buffer.slice(possibleTailMatch);
            }
          } else {
            // Check if buffer ends with a potential start of "<<<" (e.g. "<" or "<<")
            let trailingAngleIdx = -1;
            if (this.buffer.endsWith("<<")) {
              trailingAngleIdx = this.buffer.length - 2;
            } else if (this.buffer.endsWith("<")) {
              trailingAngleIdx = this.buffer.length - 1;
            }

            if (trailingAngleIdx !== -1) {
              const safeContent = this.buffer.slice(0, trailingAngleIdx);
              if (safeContent.length > 0) {
                this.extractedFiles[this.currentFilename] += safeContent;
                this.callbacks.onFileContent?.(this.currentFilename, safeContent);
                this.buffer = this.buffer.slice(trailingAngleIdx);
              }
            } else if (this.buffer.length > 0) {
              this.extractedFiles[this.currentFilename] += this.buffer;
              this.callbacks.onFileContent?.(this.currentFilename, this.buffer);
              this.buffer = "";
            }
          }
        }
      }
    }
  }

  /**
   * Finalizes the stream, flushing any remaining buffer content
   */
  public flush(): Record<string, string> {
    if (this.currentFilename) {
      if (this.buffer.length > 0) {
        // Clean trailing <<</FILE>>> if partially left
        const clean = this.buffer.replace(/<<<\/FILE>>>?$/, "").trimEnd();
        if (clean) {
          this.extractedFiles[this.currentFilename] += clean;
          this.callbacks.onFileContent?.(this.currentFilename, clean);
        }
      }
      this.callbacks.onFileEnd?.(this.currentFilename);
      this.currentFilename = null;
    }
    this.buffer = "";
    return this.getFiles();
  }
}

/**
 * Parses a completed multi-file response string into a file map.
 * Includes fallbacks for standard Markdown code fences if the model failed delimiters.
 */
export function parseCompleteOutput(rawText: string): Record<string, string> {
  const files: Record<string, string> = {};

  // 1. Primary: Match <<<FILE:filename>>> ... <<</FILE>>>
  const delimiterRegex = /<<<FILE:([a-zA-Z0-9_.-]+)>>>\r?\n([\s\S]*?)(?:<<<\/FILE>>>|$)/g;
  let match: RegExpExecArray | null;
  let hasDelimiterMatch = false;

  while ((match = delimiterRegex.exec(rawText)) !== null) {
    hasDelimiterMatch = true;
    const filename = match[1].trim();
    const content = match[2].trim();
    files[filename] = content;
  }

  if (hasDelimiterMatch && Object.keys(files).length > 0) {
    return files;
  }

  // 2. Fallback: Check for Markdown code blocks with file names e.g. ```html file=index.html or ```html
  const htmlMatch = rawText.match(/```(?:html|xml)?\s*\n([\s\S]*?)```/);
  const cssMatch = rawText.match(/```(?:css)\s*\n([\s\S]*?)```/);
  const jsMatch = rawText.match(/```(?:javascript|js)\s*\n([\s\S]*?)```/);

  if (htmlMatch) files["index.html"] = htmlMatch[1].trim();
  if (cssMatch) files["style.css"] = cssMatch[1].trim();
  if (jsMatch) files["app.js"] = jsMatch[1].trim();

  // 3. Fallback: If rawText looks like a single complete HTML page without code fences
  if (Object.keys(files).length === 0 && rawText.includes("<!DOCTYPE html") || rawText.includes("<html")) {
    files["index.html"] = rawText.trim();
    files["style.css"] = "";
    files["app.js"] = "";
  }

  return files;
}
