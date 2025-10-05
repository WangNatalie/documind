import { PDFDocument, rgb, PDFName, PDFHexString } from "pdf-lib";

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
  // Ensure exported PDF lists our application/producer as "DocuMind".
  // Try high-level setters if available, then fall back to setting the Info dictionary.
  try {
    try {
      // Some pdf-lib builds expose helpers like setProducer/setCreator
      const anyDoc: any = pdfDoc as any;
      if (typeof anyDoc.setProducer === "function")
        anyDoc.setProducer(
          "DocuMind (https://documind.study)"
        );
      if (typeof anyDoc.setCreator === "function")
        anyDoc.setCreator("DocuMind (https://documind.study)");
    } catch (e) {
      // ignore
    }

    // Low-level fallback: attach Info dictionary with Producer and Creator keys.
    const infoDict = pdfDoc.context.obj({
      Producer: PDFHexString.fromText("DocuMind"),
      Creator: PDFHexString.fromText("DocuMind"),
    });
    const infoRef = pdfDoc.context.register(infoDict);
    try {
      // Try setting Info on the document catalog (works with many pdf-lib versions)
      try {
        (pdfDoc as any).catalog.set(PDFName.of("Info"), infoRef);
      } catch (e) {
        // as a last resort, try attaching to context.trailer if it exists
        try {
          (pdfDoc.context as any).trailer?.set?.(PDFName.of("Info"), infoRef);
        } catch (e2) {
          // give up silently
        }
      }
    } catch (e) {
      // ignore
    }
  } catch (err) {
    // Non-fatal — continue if metadata can't be written
    // eslint-disable-next-line no-console
    console.warn("Failed to set PDF producer/creator metadata", err);
  }
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

  // Rectangle helpers were previously used for merge-based merging.
  // The exporter now uses a page-wide partition approach to guarantee
  // non-overlapping highlight rectangles, so those helpers are not needed.

  // Annotation helpers (defined early so they can be used by partitioning code below)
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
      T: PDFHexString.fromText("DocuMind"),
    });
    registerAnnot(page, annot);
  };

  // Compute a rectangle for a text popup anchored at (anchorX, anchorY).
  // Tries to size width/height based on simple word-wrap using font size.
  const computeTextRect = (
    text: string,
    anchorX: number,
    anchorY: number,
    page: any,
    fontSize?: number
  ) => {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const fs = fontSize || opts.commentFontSize || 12;
    const avgCharWidth = fs * 0.5; // approximation in points
    // prefer popup no wider than half page or 300pt, but leave room to the right
    let maxWidth = Math.min(pageWidth - anchorX - 8, pageWidth * 0.5, 300);
    if (maxWidth < 40) maxWidth = Math.min(pageWidth - 8, 120);

    // word wrap
    const words = (text || "").split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      if (trial.length * avgCharWidth <= maxWidth) {
        cur = trial;
      } else {
        if (cur) lines.push(cur);
        // if single word too long, break it
        if (w.length * avgCharWidth > maxWidth) {
          // split word into chunks
          let start = 0;
          const charsPerLine = Math.max(4, Math.floor(maxWidth / avgCharWidth));
          while (start < w.length) {
            lines.push(w.slice(start, start + charsPerLine));
            start += charsPerLine;
          }
          cur = "";
        } else {
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);

    const textWidth =
      Math.max(1, ...lines.map((l) => l.length)) * avgCharWidth + 8;
    const lineHeight = fs * 1.2;
    const textHeight = lines.length * lineHeight + 6;

    let llx = anchorX;
    let lly = anchorY;
    let urx = llx + textWidth;
    let ury = lly + textHeight;

    // Keep within page horizontally
    if (urx > pageWidth - 5) {
      urx = pageWidth - 5;
      llx = Math.max(5, urx - textWidth);
    }
    // Keep within page vertically; if it would overflow top, shift down
    if (ury > pageHeight - 5) {
      const overshoot = ury - (pageHeight - 5);
      lly = Math.max(5, lly - overshoot);
      ury = lly + textHeight;
    }

    return { llx, lly, urx, ury };
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
      T: PDFHexString.fromText("DocuMind"),
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
      T: PDFHexString.fromText("DocuMind"),
    });
    registerAnnot(page, annot);
  };

  // Draw notes (flattened visual highlights) and prepare non-overlapping
  // highlight rectangles using a page-wide partition. This guarantees there
  // are no overlapping rectangles across notes.
  if (opts.notes) {
    // Group all pdf rects per page first
    const pagesNoteRects: Map<
      number,
      Array<{
        noteIndex: number;
        noteId?: string;
        x: number;
        y: number;
        width: number;
        height: number;
        color: { r: number; g: number; b: number };
      }>
    > = new Map();

    (opts.notes || []).forEach((note: any, noteIndex: number) => {
      const pageIndex = (note.page || note.pageNum || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) return;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const renderSize =
        opts.pageRenderSizes[note.page] || opts.pageRenderSizes[note.pageNum];

      const pdfRects = (note.rects || []).map((r: any) =>
        mapRectToPdf(r, renderSize, pageWidth, pageHeight)
      );

      const color =
        note.color === "green"
          ? { r: 0.5, g: 0.85, b: 0.5 }
          : note.color === "blue"
            ? { r: 0.6, g: 0.8, b: 1 }
            : { r: 1, g: 1, b: 0 };

      const arr = pagesNoteRects.get(pageIndex) || [];
      for (const pr of pdfRects) {
        arr.push({
          noteIndex,
          noteId: note.id,
          x: pr.x,
          y: pr.y,
          width: pr.width,
          height: pr.height,
          color,
        });
      }
      pagesNoteRects.set(pageIndex, arr);
    });

    // For each page, partition into non-overlapping rectangles using unique edges
    for (const [pageIndex, rects] of pagesNoteRects.entries()) {
      if (!rects || rects.length === 0) continue;
      const page = pages[pageIndex];

      // Collect unique x and y edges
      const xsSet = new Set<number>();
      const ysSet = new Set<number>();
      rects.forEach((r) => {
        xsSet.add(r.x);
        xsSet.add(r.x + r.width);
        ysSet.add(r.y);
        ysSet.add(r.y + r.height);
      });

      const xs = Array.from(xsSet).sort((a, b) => a - b);
      const ys = Array.from(ysSet).sort((a, b) => a - b);

      // Helper to find which rect(s) fully cover a given cell
      const cellAssignedNote = (i: number, j: number): number | null => {
        const x0 = xs[i];
        const x1 = xs[i + 1];
        const y0 = ys[j];
        const y1 = ys[j + 1];
        for (const r of rects) {
          if (
            r.x <= x0 + 1e-6 &&
            r.x + r.width >= x1 - 1e-6 &&
            r.y <= y0 + 1e-6 &&
            r.y + r.height >= y1 - 1e-6
          ) {
            return r.noteIndex;
          }
        }
        return null;
      };

      const xsLen = xs.length;
      const ysLen = ys.length;

      // Map noteIndex -> array of horizontal-run rects for later vertical merging
      const noteRowRects: Map<
        number,
        Array<{ x0: number; x1: number; y0: number; y1: number }>
      > = new Map();

      for (let j = 0; j < ysLen - 1; j++) {
        let i = 0;
        while (i < xsLen - 1) {
          const assigned = cellAssignedNote(i, j);
          if (assigned === null) {
            i++;
            continue;
          }
          const startI = i;
          i++;
          while (i < xsLen - 1 && cellAssignedNote(i, j) === assigned) i++;
          const endI = i - 1;
          const x0 = xs[startI];
          const x1 = xs[endI + 1];
          const y0 = ys[j];
          const y1 = ys[j + 1];
          const arr = noteRowRects.get(assigned) || [];
          arr.push({ x0, x1, y0, y1 });
          noteRowRects.set(assigned, arr);
        }
      }

      // Vertical merge: for each note, merge row rects that align horizontally
      const noteFinalRects: Map<
        number,
        Array<{ x: number; y: number; width: number; height: number }>
      > = new Map();
      for (const [noteIndex, runs] of noteRowRects.entries()) {
        // Sort runs by x0, then y0
        runs.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
        const mergedRuns: Array<{
          x0: number;
          x1: number;
          y0: number;
          y1: number;
        }> = [];
        for (const run of runs) {
          const last = mergedRuns.length
            ? mergedRuns[mergedRuns.length - 1]
            : null;
          if (
            last &&
            Math.abs(last.x0 - run.x0) < 1e-6 &&
            Math.abs(last.x1 - run.x1) < 1e-6 &&
            Math.abs(last.y1 - run.y0) < 1e-6
          ) {
            // extend vertically
            last.y1 = run.y1;
          } else {
            mergedRuns.push({ ...run });
          }
        }

        noteFinalRects.set(
          noteIndex,
          mergedRuns.map((r) => ({
            x: r.x0,
            y: r.y0,
            width: r.x1 - r.x0,
            height: r.y1 - r.y0,
          }))
        );
      }

      // Draw flattened rectangles and build per-note quadpoints list
      const perNoteQuads: Map<number, number[]> = new Map();
      const perNoteBBoxes: Map<
        number,
        { minX: number; minY: number; maxX: number; maxY: number }
      > = new Map();

      for (const [noteIndex, rectList] of noteFinalRects.entries()) {
        if (!rectList || rectList.length === 0) continue;
        // determine color from original rects list
        const color = rects.find((r) => r.noteIndex === noteIndex)?.color || {
          r: 1,
          g: 1,
          b: 0,
        };

        for (const pr of rectList) {
          // Draw flattened highlight
          page.drawRectangle({
            x: pr.x,
            y: pr.y,
            width: pr.width,
            height: pr.height,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.35,
            borderWidth: 0,
          });

          // Build quad for this rectangle
          const x1 = pr.x;
          const y1 = pr.y + pr.height; // top
          const x2 = pr.x + pr.width;
          const y2 = pr.y; // bottom
          const existing = perNoteQuads.get(noteIndex) || [];
          existing.push(x1, y1, x2, y1, x1, y2, x2, y2);
          perNoteQuads.set(noteIndex, existing);

          // update bbox
          const bbox = perNoteBBoxes.get(noteIndex);
          if (!bbox)
            perNoteBBoxes.set(noteIndex, {
              minX: pr.x,
              minY: pr.y,
              maxX: pr.x + pr.width,
              maxY: pr.y + pr.height,
            });
          else {
            bbox.minX = Math.min(bbox.minX, pr.x);
            bbox.minY = Math.min(bbox.minY, pr.y);
            bbox.maxX = Math.max(bbox.maxX, pr.x + pr.width);
            bbox.maxY = Math.max(bbox.maxY, pr.y + pr.height);
          }
        }
      }

      // Create native highlight + sticky note per note
      for (const [noteIndex, quadPoints] of perNoteQuads.entries()) {
        const bbox = perNoteBBoxes.get(noteIndex)!;
        const pageNotes = (opts.notes || []).filter(
          (n: any) => (n.page || n.pageNum || 1) - 1 === pageIndex
        );
        const note =
          pageNotes.find((_: any, idx: number) => idx === noteIndex) ||
          (opts.notes || [])[noteIndex];
        const color = rects.find((r) => r.noteIndex === noteIndex)?.color || {
          r: 1,
          g: 1,
          b: 0,
        };
        addHighlightAnnotation(
          page,
          bbox.minX,
          bbox.minY,
          bbox.maxX,
          bbox.maxY,
          quadPoints,
          color,
          undefined
        );
        if (note?.text) {
          const rect = computeTextRect(
            note.text,
            bbox.minX,
            bbox.maxY + 4,
            page,
            opts.commentFontSize
          );
          addTextAnnotation(
            page,
            rect.llx,
            rect.lly,
            rect.urx,
            rect.ury,
            note.text,
            color
          );
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Native PDF annotations (Text, Highlight, Ink) — create as annotation
  // dictionaries and attach to pages. We also keep the flattened drawings
  // above as a visual fallback for viewers that don't render annots well.
  // ------------------------------------------------------------------

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

      const color =
        note.color === "green"
          ? { r: 0.5, g: 0.85, b: 0.5 }
          : note.color === "blue"
            ? { r: 0.6, g: 0.8, b: 1 }
            : { r: 1, g: 1, b: 0 };

      // Create a single Highlight annotation for the grouped rects.
      addHighlightAnnotation(
        page,
        minX,
        minY,
        maxX,
        maxY,
        quadPointsArr,
        color,
        undefined
      );
      // Add one sticky Text annotation for the note contents (so it shows on hover)
      if (note.text) {
        // Place the sticky note slightly above the top-left of the bounding box
        const rect = computeTextRect(
          note.text,
          minX,
          maxY + 4,
          page,
          opts.commentFontSize
        );
        addTextAnnotation(
          page,
          rect.llx,
          rect.lly,
          rect.urx,
          rect.ury,
          note.text,
          color
        );
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
      const anchorX = pdfRect.x;
      const anchorY = pdfRect.y + pdfRect.height;

      // Add a Text (sticky) annotation with comment contents sized to text
      const ctext = c.text || "";
      const crect = computeTextRect(
        ctext,
        anchorX,
        anchorY + 12,
        page,
        opts.commentFontSize
      );
      addTextAnnotation(
        page,
        crect.llx,
        crect.lly,
        crect.urx,
        crect.ury,
        ctext,
        {
          r: 1,
          g: 0.85,
          b: 0,
        }
      );
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
          const x = isNormalized
            ? p.x * pageWidth
            : renderSize && renderSize.width
              ? p.x * (pageWidth / renderSize.width)
              : p.x;
          const y = isNormalized
            ? pageHeight - p.y * pageHeight
            : renderSize && renderSize.height
              ? pageHeight - p.y * (pageHeight / renderSize.height)
              : pageHeight - p.y;
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
        addInkAnnotation(
          page,
          llx,
          lly,
          urx,
          ury,
          [strokeCoords],
          { r: color.r, g: color.g, b: color.b },
          stroke.width || 1
        );
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
