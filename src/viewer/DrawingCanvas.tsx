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
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  enabled,
  color,
  strokeWidth,
  existingStrokes,
  onStrokesChange,
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enabled) return;

      const coords = getNormalizedCoordinates(e);
      if (!coords) return;

      setIsDrawing(true);
      setCurrentStroke([coords]);
    },
    [enabled, getNormalizedCoordinates]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enabled || !isDrawing) return;

      const coords = getNormalizedCoordinates(e);
      if (!coords) return;

      setCurrentStroke((prev) => [...prev, coords]);
    },
    [enabled, isDrawing, getNormalizedCoordinates]
  );

  const handleMouseUp = useCallback(() => {
    if (!enabled || !isDrawing) return;

    if (currentStroke.length > 1) {
      const newStroke: DrawingStroke = {
        points: currentStroke,
        color,
        width: strokeWidth,
      };

      onStrokesChange([...existingStrokes, newStroke]);
    }

    setIsDrawing(false);
    setCurrentStroke([]);
  }, [enabled, isDrawing, currentStroke, existingStrokes, color, strokeWidth, onStrokesChange]);

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
      className={`absolute top-0 left-0 z-30 ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
};
