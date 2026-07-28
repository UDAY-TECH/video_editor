import { useEffect, useRef, useState } from 'react';

interface SplitterProps {
  // 'horizontal' = a vertical bar the user drags left/right (resizes a width);
  // 'vertical' = a horizontal bar the user drags up/down (resizes a height).
  direction: 'horizontal' | 'vertical';
  onResize: (deltaPx: number) => void;
}

export function Splitter({ direction, onResize }: SplitterProps): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const lastPosRef = useRef(0);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e: MouseEvent): void {
      const pos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = pos - lastPosRef.current;
      lastPosRef.current = pos;
      onResizeRef.current(delta);
    }
    function handleMouseUp(): void {
      setDragging(false);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, direction]);

  return (
    <div
      className={
        direction === 'horizontal'
          ? 'w-1 shrink-0 cursor-col-resize hover:bg-blue-600 bg-neutral-800'
          : 'h-1 shrink-0 cursor-row-resize hover:bg-blue-600 bg-neutral-800'
      }
      onMouseDown={(e) => {
        lastPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
        setDragging(true);
      }}
    />
  );
}
