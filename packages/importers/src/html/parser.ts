import type {
  ParsedHTMLDocument,
  HTMLHeading,
  HTMLLink,
  HTMLImage,
} from "../types.js";

// Regex-based server-side HTML parser (no DOM dependency)

const TAG_RE = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)\s*\/?>/gi;
const CLOSING_TAG_RE = /<\/([a-zA-Z][a-zA-Z0-9]*)>/gi;
const ATTR_RE = /([a-zA-Z][a-zA-Z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const ENTITY_RE = /&(amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([0-9a-fA-F]+));/g;

// HTML entities decode map
const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export class HTMLParser {
  // Parse HTML string into structured document
  parse(html: string, source?: string): ParsedHTMLDocument {
    const clean = this.preprocess(html);

    const title = this.extractTitle(clean);
    const metaTags = this.extractMetaTags(clean);
    const headings = this.extractHeadings(clean);
    const links = this.extractLinks(clean, source);
    const images = this.extractImages(clean);
    const textContent = this.extractTextContent(clean);

    return { title, metaTags, headings, links, images, textContent, source };
  }

  // Remove scripts, styles, comments; normalize whitespace
  private preprocess(html: string): string {
    return html
      .replace(SCRIPT_STYLE_RE, "")
      .replace(COMMENT_RE, "")
      .trim();
  }

  // Extract <title> tag content
  extractTitle(html: string): string {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m?.[1]) return this.decodeEntities(this.stripTags(m[1])).trim();

    // Fall back to first H1
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1?.[1]) return this.decodeEntities(this.stripTags(h1[1])).trim();

    // og:title meta
    const ogTitle = /property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)
      ?? /content=["']([^"']+)["'][^>]*property=["']og:title["']/i.exec(html);
    if (ogTitle?.[1]) return this.decodeEntities(ogTitle[1]).trim();

    return "Untitled";
  }

  // Extract all <meta> tags as key-value pairs
  extractMetaTags(html: string): Record<string, string> {
    const meta: Record<string, string> = {};
    const metaRe = /<meta\s([^>]+)>/gi;
    let m: RegExpExecArray | null;

    while ((m = metaRe.exec(html)) !== null) {
      const attrs = this.parseAttributes(m[1] ?? "");
      const name = attrs["name"] ?? attrs["property"] ?? attrs["http-equiv"];
      const content = attrs["content"];
      if (name && content !== undefined) {
        meta[name.toLowerCase()] = this.decodeEntities(content);
      }
    }

    return meta;
  }

  // Extract headings H1-H6 in document order
  extractHeadings(html: string): HTMLHeading[] {
    const headings: HTMLHeading[] = [];
    const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;

    while ((m = headingRe.exec(html)) !== null) {
      const level = parseInt(m[1] ?? "1", 10);
      const text = this.decodeEntities(this.stripTags(m[2] ?? "")).trim();
      if (text) headings.push({ level, text });
    }

    return headings;
  }

  // Extract all <a href="..."> links
  extractLinks(html: string, source?: string): HTMLLink[] {
    const links: HTMLLink[] = [];
    const linkRe = /<a\s([^>]*)>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(html)) !== null) {
      const attrs = this.parseAttributes(m[1] ?? "");
      const href = attrs["href"];
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;

      const text = this.decodeEntities(this.stripTags(m[2] ?? "")).trim();
      const isExternal = /^https?:\/\//i.test(href);

      // Skip mailto and tel links for graph purposes
      if (href.startsWith("mailto:") || href.startsWith("tel:")) continue;

      links.push({
        href: this.resolveUrl(href, source),
        text: text || href,
        isExternal,
      });
    }

    return links;
  }

  // Extract <img> tags as image resources
  extractImages(html: string): HTMLImage[] {
    const images: HTMLImage[] = [];
    const imgRe = /<img\s([^>]*)>/gi;
    let m: RegExpExecArray | null;

    while ((m = imgRe.exec(html)) !== null) {
      const attrs = this.parseAttributes(m[1] ?? "");
      const src = attrs["src"];
      if (!src) continue;

      images.push({
        src,
        alt: attrs["alt"] ?? undefined,
        title: attrs["title"] ?? undefined,
      });
    }

    return images;
  }

  // Extract human-readable text content stripping all HTML tags
  extractTextContent(html: string): string {
    // Replace block elements with newlines for readability
    const withNewlines = html
      .replace(/<\/(p|div|li|blockquote|tr|h[1-6])[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<hr\s*\/?>/gi, "\n---\n");

    const stripped = this.stripTags(withNewlines);
    return this.decodeEntities(stripped)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  // Extract Open Graph metadata
  extractOpenGraph(html: string): Record<string, string> {
    const meta = this.extractMetaTags(html);
    const og: Record<string, string> = {};

    for (const [key, value] of Object.entries(meta)) {
      if (key.startsWith("og:")) {
        og[key.slice(3)] = value;
      }
    }

    return og;
  }

  // Extract structured data (JSON-LD blocks)
  extractJsonLd(html: string): unknown[] {
    const blocks: unknown[] = [];
    const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;

    while ((m = jsonLdRe.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1] ?? "");
        blocks.push(parsed);
      } catch {
        // Skip malformed JSON-LD
      }
    }

    return blocks;
  }

  // Parse HTML attribute string into key-value map
  parseAttributes(attrString: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    ATTR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = ATTR_RE.exec(attrString)) !== null) {
      const name = (m[1] ?? "").toLowerCase();
      // m[2] = double-quoted, m[3] = single-quoted, m[4] = unquoted
      const value = m[2] ?? m[3] ?? m[4] ?? "";
      if (name) attrs[name] = value;
    }

    return attrs;
  }

  // Strip all HTML tags from string
  stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, "");
  }

  // Decode HTML entities
  decodeEntities(text: string): string {
    return text.replace(ENTITY_RE, (_, entity: string, dec?: string, hex?: string) => {
      if (dec !== undefined) return String.fromCharCode(parseInt(dec, 10));
      if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
      return HTML_ENTITIES[entity] ?? _;
    });
  }

  // Resolve relative URLs against a base URL
  private resolveUrl(href: string, base?: string): string {
    if (!base || /^https?:\/\//i.test(href)) return href;

    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }

  // Extract canonical URL from link tags or meta
  extractCanonicalUrl(html: string): string | null {
    const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)
      ?? /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i.exec(html);
    return canonical?.[1] ?? null;
  }

  // Extract language from <html lang="...">
  extractLanguage(html: string): string | null {
    const m = /<html[^>]+lang=["']([^"']+)["']/i.exec(html);
    return m?.[1] ?? null;
  }

  // Extract main content area (heuristic: largest text block)
  extractMainContent(html: string): string {
    // Try known main content selectors
    const selectors = [
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+(?:id|class)=["'][^"']*(?:content|main|body|post)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const re of selectors) {
      const m = re.exec(html);
      if (m?.[1]) {
        const text = this.extractTextContent(m[1]);
        if (text.length > 100) return text;
      }
    }

    return this.extractTextContent(html);
  }

  // DOM traversal simulation: extract tag tree depth-first
  traverseTags(
    html: string,
    visitor: (tag: string, attrs: Record<string, string>, depth: number) => void,
  ): void {
    const stack: string[] = [];

    TAG_RE.lastIndex = 0;
    CLOSING_TAG_RE.lastIndex = 0;

    // Interleave open/close tags by position
    const events: Array<{ pos: number; type: "open" | "close"; tag: string; attrs: Record<string, string> }> = [];

    let m: RegExpExecArray | null;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(html)) !== null) {
      events.push({
        pos: m.index,
        type: "open",
        tag: (m[1] ?? "").toLowerCase(),
        attrs: this.parseAttributes(m[2] ?? ""),
      });
    }

    CLOSING_TAG_RE.lastIndex = 0;
    while ((m = CLOSING_TAG_RE.exec(html)) !== null) {
      events.push({
        pos: m.index,
        type: "close",
        tag: (m[1] ?? "").toLowerCase(),
        attrs: {},
      });
    }

    events.sort((a, b) => a.pos - b.pos);

    for (const event of events) {
      if (event.type === "open") {
        visitor(event.tag, event.attrs, stack.length);
        // Self-closing tags don't push to stack
        const selfClosing = new Set(["img", "br", "hr", "input", "meta", "link", "area", "base"]);
        if (!selfClosing.has(event.tag)) {
          stack.push(event.tag);
        }
      } else {
        const idx = stack.lastIndexOf(event.tag);
        if (idx !== -1) stack.splice(idx, 1);
      }
    }
  }
}
