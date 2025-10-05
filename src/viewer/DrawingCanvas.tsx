import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DrawingStroke } from '../db';

interface DrawingCanvasProps {
  width: number;
  height: number;
  enabled: boolean;
  color: string;
  strokeWidth: number;
  existingStrokes: DrawingStroke[];
  onStrokesChange: (strokes: DrawingStroke[]) => void;
  isEraserMode: boolean;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  enabled,
  color,
  strokeWidth,
  existingStrokes,
  onStrokesChange,
  isEraserMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);

  // Redraw canvas whenever strokes or dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw all existing strokes
    existingStrokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      const firstPoint = stroke.points[0];
      ctx.moveTo(firstPoint.x * width, firstPoint.y * height);

      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        ctx.lineTo(point.x * width, point.y * height);
      }

      ctx.stroke();
    });

    // Draw current stroke being drawn
    if (currentStroke.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x * width, currentStroke[0].y * height);

      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x * width, currentStroke[i].y * height);
      }

      ctx.stroke();
    }
  }, [existingStrokes, currentStroke, width, height, color, strokeWidth]);

  const getNormalizedCoordinates = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / width;
      const y = (e.clientY - rect.top) / height;

      return { x, y };
    },
    [width, height]
  );

  // Helper function to check if a point is near a stroke
  const isPointNearStroke = useCallback(
    (point: { x: number; y: number }, stroke: DrawingStroke, threshold: number = 0.01) => {
      // Convert threshold to normalized coordinates (0.01 = 1% of dimension)
      for (let i = 0; i < stroke.points.length - 1; i++) {
        const p1 = stroke.points[i];
        const p2 = stroke.points[i + 1];

        // Calculate distance from point to line segment
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) {
          // Points are the same, check distance to point
          const dist = Math.sqrt(
            Math.pow(point.x - p1.x, 2) + Math.pow(point.y - p1.y, 2)
          );
          if (dist < threshold) return true;
          continue;
        }

        // Calculate projection of point onto line segment
        let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));

        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;

        const dist = Math.sqrt(
          Math.pow(point.x - projX, 2) + Math.pow(point.y - projY, 2)
        );

        if (dist < threshold) return true;
      }

      return false;
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enabled) return;

      const coords = getNormalizedCoordinates(e);
      if (!coords) return;

      if (isEraserMode) {
        // Eraser mode: find and remove strokes that are touched
        const updatedStrokes = existingStrokes.filter(
          (stroke) => !isPointNearStroke(coords, stroke, 0.015)
        );

        if (updatedStrokes.length !== existingStrokes.length) {
          // A stroke was erased
          onStrokesChange(updatedStrokes);
        }
      } else {
        // Drawing mode: start a new stroke
        setIsDrawing(true);
        setCurrentStroke([coords]);
      }
    },
    [enabled, isEraserMode, getNormalizedCoordinates, existingStrokes, isPointNearStroke, onStrokesChange]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enabled) return;

      const coords = getNormalizedCoordinates(e);
      if (!coords) return;

      if (isEraserMode && isDrawing) {
        // Eraser mode: continuously erase strokes as mouse moves
        const updatedStrokes = existingStrokes.filter(
          (stroke) => !isPointNearStroke(coords, stroke, 0.015)
        );

        if (updatedStrokes.length !== existingStrokes.length) {
          onStrokesChange(updatedStrokes);
        }
      } else if (!isEraserMode && isDrawing) {
        // Drawing mode: add points to current stroke
        setCurrentStroke((prev) => [...prev, coords]);
      }
    },
    [enabled, isEraserMode, isDrawing, getNormalizedCoordinates, existingStrokes, isPointNearStroke, onStrokesChange]
  );

  const handleMouseUp = useCallback(() => {
    if (!enabled || !isDrawing) return;

    if (!isEraserMode && currentStroke.length > 1) {
      // Only save strokes in drawing mode
      const newStroke: DrawingStroke = {
        points: currentStroke,
        color,
        width: strokeWidth,
      };

      onStrokesChange([...existingStrokes, newStroke]);
    }

    setIsDrawing(false);
    setCurrentStroke([]);
  }, [enabled, isDrawing, isEraserMode, currentStroke, existingStrokes, color, strokeWidth, onStrokesChange]);

  const handleMouseLeave = useCallback(() => {
    if (isDrawing) {
      handleMouseUp();
    }
  }, [isDrawing, handleMouseUp]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className={`absolute top-0 left-0 z-30 ${enabled ? (isEraserMode ? 'cursor-not-allowed' : 'cursor-crosshair') : 'pointer-events-none'}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
};
