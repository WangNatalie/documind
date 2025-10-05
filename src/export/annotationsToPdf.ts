import {
  PDFDocument,
  rgb,
  PDFName,
  PDFHexString,
} from "pdf-lib";

// Lightweight exporter that flattens notes, comments and drawings into a PDF.
// Accepts normalized rects/points (0..1) or pixel rects (in which case a renderSize must be provided).

export interface PageRenderSize {
  width: number; // pixels used when rendering the page in the viewer
  height: number;
}

export async function mergeAnnotationsIntoPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  opts: {
    notes?: any[]; // NoteRecord[] - expects { page, rects, color, text? }
    drawings?: any[]; // DrawingRecord[] - expects { pageNum, strokes }
    comments?: any[]; // CommentRecord[] - expects { page, rects, text }
    pageRenderSizes: Record<number, PageRenderSize>;
    commentFontSize?: number;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes as Uint8Array);
  const pages = pdfDoc.getPages();
  // No inline text drawing; annotations will be provided as native PDF Text/Highlight/Ink

  const parseCssColor = (css: string) => {
    if (!css) return { r: 0, g: 0, b: 0 };
    css = css.trim();
    if (css.startsWith("#")) {
      const hex = css.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return { r, g, b };
    }
    const m = css.match(/rgb(?:a)?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m)
      return {
        r: Number(m[1]) / 255,
        g: Number(m[2]) / 255,
        b: Number(m[3]) / 255,
      };
    return { r: 0, g: 0, b: 0 };
  };

  const mapRectToPdf = (
    rect: { top: number; left: number; width: number; height: number },
    renderSize: PageRenderSize | undefined,
    pageWidth: number,
    pageHeight: number
  ) => {
    // If rect values look normalized (<= 1), treat them as fractions of page dimensions
    const isNormalized =
      Math.abs(rect.top) <= 1 &&
      Math.abs(rect.left) <= 1 &&
      Math.abs(rect.width) <= 1 &&
      Math.abs(rect.height) <= 1;
    if (isNormalized) {
      const x = rect.left * pageWidth;
      const y = pageHeight - (rect.top + rect.height) * pageHeight;
      return {
        x,
        y,
        width: rect.width * pageWidth,
        height: rect.height * pageHeight,
      };
    }

    // Otherwise assume pixel coords relative to renderSize and scale to PDF points
    if (!renderSize || renderSize.width === 0 || renderSize.height === 0) {
      // fallback: assume pixel coords equal PDF points
      const x = rect.left;
      const y = pageHeight - (rect.top + rect.height);
      return { x, y, width: rect.width, height: rect.height };
    }

    const scaleX = pageWidth / renderSize.width;
    const scaleY = pageHeight / renderSize.height;
    const x = rect.left * scaleX;
    const y = pageHeight - (rect.top + rect.height) * scaleY;
    return { x, y, width: rect.width * scaleX, height: rect.height * scaleY };
  };

  // Draw notes
  if (opts.notes) {
    for (const note of opts.notes) {
      const pageIndex = (note.page || note.pageNum || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[note.page] || opts.pageRenderSizes[note.pageNum];
      for (const r of note.rects || []) {
        const pdfRect = mapRectToPdf(r, renderSize, pageWidth, pageHeight);
        // default to yellow-ish
        const color =
          note.color === "green"
            ? rgb(0.5, 0.85, 0.5)
            : note.color === "blue"
              ? rgb(0.6, 0.8, 1)
              : rgb(1, 1, 0);
        page.drawRectangle({
          x: pdfRect.x,
          y: pdfRect.y,
          width: pdfRect.width,
          height: pdfRect.height,
          color,
          opacity: 0.35,
          borderWidth: 0,
        });
      }
      // Do not draw note text inline on the page. Text will be provided as a
      // native Text (sticky) annotation below so it appears as a hover/tooltip
      // in PDF readers.
    }
  }

  // ------------------------------------------------------------------
  // Native PDF annotations (Text, Highlight, Ink) — create as annotation
  // dictionaries and attach to pages. We also keep the flattened drawings
  // above as a visual fallback for viewers that don't render annots well.
  // ------------------------------------------------------------------

  const registerAnnot = (page: any, dict: any) => {
    const ref = pdfDoc.context.register(dict);
    const annotsKey = PDFName.of("Annots");
    const existing = page.node.get(annotsKey);
    if (!existing) {
      const arr = pdfDoc.context.obj([ref]);
      page.node.set(annotsKey, arr);
    } else {
      try {
        // existing is usually a PDFArray
        (existing as any).push(ref);
      } catch (e) {
        // fallback: replace with new array
        const arr = pdfDoc.context.obj([ref]);
        page.node.set(annotsKey, arr);
      }
    }
  };

  const addTextAnnotation = (
    page: any,
    llx: number,
    lly: number,
    urx: number,
    ury: number,
    contents: string,
    color: { r: number; g: number; b: number }
  ) => {
    const annot = pdfDoc.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Text"),
      Rect: pdfDoc.context.obj([llx, lly, urx, ury]),
      Contents: PDFHexString.fromText(String(contents || "")),
      C: pdfDoc.context.obj([color.r, color.g, color.b]),
      T: PDFHexString.fromText("Documind"),
    });
    registerAnnot(page, annot);
  };

  const addHighlightAnnotation = (
    page: any,
    llx: number,
    lly: number,
    urx: number,
    ury: number,
    quadPoints: number[],
    color: { r: number; g: number; b: number },
    contents?: string
  ) => {
    const annot = pdfDoc.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Highlight"),
      Rect: pdfDoc.context.obj([llx, lly, urx, ury]),
      QuadPoints: pdfDoc.context.obj(quadPoints),
      C: pdfDoc.context.obj([color.r, color.g, color.b]),
      T: PDFHexString.fromText("Documind"),
      Contents: PDFHexString.fromText(String(contents || "")),
    });
    registerAnnot(page, annot);
  };

  const addInkAnnotation = (
    page: any,
    llx: number,
    lly: number,
    urx: number,
    ury: number,
    strokes: number[][],
    color: { r: number; g: number; b: number },
    thickness: number
  ) => {
    // InkList is array of stroke arrays
    const inkList = strokes.map((s) => pdfDoc.context.obj(s));
    const annot = pdfDoc.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Ink"),
      Rect: pdfDoc.context.obj([llx, lly, urx, ury]),
      InkList: pdfDoc.context.obj(inkList),
      C: pdfDoc.context.obj([color.r, color.g, color.b]),
      BS: pdfDoc.context.obj({ W: thickness || 1 }),
      T: PDFHexString.fromText("Documind"),
    });
    registerAnnot(page, annot);
  };

  // Add native annotations for notes (group rects into a single Highlight per note)
  if (opts.notes) {
    for (const note of opts.notes) {
      const pageIndex = (note.page || note.pageNum || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[note.page] || opts.pageRenderSizes[note.pageNum];

      const pdfRects = (note.rects || []).map((r: any) =>
        mapRectToPdf(r, renderSize, pageWidth, pageHeight)
      );

      if (pdfRects.length === 0) continue;

      // Bounding box that covers all rects
      const minX = Math.min(...pdfRects.map((pr: any) => pr.x));
      const minY = Math.min(...pdfRects.map((pr: any) => pr.y));
      const maxX = Math.max(...pdfRects.map((pr: any) => pr.x + pr.width));
      const maxY = Math.max(...pdfRects.map((pr: any) => pr.y + pr.height));

      // Build QuadPoints array with one quad per rect (top-left, top-right, bottom-left, bottom-right)
      const quadPointsArr: number[] = [];
      for (const pr of pdfRects) {
        const x1 = pr.x;
        const y1 = pr.y + pr.height; // top
        const x2 = pr.x + pr.width;
        const y2 = pr.y; // bottom
        quadPointsArr.push(x1, y1, x2, y1, x1, y2, x2, y2);
      }

      const color = note.color === "green" ? { r: 0.5, g: 0.85, b: 0.5 } : note.color === "blue" ? { r: 0.6, g: 0.8, b: 1 } : { r: 1, g: 1, b: 0 };

      // Create a single Highlight annotation for the grouped rects.
      addHighlightAnnotation(page, minX, minY, maxX, maxY, quadPointsArr, color, undefined);
      // Add one sticky Text annotation for the note contents (so it shows on hover)
      if (note.text) {
        // Place the sticky note slightly above the top-left of the bounding box
        addTextAnnotation(page, minX, maxY + 4, minX + 16, maxY + 20, note.text, { r: 0, g: 0, b: 0 });
      }
    }
  }

  // Native annotations for comments: add Text annotation and a small highlight marker
  if (opts.comments) {
    for (const c of opts.comments) {
      const pageIndex = (c.page || c.pageNum || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[c.page] || opts.pageRenderSizes[c.pageNum];
      const first = (c.rects || [])[0];
      if (!first) continue;
      const pdfRect = mapRectToPdf(first, renderSize, pageWidth, pageHeight);
      const llx = pdfRect.x;
      const lly = pdfRect.y;
      const urx = pdfRect.x + pdfRect.width;
      const ury = pdfRect.y + pdfRect.height;

      // Add a Text (sticky) annotation with comment contents
      addTextAnnotation(page, llx, lly, urx, ury + 12, c.text || "", { r: 1, g: 0.85, b: 0 });
    }
  }

  // Native annotations for drawings (Ink)
  if (opts.drawings) {
    for (const d of opts.drawings) {
      const pageIndex = (d.pageNum || d.page || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[d.pageNum] || opts.pageRenderSizes[d.page];

      for (const stroke of d.strokes || []) {
        if (!stroke.points || stroke.points.length === 0) continue;

        // Determine stroke bounding box for the annotation rect
        const pts = stroke.points.map((p: any) => {
          const isNormalized = p.x <= 1 && p.y <= 1;
          const x = isNormalized ? p.x * pageWidth : (renderSize && renderSize.width ? p.x * (pageWidth / renderSize.width) : p.x);
          const y = isNormalized ? pageHeight - p.y * pageHeight : (renderSize && renderSize.height ? pageHeight - p.y * (pageHeight / renderSize.height) : pageHeight - p.y);
          return { x, y };
        });

        const xs = pts.map((p: any) => p.x);
        const ys = pts.map((p: any) => p.y);
        const llx = Math.min(...xs);
        const urx = Math.max(...xs);
        const lly = Math.min(...ys);
        const ury = Math.max(...ys);

        // Build InkList stroke (each stroke is array of numbers [x1 y1 x2 y2 ...])
        const strokeCoords = pts.map((p: any) => [p.x, p.y]).flat();
        const color = parseCssColor(stroke.color || "#000000");
        addInkAnnotation(page, llx, lly, urx, ury, [strokeCoords], { r: color.r, g: color.g, b: color.b }, stroke.width || 1);
      }
    }
  }

  // Draw comments
  if (opts.comments) {
    for (const c of opts.comments) {
      const pageIndex = (c.page || c.pageNum || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[c.page] || opts.pageRenderSizes[c.pageNum];
      const first = (c.rects || [])[0];
      if (!first) continue;
      const pdfRect = mapRectToPdf(first, renderSize, pageWidth, pageHeight);
      // small marker square
      const markerSize = Math.min(12, pdfRect.width, pdfRect.height);
      page.drawRectangle({
        x: pdfRect.x,
        y: pdfRect.y + pdfRect.height - markerSize,
        width: markerSize,
        height: markerSize,
        color: rgb(0.2, 0.5, 1),
      });
      // NOTE: do not write comment text directly into the page. Comment
      // contents are added as native Text annotations above so they appear
      // as hoverable/expandable popups in PDF viewers.
    }
  }

  // Draw drawings (ink strokes). Strokes points are expected to be normalized (0..1) or pixel coords.
  if (opts.drawings) {
    for (const d of opts.drawings) {
      const pageIndex = (d.pageNum || d.page || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[d.pageNum] || opts.pageRenderSizes[d.page];

      for (const stroke of d.strokes || []) {
        const color = parseCssColor(stroke.color || "#000000");
        const drawColor = rgb(color.r, color.g, color.b);
        // If points look normalized (x<=1), treat them as normalized
        if (stroke.points && stroke.points.length > 0) {
          const isNormalized =
            stroke.points[0].x <= 1 && stroke.points[0].y <= 1;
          if (isNormalized) {
            for (let i = 0; i < stroke.points.length - 1; i++) {
              const p1 = stroke.points[i];
              const p2 = stroke.points[i + 1];
              page.drawLine({
                start: {
                  x: p1.x * pageWidth,
                  y: pageHeight - p1.y * pageHeight,
                },
                end: { x: p2.x * pageWidth, y: pageHeight - p2.y * pageHeight },
                thickness: stroke.width || 1,
                color: drawColor,
                opacity: 1,
              });
            }
          } else if (renderSize && renderSize.width > 0) {
            const scaleX = pageWidth / renderSize.width;
            const scaleY = pageHeight / renderSize.height;
            for (let i = 0; i < stroke.points.length - 1; i++) {
              const p1 = stroke.points[i];
              const p2 = stroke.points[i + 1];
              page.drawLine({
                start: { x: p1.x * scaleX, y: pageHeight - p1.y * scaleY },
                end: { x: p2.x * scaleX, y: pageHeight - p2.y * scaleY },
                thickness: stroke.width || 1,
                color: drawColor,
                opacity: 1,
              });
            }
          }
        }
      }
    }
  }

  return pdfDoc.save();
}
